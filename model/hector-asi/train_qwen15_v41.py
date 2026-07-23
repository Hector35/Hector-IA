from __future__ import annotations
import argparse,hashlib,json,math,os,platform,resource,time
from pathlib import Path
import torch
from peft import LoraConfig,PeftModel,TaskType,get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed
MODEL='Qwen/Qwen2.5-1.5B-Instruct';REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306';TARGETS=['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj']
def cli():
 p=argparse.ArgumentParser();p.add_argument('--output-dir',required=True);p.add_argument('--train-files',nargs='+',required=True);p.add_argument('--validation-files',nargs='+',required=True);p.add_argument('--test-files',nargs='+',required=True);p.add_argument('--experiment-id',default='hector-asi-qwen15-v41');p.add_argument('--epochs',type=int,default=3);p.add_argument('--max-length',type=int,default=160);p.add_argument('--lr',type=float,default=3e-5);p.add_argument('--seed',type=int,default=35);return p.parse_args()
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
 return rows
def signatures(rows):return {r['id'] for r in rows},{' '.join(m.get('content','').lower().split()) for r in rows for m in r.get('messages',[]) if m.get('role')=='user'}
def encode(tok,rows,n):
 out=[]
 for r in rows:
  text=tok.apply_chat_template(r['messages'],tokenize=False,add_generation_prompt=False);b=tok(text,return_tensors='pt',truncation=True,max_length=n);b['labels']=b['input_ids'].clone();out.append(b)
 return out
def avg_loss(model,batches):
 model.eval();vals=[]
 with torch.no_grad():
  for b in batches:vals.append(float(model(**b).loss.detach().cpu()))
 return sum(vals)/len(vals)
def rss_mb():return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
def main():
 a=cli();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1)
 tr,va,te=read(a.train_files),read(a.validation_files),read(a.test_files);splits=[signatures(x) for x in (tr,va,te)]
 for i in range(3):
  for j in range(i+1,3):
   if splits[i][0]&splits[j][0] or splits[i][1]&splits[j][1]:raise ValueError('split contamination')
 root=Path(a.output_dir);best_dir=root/'best-adapter';final_dir=root/'adapter';root.mkdir(parents=True,exist_ok=True);started=time.time()
 tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True);base.config.use_cache=False
 tb,vb,eb=encode(tok,tr,a.max_length),encode(tok,va,a.max_length),encode(tok,te,a.max_length);base_val=avg_loss(base,vb);base_test=avg_loss(base,eb)
 cfg=LoraConfig(r=16,lora_alpha=32,lora_dropout=.05,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=TARGETS);model=get_peft_model(base,cfg);pars=[p for p in model.parameters() if p.requires_grad];opt=AdamW(pars,lr=a.lr,betas=(.9,.999),weight_decay=.01,foreach=False)
 history=[];best_epoch=0;best_val=float('inf')
 for epoch in range(1,a.epochs+1):
  model.train();losses=[]
  for b in tb:
   opt.zero_grad(set_to_none=True);z=model(**b).loss
   if not torch.isfinite(z):raise RuntimeError('non-finite loss')
   z.backward();torch.nn.utils.clip_grad_norm_(pars,1.0);opt.step();losses.append(float(z.detach().cpu()))
  val=avg_loss(model,vb);history.append({'epoch':epoch,'meanTrainLoss':sum(losses)/len(losses),'validationLoss':val,'peakRssMb':rss_mb()})
  if val<best_val:
   best_val=val;best_epoch=epoch;model.save_pretrained(best_dir,safe_serialization=True);tok.save_pretrained(best_dir)
 if not (best_dir/'adapter_model.safetensors').is_file():raise RuntimeError('no checkpoint selected')
 del model,opt,pars;import gc;gc.collect()
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True);model=PeftModel.from_pretrained(base,best_dir,is_trainable=False);cand_test=avg_loss(model,eb)
 delta=math.sqrt(sum(float(torch.sum(p.detach().cpu()**2)) for n,p in model.named_parameters() if 'lora_B' in n))
 if not math.isfinite(delta) or delta<=0:raise RuntimeError('weights unchanged')
 model.save_pretrained(final_dir,safe_serialization=True);tok.save_pretrained(final_dir);weights=final_dir/'adapter_model.safetensors'
 ds={'trainPaths':a.train_files,'validationPaths':a.validation_files,'testPaths':a.test_files,'trainSha256':{p:sha(p) for p in a.train_files},'validationSha256':{p:sha(p) for p in a.validation_files},'testSha256':{p:sha(p) for p in a.test_files},'trainExamples':len(tr),'validationExamples':len(va),'testExamples':len(te),'crossSplitOverlap':0,'privateUserData':False,'license':'author-generated Apache-2.0-compatible'}
 metrics={'schemaVersion':'1.0.0','experimentId':a.experiment_id,'status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'LoRA SFT corrective curriculum, validation checkpoint on disk','dataset':ds,'hyperparameters':{'epochs':a.epochs,'bestEpoch':best_epoch,'maxLength':a.max_length,'learningRate':a.lr,'optimizer':'AdamW','seed':a.seed,'loraRank':16,'loraAlpha':32,'loraDropout':.05,'targetModules':TARGETS},'results':{'history':history,'baseValidationLoss':base_val,'bestValidationLoss':best_val,'baseHiddenTestLoss':base_test,'candidateHiddenTestLoss':cand_test,'relativeHiddenImprovement':(base_test-cand_test)/base_test,'parameterDeltaL2':delta,'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)},'runtime':{'seconds':time.time()-started,'peakRssMb':rss_mb(),'python':platform.python_version(),'torch':torch.__version__,'hardware':platform.platform(),'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n');files=sorted(p for p in root.rglob('*') if p.is_file());(root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files));(root/'run-manifest.json').write_text(json.dumps({'experimentId':a.experiment_id,'files':{str(p.relative_to(root)):sha(p) for p in files},'rollback':'Keep hector-asi-qwen15-v15 active until behavioral and safety gates pass.'},indent=2,sort_keys=True)+'\n');print(json.dumps(metrics,indent=2,sort_keys=True))
if __name__=='__main__':main()
