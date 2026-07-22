from __future__ import annotations
import argparse, hashlib, json, math, os, platform, time
from pathlib import Path
import torch
import torch.nn.functional as F
from peft import LoraConfig, TaskType, get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM, AutoTokenizer, set_seed

MODEL='Qwen/Qwen2.5-0.5B-Instruct'
REVISION='a338b55dd21219a5f4da42bc11a9313d1a27d4cc'
TRAIN='model/hector-asi/data/qwen05-dpo-v1.jsonl'
VALIDATION='model/hector-asi/evals/qwen05-dpo-held-out-v1.jsonl'

def args():
 p=argparse.ArgumentParser(); p.add_argument('--output-dir',default='artifacts/hector-asi-qwen05-dpo-v1'); p.add_argument('--epochs',type=int,default=2); p.add_argument('--max-length',type=int,default=128); p.add_argument('--lr',type=float,default=8e-5); p.add_argument('--beta',type=float,default=0.1); p.add_argument('--seed',type=int,default=35); return p.parse_args()

def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''): h.update(chunk)
 return h.hexdigest()

def read(path):
 rows=[json.loads(x) for x in Path(path).read_text(encoding='utf-8').splitlines() if x.strip()]
 if not rows or any(r.get('verification',{}).get('verified') is not True for r in rows): raise ValueError(f'unverified data: {path}')
 ids=[r['id'] for r in rows]
 if len(ids)!=len(set(ids)): raise ValueError(f'duplicate ids: {path}')
 for r in rows:
  if not all(isinstance(r.get(k),str) and r[k].strip() for k in ('prompt','chosen','rejected')): raise ValueError(f'invalid preference row: {r.get("id")}')
 return rows

def encode(tok,prompt,response,max_length):
 prefix=tok.apply_chat_template([{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True)
 full=prefix+response+tok.eos_token
 enc=tok(full,return_tensors='pt',truncation=True,max_length=max_length)
 prefix_ids=tok(prefix,return_tensors='pt',truncation=True,max_length=max_length)['input_ids']
 labels=enc['input_ids'].clone(); labels[:,:min(prefix_ids.shape[1],labels.shape[1])]=-100
 return {'input_ids':enc['input_ids'],'attention_mask':enc['attention_mask'],'labels':labels}

def logp(model,batch):
 out=model(input_ids=batch['input_ids'],attention_mask=batch['attention_mask'])
 logits=out.logits[:,:-1,:]; labels=batch['labels'][:,1:]
 mask=labels.ne(-100); safe=labels.masked_fill(~mask,0)
 token=F.log_softmax(logits,dim=-1).gather(-1,safe.unsqueeze(-1)).squeeze(-1)
 return (token*mask).sum(dim=-1).mean()

def pair_batches(tok,rows,max_length):
 return [(encode(tok,r['prompt'],r['chosen'],max_length),encode(tok,r['prompt'],r['rejected'],max_length)) for r in rows]

def margins(model,pairs):
 model.eval(); vals=[]
 with torch.no_grad():
  for ch,rj in pairs: vals.append(float((logp(model,ch)-logp(model,rj)).cpu()))
 return vals

def main():
 a=args(); set_seed(a.seed); torch.use_deterministic_algorithms(True); torch.set_num_threads(1); torch.set_num_interop_threads(1)
 tr,va=read(TRAIN),read(VALIDATION)
 if {r['id'] for r in tr}&{r['id'] for r in va}: raise ValueError('train/validation contamination')
 root=Path(a.output_dir); adapter=root/'adapter'; root.mkdir(parents=True,exist_ok=True); started=time.time()
 tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True); tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True); base.config.use_cache=False
 train_pairs=pair_batches(tok,tr,a.max_length); val_pairs=pair_batches(tok,va,a.max_length)
 ref_train=[float(x) for x in margins(base,train_pairs)]; base_val=margins(base,val_pairs)
 cfg=LoraConfig(r=8,lora_alpha=16,lora_dropout=0.0,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=['q_proj','v_proj'])
 model=get_peft_model(base,cfg); pars=[p for p in model.parameters() if p.requires_grad]
 before=torch.cat([p.detach().flatten().clone() for p in pars]); opt=AdamW(pars,lr=a.lr); losses=[]
 model.train()
 for _ in range(a.epochs):
  for i,(ch,rj) in enumerate(train_pairs):
   opt.zero_grad(set_to_none=True)
   policy_margin=logp(model,ch)-logp(model,rj)
   advantage=policy_margin-policy_margin.new_tensor(ref_train[i])
   loss=-F.logsigmoid(a.beta*advantage)
   if not torch.isfinite(loss): raise RuntimeError('non-finite DPO loss')
   loss.backward(); torch.nn.utils.clip_grad_norm_(pars,1.0); opt.step(); losses.append(float(loss.detach().cpu()))
 delta=float(torch.linalg.vector_norm(torch.cat([p.detach().flatten() for p in pars])-before))
 if not math.isfinite(delta) or delta<=0: raise RuntimeError('weights unchanged')
 candidate_val=margins(model,val_pairs)
 base_acc=sum(x>0 for x in base_val)/len(base_val); cand_acc=sum(x>0 for x in candidate_val)/len(candidate_val)
 adapter.mkdir(parents=True,exist_ok=True); model.save_pretrained(adapter,safe_serialization=True); tok.save_pretrained(adapter)
 weights=adapter/'adapter_model.safetensors'
 metrics={'schemaVersion':'1.0.0','experimentId':'hector-asi-qwen05-dpo-v1','status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'LoRA DPO','dataset':{'trainPath':TRAIN,'trainSha256':sha(TRAIN),'trainPairs':len(tr),'validationPath':VALIDATION,'validationSha256':sha(VALIDATION),'validationPairs':len(va),'privateUserData':False},'hyperparameters':{'epochs':a.epochs,'maxLength':a.max_length,'learningRate':a.lr,'beta':a.beta,'seed':a.seed,'loraRank':8,'loraAlpha':16,'targetModules':['q_proj','v_proj']},'results':{'steps':len(losses),'firstDpoLoss':losses[0],'finalDpoLoss':losses[-1],'basePreferenceAccuracy':base_acc,'candidatePreferenceAccuracy':cand_acc,'baseMeanPreferenceMargin':sum(base_val)/len(base_val),'candidateMeanPreferenceMargin':sum(candidate_val)/len(candidate_val),'preferenceMarginDelta':sum(candidate_val)/len(candidate_val)-sum(base_val)/len(base_val),'parameterDeltaL2':delta,'trainableParameters':sum(p.numel() for p in pars),'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)},'runtime':{'seconds':time.time()-started,'python':platform.python_version(),'torch':torch.__version__,'cpuCount':os.cpu_count(),'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n',encoding='utf-8')
 files=sorted(p for p in root.rglob('*') if p.is_file()); (root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files),encoding='utf-8')
 (root/'run-manifest.json').write_text(json.dumps({'experimentId':metrics['experimentId'],'files':{str(p.relative_to(root)):sha(p) for p in files},'rollback':'Do not load or delete adapter; frozen base remains unchanged.'},indent=2,sort_keys=True)+'\n',encoding='utf-8')
 print(json.dumps(metrics,indent=2,sort_keys=True))
if __name__=='__main__': main()
