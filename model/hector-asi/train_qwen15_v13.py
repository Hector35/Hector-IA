from __future__ import annotations
import argparse, hashlib, json, math, os, platform, time
from pathlib import Path
import torch
from peft import LoraConfig, TaskType, get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM, AutoTokenizer, set_seed

MODEL='Qwen/Qwen2.5-1.5B-Instruct'
REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
PREVIOUS_LEADER_LOSS=2.2110140224297843

def args():
 p=argparse.ArgumentParser()
 p.add_argument('--output-dir',required=True)
 p.add_argument('--train-file',required=True)
 p.add_argument('--validation-file',required=True)
 p.add_argument('--experiment-id',default='hector-asi-qwen15-v13')
 p.add_argument('--epochs',type=int,default=3)
 p.add_argument('--max-length',type=int,default=112)
 p.add_argument('--lr',type=float,default=4e-5)
 p.add_argument('--seed',type=int,default=35)
 return p.parse_args()

def read(path):
 rows=[json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()]
 if not rows or any(r.get('verification',{}).get('verified') is not True for r in rows): raise ValueError(f'unverified data: {path}')
 ids=[r['id'] for r in rows]
 prompts=[' '.join(m.get('content','').lower().split()) for r in rows for m in r.get('messages',[]) if m.get('role')=='user']
 if len(ids)!=len(set(ids)) or len(prompts)!=len(set(prompts)): raise ValueError(f'duplicates: {path}')
 for row in rows:
  if not row.get('messages') or row['messages'][-1].get('role')!='assistant': raise ValueError(f'last message must be assistant: {row.get("id")}')
 return rows

def render(tok,row):
 return tok.apply_chat_template(row['messages'],tokenize=False,add_generation_prompt=False)

def encode_full(tok,rows,n):
 out=[]
 for row in rows:
  b=tok(render(tok,row),return_tensors='pt',truncation=True,max_length=n)
  b['labels']=b['input_ids'].clone()
  out.append(b)
 return out

def encode_assistant_only(tok,rows,n):
 out=[]
 for row in rows:
  full=tok(render(tok,row),return_tensors='pt',truncation=True,max_length=n)
  prefix_text=tok.apply_chat_template(row['messages'][:-1],tokenize=False,add_generation_prompt=True)
  prefix=tok(prefix_text,return_tensors='pt',truncation=True,max_length=n)
  labels=full['input_ids'].clone()
  prefix_len=min(prefix['input_ids'].shape[1],max(0,labels.shape[1]-1))
  labels[:,:prefix_len]=-100
  if not torch.any(labels!=-100): raise ValueError(f'no assistant tokens remain after truncation: {row["id"]}')
  full['labels']=labels
  out.append(full)
 return out

def loss(model,batches):
 model.eval(); vals=[]
 with torch.no_grad():
  for b in batches: vals.append(float(model(**b).loss.detach().cpu()))
 return sum(vals)/len(vals)

def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''): h.update(c)
 return h.hexdigest()

def main():
 a=args(); set_seed(a.seed); torch.use_deterministic_algorithms(True); torch.set_num_threads(1); torch.set_num_interop_threads(1)
 tr,va=read(a.train_file),read(a.validation_file)
 if {r['id'] for r in tr}&{r['id'] for r in va}: raise ValueError('split contamination')
 root=Path(a.output_dir); adapter=root/'adapter'; root.mkdir(parents=True,exist_ok=True); started=time.time()
 tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True); tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True); base.config.use_cache=False
 train_batches=encode_assistant_only(tok,tr,a.max_length)
 validation_full=encode_full(tok,va,a.max_length)
 validation_assistant=encode_assistant_only(tok,va,a.max_length)
 base_full_loss=loss(base,validation_full); base_assistant_loss=loss(base,validation_assistant)
 cfg=LoraConfig(r=32,lora_alpha=64,lora_dropout=0.05,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=['q_proj','k_proj','v_proj','o_proj'])
 model=get_peft_model(base,cfg); pars=[p for p in model.parameters() if p.requires_grad]
 before=torch.cat([p.detach().flatten().clone() for p in pars]); opt=AdamW(pars,lr=a.lr); losses=[]; model.train()
 for _ in range(a.epochs):
  for b in train_batches:
   opt.zero_grad(set_to_none=True); z=model(**b).loss
   if not torch.isfinite(z): raise RuntimeError('non-finite loss')
   z.backward(); torch.nn.utils.clip_grad_norm_(pars,1.0); opt.step(); losses.append(float(z.detach().cpu()))
 delta=float(torch.linalg.vector_norm(torch.cat([p.detach().flatten() for p in pars])-before))
 candidate_full_loss=loss(model,validation_full); candidate_assistant_loss=loss(model,validation_assistant)
 if not math.isfinite(delta) or delta<=0: raise RuntimeError('weights unchanged')
 adapter.mkdir(parents=True,exist_ok=True); model.save_pretrained(adapter,safe_serialization=True); tok.save_pretrained(adapter)
 weights=adapter/'adapter_model.safetensors'
 metrics={'schemaVersion':'1.0.0','experimentId':a.experiment_id,'status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'LoRA SFT with assistant-only token loss','dataset':{'trainPath':a.train_file,'trainSha256':sha(a.train_file),'trainExamples':len(tr),'validationPath':a.validation_file,'validationSha256':sha(a.validation_file),'validationExamples':len(va),'privateUserData':False},'hyperparameters':{'epochs':a.epochs,'maxLength':a.max_length,'learningRate':a.lr,'seed':a.seed,'loraRank':32,'loraAlpha':64,'loraDropout':0.05,'targetModules':['q_proj','k_proj','v_proj','o_proj'],'lossMask':'assistant-only'},'results':{'steps':len(losses),'firstTrainLoss':losses[0],'finalTrainLoss':losses[-1],'baseValidationLoss':base_full_loss,'candidateValidationLoss':candidate_full_loss,'relativeValidationImprovement':(base_full_loss-candidate_full_loss)/base_full_loss,'baseAssistantOnlyValidationLoss':base_assistant_loss,'candidateAssistantOnlyValidationLoss':candidate_assistant_loss,'assistantOnlyRelativeImprovement':(base_assistant_loss-candidate_assistant_loss)/base_assistant_loss,'previousLeaderValidationLoss':PREVIOUS_LEADER_LOSS,'parameterDeltaL2':delta,'trainableParameters':sum(p.numel() for p in pars),'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)},'runtime':{'seconds':time.time()-started,'python':platform.python_version(),'torch':torch.__version__,'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n')
 files=sorted(p for p in root.rglob('*') if p.is_file())
 (root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files))
 (root/'run-manifest.json').write_text(json.dumps({'experimentId':a.experiment_id,'files':{str(p.relative_to(root)):sha(p) for p in files},'rollback':'Do not load or delete adapter; frozen base remains unchanged.'},indent=2,sort_keys=True)+'\n')
 print(json.dumps(metrics,indent=2,sort_keys=True))

if __name__=='__main__': main()
