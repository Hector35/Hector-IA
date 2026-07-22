from __future__ import annotations
import argparse, hashlib, json, math, os, platform, subprocess, time
from pathlib import Path
import torch
from peft import LoraConfig, TaskType, get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM, AutoTokenizer, set_seed

MODEL='HuggingFaceTB/SmolLM2-360M-Instruct'
REVISION='cbcad7f4d160a10174f725b968ab6faf2a76399e'

def args():
 p=argparse.ArgumentParser(); p.add_argument('--output-dir',default='artifacts/hector-asi-smollm360-v1'); p.add_argument('--epochs',type=int,default=1); p.add_argument('--max-length',type=int,default=96); p.add_argument('--lr',type=float,default=3e-4); p.add_argument('--seed',type=int,default=35); return p.parse_args()

def read(path):
 rows=[json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()]
 if not rows or any(r.get('verification',{}).get('verified') is not True for r in rows): raise ValueError(f'unverified data: {path}')
 ids=[r['id'] for r in rows]
 if len(ids)!=len(set(ids)): raise ValueError(f'duplicate ids: {path}')
 return rows

def render(tok,row):
 msgs=row['messages']
 if hasattr(tok,'apply_chat_template') and tok.chat_template:
  return tok.apply_chat_template(msgs,tokenize=False,add_generation_prompt=False)
 return '\n'.join(f"<|{m['role']}|>\n{m['content']}" for m in msgs)

def encode(tok,rows,n):
 out=[]
 for r in rows:
  b=tok(render(tok,r),return_tensors='pt',truncation=True,max_length=n)
  b['labels']=b['input_ids'].clone(); out.append(b)
 return out

def loss(model,batches):
 model.eval(); vals=[]
 with torch.no_grad():
  for b in batches: vals.append(float(model(**b).loss))
 return sum(vals)/len(vals)

def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''): h.update(c)
 return h.hexdigest()

def main():
 a=args(); set_seed(a.seed); torch.use_deterministic_algorithms(True); torch.set_num_threads(1); torch.set_num_interop_threads(1)
 trainp='model/hector-asi/data/smollm360-sft-v1.jsonl'; valp='model/hector-asi/evals/smollm360-held-out-v1.jsonl'
 tr,va=read(trainp),read(valp)
 if {r['id'] for r in tr}&{r['id'] for r in va}: raise ValueError('contamination')
 root=Path(a.output_dir); adapter=root/'adapter'; root.mkdir(parents=True,exist_ok=True); started=time.time()
 tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True); tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True); base.config.use_cache=False
 tb,vb=encode(tok,tr,a.max_length),encode(tok,va,a.max_length); base_loss=loss(base,vb)
 cfg=LoraConfig(r=8,lora_alpha=16,lora_dropout=0.0,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=['q_proj','v_proj'])
 model=get_peft_model(base,cfg); pars=[p for p in model.parameters() if p.requires_grad]
 before=torch.cat([p.detach().flatten().clone() for p in pars]); opt=AdamW(pars,lr=a.lr); steps=[]
 model.train()
 for _ in range(a.epochs):
  for b in tb:
   opt.zero_grad(set_to_none=True); l=model(**b).loss
   if not torch.isfinite(l): raise RuntimeError('nonfinite loss')
   l.backward(); torch.nn.utils.clip_grad_norm_(pars,1.0); opt.step(); steps.append(float(l))
 delta=float(torch.linalg.vector_norm(torch.cat([p.detach().flatten() for p in pars])-before))
 if not math.isfinite(delta) or delta<=0: raise RuntimeError('weights unchanged')
 cand_loss=loss(model,vb); adapter.mkdir(parents=True,exist_ok=True); model.save_pretrained(adapter,safe_serialization=True); tok.save_pretrained(adapter)
 weights=adapter/'adapter_model.safetensors'
 metrics={'schemaVersion':'1.0.0','experimentId':'hector-asi-smollm360-v1','status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'LoRA SFT','dataset':{'trainPath':trainp,'trainSha256':sha(trainp),'trainExamples':len(tr),'validationPath':valp,'validationSha256':sha(valp),'validationExamples':len(va),'privateUserData':False},'hyperparameters':{'epochs':a.epochs,'maxLength':a.max_length,'learningRate':a.lr,'seed':a.seed,'loraRank':8,'loraAlpha':16,'loraDropout':0.0,'targetModules':['q_proj','v_proj']},'results':{'steps':len(steps),'firstTrainLoss':steps[0],'finalTrainLoss':steps[-1],'baseValidationLoss':base_loss,'candidateValidationLoss':cand_loss,'validationLossDelta':cand_loss-base_loss,'relativeValidationImprovement':(base_loss-cand_loss)/base_loss,'parameterDeltaL2':delta,'trainableParameters':sum(p.numel() for p in pars),'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)},'runtime':{'seconds':time.time()-started,'python':platform.python_version(),'torch':torch.__version__,'cpuCount':os.cpu_count(),'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n')
 files=sorted(p for p in root.rglob('*') if p.is_file()); (root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files))
 (root/'run-manifest.json').write_text(json.dumps({'experimentId':metrics['experimentId'],'files':{str(p.relative_to(root)):sha(p) for p in files},'rollback':'Do not load or delete adapter; frozen base remains unchanged.'},indent=2,sort_keys=True)+'\n')
 print(json.dumps(metrics,indent=2,sort_keys=True))
if __name__=='__main__': main()
