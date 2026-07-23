from __future__ import annotations
import argparse,hashlib,json,math,os,platform,time
from pathlib import Path
import torch
from peft import LoraConfig,TaskType,get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed
MODEL='Qwen/Qwen2.5-1.5B-Instruct';REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
def cli():
 p=argparse.ArgumentParser();p.add_argument('--output-dir',required=True);p.add_argument('--train-files',nargs='+',required=True);p.add_argument('--validation-files',nargs='+',required=True);p.add_argument('--experiment-id',default='hector-asi-qwen15-v14');p.add_argument('--epochs',type=int,default=2);p.add_argument('--max-length',type=int,default=112);p.add_argument('--lr',type=float,default=4e-5);p.add_argument('--seed',type=int,default=35);return p.parse_args()
def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()
def read(paths):
 rows=[]
 for path in paths:rows += [json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()]
 if not rows or any(r.get('verification',{}).get('verified') is not True for r in rows):raise ValueError('unverified data')
 ids=[r['id'] for r in rows];prompts=[' '.join(m.get('content','').lower().split()) for r in rows for m in r.get('messages',[]) if m.get('role')=='user']
 if len(ids)!=len(set(ids)) or len(prompts)!=len(set(prompts)):raise ValueError('duplicates')
 if any(r['messages'][-1].get('role')!='assistant' for r in rows):raise ValueError('assistant target missing')
 return rows
def full(tok,row,n):
 b=tok(tok.apply_chat_template(row['messages'],tokenize=False,add_generation_prompt=False),return_tensors='pt',truncation=True,max_length=n);b['labels']=b['input_ids'].clone();return b
def assistant(tok,row,n):
 b=full(tok,row,n);prefix=tok(tok.apply_chat_template(row['messages'][:-1],tokenize=False,add_generation_prompt=True),return_tensors='pt',truncation=True,max_length=n);k=min(prefix['input_ids'].shape[1],max(0,b['labels'].shape[1]-1));b['labels'][:,:k]=-100
 if not torch.any(b['labels']!=-100):raise ValueError(f'no assistant tokens: {row["id"]}')
 return b
def loss(model,batches):
 model.eval();vals=[]
 with torch.no_grad():
  for b in batches:vals.append(float(model(**b).loss.detach().cpu()))
 return sum(vals)/len(vals)
def main():
 a=cli();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1);tr,va=read(a.train_files),read(a.validation_files)
 if {r['id'] for r in tr}&{r['id'] for r in va}:raise ValueError('split contamination')
 root=Path(a.output_dir);adapter=root/'adapter';root.mkdir(parents=True,exist_ok=True);started=time.time();tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True);base.config.use_cache=False;tb=[assistant(tok,r,a.max_length) for r in tr];vf=[full(tok,r,a.max_length) for r in va];va_only=[assistant(tok,r,a.max_length) for r in va];base_full=loss(base,vf);base_assistant=loss(base,va_only)
 cfg=LoraConfig(r=32,lora_alpha=64,lora_dropout=.05,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=['q_proj','k_proj','v_proj','o_proj']);model=get_peft_model(base,cfg);pars=[p for p in model.parameters() if p.requires_grad];before=torch.cat([p.detach().flatten().clone() for p in pars]);opt=AdamW(pars,lr=a.lr,weight_decay=.01);train_losses=[];model.train()
 for _ in range(a.epochs):
  for b in tb:
   opt.zero_grad(set_to_none=True);z=model(**b).loss
   if not torch.isfinite(z):raise RuntimeError('non-finite loss')
   z.backward();torch.nn.utils.clip_grad_norm_(pars,1.0);opt.step();train_losses.append(float(z.detach().cpu()))
 delta=float(torch.linalg.vector_norm(torch.cat([p.detach().flatten() for p in pars])-before));cand_full=loss(model,vf);cand_assistant=loss(model,va_only)
 if not math.isfinite(delta) or delta<=0:raise RuntimeError('weights unchanged')
 adapter.mkdir(parents=True,exist_ok=True);model.save_pretrained(adapter,safe_serialization=True);tok.save_pretrained(adapter);weights=adapter/'adapter_model.safetensors';ds={'trainPaths':a.train_files,'trainSha256':{p:sha(p) for p in a.train_files},'trainExamples':len(tr),'validationPaths':a.validation_files,'validationSha256':{p:sha(p) for p in a.validation_files},'validationExamples':len(va),'privateUserData':False};metrics={'schemaVersion':'1.0.0','experimentId':a.experiment_id,'status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'LoRA SFT assistant-only loss','dataset':ds,'hyperparameters':{'epochs':a.epochs,'maxLength':a.max_length,'learningRate':a.lr,'weightDecay':.01,'seed':a.seed,'loraRank':32,'loraAlpha':64,'loraDropout':.05,'lossMask':'assistant-only'},'results':{'steps':len(train_losses),'firstTrainLoss':train_losses[0],'finalTrainLoss':train_losses[-1],'baseValidationLoss':base_full,'candidateValidationLoss':cand_full,'relativeValidationImprovement':(base_full-cand_full)/base_full,'baseAssistantOnlyValidationLoss':base_assistant,'candidateAssistantOnlyValidationLoss':cand_assistant,'assistantOnlyRelativeImprovement':(base_assistant-cand_assistant)/base_assistant,'parameterDeltaL2':delta,'trainableParameters':sum(p.numel() for p in pars),'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)},'runtime':{'seconds':time.time()-started,'python':platform.python_version(),'torch':torch.__version__,'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}};(root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n');files=sorted(p for p in root.rglob('*') if p.is_file());(root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files));(root/'run-manifest.json').write_text(json.dumps({'experimentId':a.experiment_id,'files':{str(p.relative_to(root)):sha(p) for p in files},'rollback':'Do not load or delete adapter; frozen base remains unchanged.'},indent=2,sort_keys=True)+'\n');print(json.dumps(metrics,indent=2,sort_keys=True))
if __name__=='__main__':main()
