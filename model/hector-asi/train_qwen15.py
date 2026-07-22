from __future__ import annotations
import argparse, hashlib, json, math, os, platform, time
from pathlib import Path
import torch
from peft import LoraConfig, TaskType, get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM, AutoTokenizer, set_seed

MODEL='Qwen/Qwen2.5-1.5B-Instruct'
REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
DEFAULT_TRAIN='model/hector-asi/data/qwen05-sft-v2.jsonl'
DEFAULT_VALIDATION='model/hector-asi/evals/qwen05-held-out-v2.jsonl'

def parse_args():
 p=argparse.ArgumentParser()
 p.add_argument('--output-dir',default='artifacts/hector-asi-qwen15-v1')
 p.add_argument('--train-file',default=DEFAULT_TRAIN)
 p.add_argument('--validation-file',default=DEFAULT_VALIDATION)
 p.add_argument('--experiment-id',default='hector-asi-qwen15-v1')
 p.add_argument('--epochs',type=int,default=1)
 p.add_argument('--max-length',type=int,default=64)
 p.add_argument('--lr',type=float,default=2e-4)
 p.add_argument('--seed',type=int,default=35)
 return p.parse_args()

def read(path):
 rows=[json.loads(x) for x in Path(path).read_text(encoding='utf-8').splitlines() if x.strip()]
 if not rows or any(r.get('verification',{}).get('verified') is not True for r in rows): raise ValueError(f'unverified data: {path}')
 ids=[r['id'] for r in rows]
 if len(ids)!=len(set(ids)): raise ValueError(f'duplicate ids: {path}')
 prompts=[' '.join(m.get('content','').lower().split()) for r in rows for m in r.get('messages',[]) if m.get('role')=='user']
 if len(prompts)!=len(set(prompts)): raise ValueError(f'duplicate normalized prompts: {path}')
 return rows

def render(tok,row): return tok.apply_chat_template(row['messages'],tokenize=False,add_generation_prompt=False)
def encode(tok,rows,n):
 out=[]
 for row in rows:
  b=tok(render(tok,row),return_tensors='pt',truncation=True,max_length=n)
  b['labels']=b['input_ids'].clone(); out.append(b)
 return out

def mean_loss(model,batches):
 model.eval(); vals=[]
 with torch.no_grad():
  for b in batches: vals.append(float(model(**b).loss.detach().cpu()))
 return sum(vals)/len(vals)

def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''): h.update(chunk)
 return h.hexdigest()

def main():
 a=parse_args(); set_seed(a.seed); torch.use_deterministic_algorithms(True); torch.set_num_threads(1); torch.set_num_interop_threads(1)
 tr,va=read(a.train_file),read(a.validation_file)
 if {r['id'] for r in tr}&{r['id'] for r in va}: raise ValueError('train/validation contamination')
 train_prompts={' '.join(m.get('content','').lower().split()) for r in tr for m in r['messages'] if m['role']=='user'}
 val_prompts={' '.join(m.get('content','').lower().split()) for r in va for m in r['messages'] if m['role']=='user'}
 if train_prompts&val_prompts: raise ValueError('normalized prompt contamination')
 root=Path(a.output_dir); adapter=root/'adapter'; root.mkdir(parents=True,exist_ok=True); started=time.time()
 tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True); tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True); base.config.use_cache=False
 tb,vb=encode(tok,tr,a.max_length),encode(tok,va,a.max_length); base_loss=mean_loss(base,vb)
 cfg=LoraConfig(r=4,lora_alpha=8,lora_dropout=0.0,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=['q_proj','v_proj'])
 model=get_peft_model(base,cfg); pars=[p for p in model.parameters() if p.requires_grad]
 before=torch.cat([p.detach().flatten().clone() for p in pars]); opt=AdamW(pars,lr=a.lr); losses=[]
 model.train()
 for _ in range(a.epochs):
  for b in tb:
   opt.zero_grad(set_to_none=True); loss=model(**b).loss
   if not torch.isfinite(loss): raise RuntimeError('non-finite loss')
   loss.backward(); torch.nn.utils.clip_grad_norm_(pars,1.0); opt.step(); losses.append(float(loss.detach().cpu()))
 delta=float(torch.linalg.vector_norm(torch.cat([p.detach().flatten() for p in pars])-before))
 if not math.isfinite(delta) or delta<=0: raise RuntimeError('weights unchanged')
 cand_loss=mean_loss(model,vb); adapter.mkdir(parents=True,exist_ok=True); model.save_pretrained(adapter,safe_serialization=True); tok.save_pretrained(adapter)
 weights=adapter/'adapter_model.safetensors'
 metrics={'schemaVersion':'1.0.0','experimentId':a.experiment_id,'status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'LoRA SFT','dataset':{'trainPath':a.train_file,'trainSha256':sha(a.train_file),'trainExamples':len(tr),'validationPath':a.validation_file,'validationSha256':sha(a.validation_file),'validationExamples':len(va),'privateUserData':False,'deduplicated':True,'splitContaminationChecked':True},'hyperparameters':{'epochs':a.epochs,'maxLength':a.max_length,'learningRate':a.lr,'seed':a.seed,'loraRank':4,'loraAlpha':8,'loraDropout':0.0,'targetModules':['q_proj','v_proj']},'results':{'steps':len(losses),'firstTrainLoss':losses[0],'finalTrainLoss':losses[-1],'baseValidationLoss':base_loss,'candidateValidationLoss':cand_loss,'validationLossDelta':cand_loss-base_loss,'relativeValidationImprovement':(base_loss-cand_loss)/base_loss,'parameterDeltaL2':delta,'trainableParameters':sum(p.numel() for p in pars),'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)},'runtime':{'seconds':time.time()-started,'python':platform.python_version(),'torch':torch.__version__,'cpuCount':os.cpu_count(),'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n',encoding='utf-8')
 files=sorted(p for p in root.rglob('*') if p.is_file()); (root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files),encoding='utf-8')
 (root/'run-manifest.json').write_text(json.dumps({'experimentId':metrics['experimentId'],'files':{str(p.relative_to(root)):sha(p) for p in files},'rollback':'Do not load or delete adapter; frozen base remains unchanged.'},indent=2,sort_keys=True)+'\n',encoding='utf-8')
 print(json.dumps(metrics,indent=2,sort_keys=True))
if __name__=='__main__': main()
