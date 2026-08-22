from __future__ import annotations
import argparse,hashlib,json,math,os,platform,time
from pathlib import Path
import torch
from peft import LoraConfig,TaskType,get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed
MODEL='Qwen/Qwen2.5-1.5B-Instruct';REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306';TARGETS=['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj']
def cli():
 p=argparse.ArgumentParser();p.add_argument('--output-dir',required=True);p.add_argument('--train-files',nargs='+',required=True);p.add_argument('--validation-files',nargs='+',required=True);p.add_argument('--experiment-id',default='hector-asi-qwen15-v34');p.add_argument('--epochs',type=int,default=2);p.add_argument('--max-length',type=int,default=112);p.add_argument('--lr',type=float,default=3e-5);p.add_argument('--seed',type=int,default=35);return p.parse_args()
def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()
def normalized_prompts(rows):return [' '.join(m.get('content','').lower().split()) for r in rows for m in r.get('messages',[]) if m.get('role')=='user']
def read(paths):
 rows=[]
 for path in paths:rows += [json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()]
 if not rows or any(r.get('verification',{}).get('verified') is not True for r in rows):raise ValueError('unverified data')
 ids=[r['id'] for r in rows];prompts=normalized_prompts(rows)
 if len(ids)!=len(set(ids)) or len(prompts)!=len(set(prompts)):raise ValueError('duplicates')
 return rows
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
def main():
 a=cli();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1)
 tr,va=read(a.train_files),read(a.validation_files);train_ids={r['id'] for r in tr};val_ids={r['id'] for r in va};train_prompts=set(normalized_prompts(tr));val_prompts=set(normalized_prompts(va))
 if train_ids&val_ids or train_prompts&val_prompts:raise ValueError('split contamination')
 root=Path(a.output_dir);adapter=root/'adapter';root.mkdir(parents=True,exist_ok=True);started=time.time()
 tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True);base.config.use_cache=False
 tb,vb=encode(tok,tr,a.max_length),encode(tok,va,a.max_length);base_loss=avg_loss(base,vb)
 cfg=LoraConfig(r=16,lora_alpha=32,lora_dropout=.05,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=TARGETS)
 model=get_peft_model(base,cfg);pars=[p for p in model.parameters() if p.requires_grad];before=[p.detach().clone() for p in pars];opt=AdamW(pars,lr=a.lr,weight_decay=0.0,betas=(.9,.999),eps=1e-8,amsgrad=False,foreach=False);losses=[];model.train()
 for _ in range(a.epochs):
  for b in tb:
   opt.zero_grad(set_to_none=True);z=model(**b).loss
   if not torch.isfinite(z):raise RuntimeError('non-finite loss')
   z.backward();torch.nn.utils.clip_grad_norm_(pars,1.0);opt.step();losses.append(float(z.detach().cpu()))
 delta=math.sqrt(sum(float(torch.sum((p.detach()-q)**2).cpu()) for p,q in zip(pars,before)));cand=avg_loss(model,vb)
 if not math.isfinite(delta) or delta<=0:raise RuntimeError('weights unchanged')
 adapter.mkdir(parents=True,exist_ok=True);model.save_pretrained(adapter,safe_serialization=True);tok.save_pretrained(adapter);weights=adapter/'adapter_model.safetensors'
 ds={'trainPaths':a.train_files,'trainSha256':{p:sha(p) for p in a.train_files},'trainExamples':len(tr),'validationPaths':a.validation_files,'validationSha256':{p:sha(p) for p in a.validation_files},'validationExamples':len(va),'crossSplitIdOverlap':len(train_ids&val_ids),'crossSplitPromptOverlap':len(train_prompts&val_prompts),'privateUserData':False,'provenance':'author-generated Apache-2.0-compatible'}
 metrics={'schemaVersion':'1.0.0','experimentId':a.experiment_id,'status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'LoRA SFT all-linear AdamW no-weight-decay','dataset':ds,'hyperparameters':{'epochs':a.epochs,'maxLength':a.max_length,'learningRate':a.lr,'weightDecay':0.0,'adamBetas':[.9,.999],'adamEpsilon':1e-8,'amsgrad':False,'gradientClip':1.0,'seed':a.seed,'loraRank':16,'loraAlpha':32,'loraDropout':.05,'targetModules':TARGETS},'results':{'steps':len(losses),'firstTrainLoss':losses[0],'finalTrainLoss':losses[-1],'baseValidationLoss':base_loss,'candidateValidationLoss':cand,'relativeValidationImprovement':(base_loss-cand)/base_loss,'parameterDeltaL2':delta,'trainableParameters':sum(p.numel() for p in pars),'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)},'runtime':{'seconds':time.time()-started,'python':platform.python_version(),'torch':torch.__version__,'hardware':'GitHub Actions ubuntu-latest CPU','githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n');files=sorted(p for p in root.rglob('*') if p.is_file());(root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files));(root/'run-manifest.json').write_text(json.dumps({'experimentId':a.experiment_id,'files':{str(p.relative_to(root)):sha(p) for p in files},'rollback':'Keep hector-asi-qwen15-v15 active; do not load this adapter unless all promotion gates pass.'},indent=2,sort_keys=True)+'\n');print(json.dumps(metrics,indent=2,sort_keys=True))
if __name__=='__main__':main()
