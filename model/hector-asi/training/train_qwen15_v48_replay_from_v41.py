from __future__ import annotations
import argparse,hashlib,json,math,os,platform,resource,time
from pathlib import Path
import torch
from peft import PeftModel
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed
MODEL='Qwen/Qwen2.5-1.5B-Instruct';REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
def cli():
 p=argparse.ArgumentParser();p.add_argument('--train',required=True);p.add_argument('--validation',required=True);p.add_argument('--source-adapter',required=True);p.add_argument('--out',required=True);p.add_argument('--seed',type=int,default=35);p.add_argument('--lr',type=float,default=8e-7);p.add_argument('--max-length',type=int,default=160);return p.parse_args()
def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()
def read(path):
 rows=[json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()]
 if not rows or any(r.get('verification',{}).get('verified') is not True for r in rows):raise ValueError('unverified data')
 ids=[r['id'] for r in rows];prompts=[' '.join(m['content'].lower().split()) for r in rows for m in r['messages'] if m['role']=='user']
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
def rss_mb():return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
def main():
 a=cli();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1)
 tr,va=read(a.train),read(a.validation);trp={' '.join(m['content'].lower().split()) for r in tr for m in r['messages'] if m['role']=='user'};vap={' '.join(m['content'].lower().split()) for r in va for m in r['messages'] if m['role']=='user'}
 if {r['id'] for r in tr}&{r['id'] for r in va} or trp&vap:raise ValueError('split contamination')
 root=Path(a.out);final=root/'adapter';root.mkdir(parents=True,exist_ok=True);started=time.time()
 tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True);base.config.use_cache=False
 model=PeftModel.from_pretrained(base,a.source_adapter,is_trainable=True);tb,vb=encode(tok,tr,a.max_length),encode(tok,va,a.max_length);before=avg_loss(model,vb)
 pars=[p for p in model.parameters() if p.requires_grad];opt=AdamW(pars,lr=a.lr,betas=(.9,.999),weight_decay=.01,foreach=False);model.train();losses=[]
 for b in tb:
  opt.zero_grad(set_to_none=True);z=model(**b).loss
  if not torch.isfinite(z):raise RuntimeError('non-finite loss')
  z.backward();torch.nn.utils.clip_grad_norm_(pars,.5);opt.step();losses.append(float(z.detach().cpu()))
 after=avg_loss(model,vb);delta=math.sqrt(sum(float(torch.sum(p.detach().cpu()**2)) for n,p in model.named_parameters() if 'lora_B' in n))
 model.save_pretrained(final,safe_serialization=True);tok.save_pretrained(final);weights=final/'adapter_model.safetensors'
 manifest={'schemaVersion':'1.0.0','experimentId':'hector-asi-qwen15-v48','status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION},'sourceChampion':{'id':'hector-asi-qwen15-v41','artifactId':8560331055,'adapterSha256':'31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8'},'method':'minimal SFT replay continuation from champion','trainRows':len(tr),'validationRows':len(va),'epochs':1,'steps':len(tb),'learningRate':a.lr,'seed':a.seed,'beforeValidationLoss':before,'afterValidationLoss':after,'relativeValidationImprovement':(before-after)/before,'meanTrainLoss':sum(losses)/len(losses),'parameterNormL2':delta,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights),'trainSha256':sha(a.train),'validationSha256':sha(a.validation),'runtime':{'seconds':time.time()-started,'peakRssMb':rss_mb(),'python':platform.python_version(),'torch':torch.__version__,'hardware':platform.platform(),'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')},'rollback':'hector-asi-qwen15-v41'}
 (root/'manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n');files=sorted(p for p in root.rglob('*') if p.is_file());(root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files));print(json.dumps(manifest,indent=2,sort_keys=True))
if __name__=='__main__':main()
