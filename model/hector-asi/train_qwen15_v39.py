from __future__ import annotations
import argparse,hashlib,json,math,os,platform,time
from pathlib import Path
import torch
import torch.nn.functional as F
from peft import LoraConfig,TaskType,get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed
MODEL='Qwen/Qwen2.5-1.5B-Instruct';REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306';TARGETS=['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj']
def cli():
 p=argparse.ArgumentParser();p.add_argument('--output-dir',required=True);p.add_argument('--train-files',nargs='+',required=True);p.add_argument('--validation-files',nargs='+',required=True);p.add_argument('--test-files',nargs='+',required=True);p.add_argument('--experiment-id',default='hector-asi-qwen15-v39');p.add_argument('--epochs',type=int,default=4);p.add_argument('--max-length',type=int,default=112);p.add_argument('--lr',type=float,default=3e-5);p.add_argument('--seed',type=int,default=35);p.add_argument('--context-weight',type=float,default=.25);return p.parse_args()
def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()
def prompt_key(row):return ' '.join('|'.join(m.get('content','') for m in row.get('messages',[]) if m.get('role')=='user').lower().split())
def read(paths):
 rows=[]
 for path in paths:rows += [json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()]
 if not rows or any(r.get('verification',{}).get('verified') is not True for r in rows):raise ValueError('unverified data')
 ids=[r['id'] for r in rows];prompts=[prompt_key(r) for r in rows]
 if len(ids)!=len(set(ids)) or len(prompts)!=len(set(prompts)):raise ValueError('duplicates')
 return rows
def encode(tok,rows,n,context_weight):
 out=[]
 for r in rows:
  messages=r['messages'];assistant_indexes=[i for i,m in enumerate(messages) if m.get('role')=='assistant']
  if len(assistant_indexes)!=1 or assistant_indexes[0]!=len(messages)-1:raise ValueError('expected one final assistant message')
  prefix=tok.apply_chat_template(messages[:-1],tokenize=False,add_generation_prompt=True)
  full=tok.apply_chat_template(messages,tokenize=False,add_generation_prompt=False)
  prefix_len=len(tok(prefix,add_special_tokens=False)['input_ids'])
  b=tok(full,return_tensors='pt',truncation=True,max_length=n);seq=b['input_ids'].shape[1]
  if prefix_len>=seq:raise ValueError('assistant response fully truncated')
  b['labels']=b['input_ids'].clone();weights=torch.full_like(b['input_ids'],float(context_weight),dtype=torch.float32);weights[:,prefix_len:]=1.0;b['token_weights']=weights;out.append(b)
 return out
def model_inputs(batch):return {k:v for k,v in batch.items() if k!='token_weights'}
def avg_loss(model,batches):
 model.eval();vals=[]
 with torch.no_grad():
  for b in batches:vals.append(float(model(**model_inputs(b)).loss.detach().cpu()))
 return sum(vals)/len(vals)
def weighted_loss(model,b):
 out=model(input_ids=b['input_ids'],attention_mask=b.get('attention_mask'))
 logits=out.logits[:,:-1,:].contiguous();labels=b['labels'][:,1:].contiguous();weights=b['token_weights'][:,1:].contiguous()
 token_loss=F.cross_entropy(logits.view(-1,logits.size(-1)),labels.view(-1),reduction='none').view_as(labels)
 return (token_loss*weights).sum()/weights.sum()
def main():
 a=cli();
 if not 0<a.context_weight<1:raise ValueError('context weight must be between zero and one')
 set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1)
 tr,va,te=read(a.train_files),read(a.validation_files),read(a.test_files);splits=[tr,va,te]
 for i in range(3):
  for j in range(i+1,3):
   if {r['id'] for r in splits[i]}&{r['id'] for r in splits[j]} or {prompt_key(r) for r in splits[i]}&{prompt_key(r) for r in splits[j]}:raise ValueError('split contamination')
 root=Path(a.output_dir);adapter=root/'adapter';root.mkdir(parents=True,exist_ok=True);started=time.time()
 tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True);base.config.use_cache=False
 tb,vb,xb=encode(tok,tr,a.max_length,a.context_weight),encode(tok,va,a.max_length,a.context_weight),encode(tok,te,a.max_length,a.context_weight);base_val=avg_loss(base,vb);base_test=avg_loss(base,xb)
 cfg=LoraConfig(r=16,lora_alpha=32,lora_dropout=.05,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=TARGETS)
 model=get_peft_model(base,cfg);pars=[p for p in model.parameters() if p.requires_grad];before=[p.detach().clone() for p in pars];opt=AdamW(pars,lr=a.lr,weight_decay=.01);history=[];best_loss=float('inf');best_epoch=0;best_state=None
 for epoch in range(1,a.epochs+1):
  model.train();train=[]
  for b in tb:
   opt.zero_grad(set_to_none=True);z=weighted_loss(model,b)
   if not torch.isfinite(z):raise RuntimeError('non-finite loss')
   z.backward();torch.nn.utils.clip_grad_norm_(pars,1.0);opt.step();train.append(float(z.detach().cpu()))
  val=avg_loss(model,vb);history.append({'epoch':epoch,'responseWeightedTrainLoss':sum(train)/len(train),'validationStandardNll':val})
  if val<best_loss:best_loss=val;best_epoch=epoch;best_state={n:p.detach().cpu().clone() for n,p in model.named_parameters() if p.requires_grad}
 if best_state is None:raise RuntimeError('no checkpoint selected')
 with torch.no_grad():
  for n,p in model.named_parameters():
   if n in best_state:p.copy_(best_state[n])
 delta=math.sqrt(sum(float(torch.sum((p.detach()-q)**2)) for p,q in zip(pars,before)));test_loss=avg_loss(model,xb)
 if not math.isfinite(delta) or delta<=0:raise RuntimeError('weights unchanged')
 adapter.mkdir(parents=True,exist_ok=True);model.save_pretrained(adapter,safe_serialization=True);tok.save_pretrained(adapter);weights=adapter/'adapter_model.safetensors';files=a.train_files+a.validation_files+a.test_files
 metrics={'schemaVersion':'1.0.0','experimentId':a.experiment_id,'status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'LoRA SFT all-linear response-weighted objective with validation-selected checkpoint','dataset':{'paths':files,'sha256':{p:sha(p) for p in files},'trainExamples':len(tr),'validationExamples':len(va),'hiddenTestExamples':len(te),'privateUserData':False},'hyperparameters':{'epochs':a.epochs,'maxLength':a.max_length,'learningRate':a.lr,'weightDecay':.01,'seed':a.seed,'loraRank':16,'loraAlpha':32,'loraDropout':.05,'contextTokenWeight':a.context_weight,'assistantTokenWeight':1.0,'targetModules':TARGETS},'selection':{'criterion':'minimum validation standard NLL','bestEpoch':best_epoch,'history':history,'hiddenTestUsedForSelection':False},'results':{'baseValidationLoss':base_val,'bestValidationLoss':best_loss,'baseHiddenTestLoss':base_test,'candidateHiddenTestLoss':test_loss,'relativeHiddenTestImprovement':(base_test-test_loss)/base_test,'parameterDeltaL2':delta,'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)},'runtime':{'seconds':time.time()-started,'python':platform.python_version(),'torch':torch.__version__,'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n');all_files=sorted(p for p in root.rglob('*') if p.is_file());(root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in all_files));(root/'run-manifest.json').write_text(json.dumps({'experimentId':a.experiment_id,'files':{str(p.relative_to(root)):sha(p) for p in all_files},'rollback':'Keep hector-asi-qwen15-v15 active unless all gates pass.'},indent=2,sort_keys=True)+'\n');print(json.dumps(metrics,indent=2,sort_keys=True))
if __name__=='__main__':main()
