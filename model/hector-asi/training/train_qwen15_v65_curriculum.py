from __future__ import annotations
import argparse,gc,hashlib,json,os,platform,resource,time,unicodedata
from pathlib import Path
import torch
import torch.nn.functional as F
from peft import PeftModel
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed

MODEL='Qwen/Qwen2.5-1.5B-Instruct'
REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
BASE_SHA='31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8'
BASE_BYTES=73911112
SYS='Responde en español con precisión, evidencia y la menor longitud suficiente.'

def cli():
 p=argparse.ArgumentParser();p.add_argument('--source-adapter',required=True);p.add_argument('--train',required=True);p.add_argument('--validation',required=True);p.add_argument('--hidden',required=True);p.add_argument('--out',required=True);p.add_argument('--epochs',type=int,default=1);p.add_argument('--lr',type=float,default=8e-7);p.add_argument('--seed',type=int,default=3065);p.add_argument('--max-length',type=int,default=144);p.add_argument('--eos-lambda',type=float,default=.08);return p.parse_args()

def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()

def norm(s):return ' '.join(unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().split())
def rows(path):
 r=[json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()]
 assert r and len({x['id'] for x in r})==len(r) and len({norm(x['prompt']) for x in r})==len(r)
 assert all(x.get('verified') is True and x.get('license')=='Apache-2.0-compatible' for x in r)
 return r

def base():
 m=AutoModelForCausalLM.from_pretrained(MODEL,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager');m.config.use_cache=False;return m

def encoded(tok,row,key,n):
 pre=tok.apply_chat_template([{'role':'system','content':SYS},{'role':'user','content':row['prompt']}],tokenize=False,add_generation_prompt=True)
 full=pre+row[key]+tok.eos_token;pl=len(tok(pre,add_special_tokens=False)['input_ids'])
 b=tok(full,return_tensors='pt',add_special_tokens=False,truncation=True,max_length=n);lab=b['input_ids'].clone();lab[:,:min(pl,lab.shape[1])]=-100
 assert not torch.all(lab==-100);b['labels']=lab;return b

def objective(model,b,eos_l):
 o=model(**b);lg=o.logits[:,:-1];la=b['labels'][:,1:];mask=la!=-100
 ce=F.cross_entropy(lg[mask],la[mask]);last=torch.where(mask[0])[0][-1];eos=F.cross_entropy(lg[:,last],la[:,last]);return ce+eos_l*eos

def sequence_nll(model,b):
 with torch.no_grad():
  lg=model(**{k:v for k,v in b.items() if k!='labels'}).logits[:,:-1];la=b['labels'][:,1:];mask=la!=-100
  return float(F.cross_entropy(lg[mask],la[mask],reduction='mean'))

def meanloss(model,bs,eos_l):
 model.eval()
 with torch.no_grad():return sum(float(objective(model,b,eos_l)) for b in bs)/len(bs)

def preference_eval(model,tok,cases,n):
 model.eval();detail=[]
 for x in cases:
  chosen=sequence_nll(model,encoded(tok,x,'chosen',n));rejected=sequence_nll(model,encoded(tok,x,'rejected',n));detail.append({'id':x['id'],'capability':x['capability'],'critical':bool(x.get('critical')),'chosenNll':chosen,'rejectedNll':rejected,'passed':chosen<rejected,'margin':rejected-chosen})
 caps={}
 for c in sorted({x['capability'] for x in cases}):
  z=[x for x in detail if x['capability']==c];caps[c]={'passed':sum(x['passed'] for x in z),'total':len(z)}
 crit=[x for x in detail if x['critical']]
 return {'passed':sum(x['passed'] for x in detail),'total':len(detail),'capabilities':caps,'criticalPassed':sum(x['passed'] for x in crit),'criticalTotal':len(crit),'cases':detail}

def rss():return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024

def main():
 a=cli();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(2);torch.set_num_interop_threads(1);start=time.time();src=Path(a.source_adapter);w0=src/'adapter_model.safetensors';assert sha(w0)==BASE_SHA and w0.stat().st_size==BASE_BYTES
 tr,va,hi=rows(a.train),rows(a.validation),rows(a.hidden);assert (len(tr),len(va),len(hi))==(144,36,36)
 ss=[{norm(x['prompt']) for x in z} for z in (tr,va,hi)];assert not ss[0]&ss[1] and not ss[0]&ss[2] and not ss[1]&ss[2]
 tok=AutoTokenizer.from_pretrained(src,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 tb=[encoded(tok,x,'chosen',a.max_length) for x in tr];vb=[encoded(tok,x,'chosen',a.max_length) for x in va]
 b=base();champ=PeftModel.from_pretrained(b,src,is_trainable=False);before=meanloss(champ,vb,a.eos_lambda);bb=preference_eval(champ,tok,hi,a.max_length);del champ,b;gc.collect()
 b=base();m=PeftModel.from_pretrained(b,src,is_trainable=True);pars=[p for n,p in m.named_parameters() if p.requires_grad and 'lora_' in n];assert pars
 opt=AdamW(pars,lr=a.lr,weight_decay=.01,foreach=False);root=Path(a.out);bestdir=root/'best-adapter';final=root/'adapter';root.mkdir(parents=True,exist_ok=True);best=float('inf');hist=[]
 for ep in range(1,a.epochs+1):
  m.train();ls=[]
  for batch in tb:
   opt.zero_grad(set_to_none=True);l=objective(m,batch,a.eos_lambda);l.backward();torch.nn.utils.clip_grad_norm_(pars,.35);opt.step();ls.append(float(l.detach()))
  v=meanloss(m,vb,a.eos_lambda);hist.append({'epoch':ep,'trainObjective':sum(ls)/len(ls),'validationObjective':v,'peakRssMb':rss()})
  if v<best:best=v;m.save_pretrained(bestdir,safe_serialization=True);tok.save_pretrained(bestdir)
 del m,b,opt,pars;gc.collect();b=base();m=PeftModel.from_pretrained(b,bestdir,is_trainable=False);ab=preference_eval(m,tok,hi,a.max_length);m.save_pretrained(final,safe_serialization=True);tok.save_pretrained(final);wf=final/'adapter_model.safetensors'
 gains={c:ab['capabilities'][c]['passed']-bb['capabilities'][c]['passed'] for c in bb['capabilities']};gain=ab['passed']-bb['passed']
 gates={'validationImproved':best<before,'hiddenBehaviorGain':gain>=3,'noCapabilityRegression':all(v>=0 for v in gains.values()),'criticalPerfect':ab['criticalPassed']==ab['criticalTotal']};gates['eligibleForPromotion']=all(gates.values())
 metrics={'schemaVersion':1,'experimentId':'hector-asi-qwen15-v65-capability-curriculum','status':'candidate-weights-generated','baseModel':MODEL,'baseRevision':REV,'sourceRuntime':'hector-asi-qwen15-v41','method':'full-LoRA response continuation on deterministic capability curriculum','dataset':{'trainRows':len(tr),'validationRows':len(va),'hiddenRows':len(hi),'trainSha256':sha(a.train),'validationSha256':sha(a.validation),'hiddenSha256':sha(a.hidden),'crossSplitOverlap':0},'hyperparameters':{'epochs':a.epochs,'lr':a.lr,'eosLambda':a.eos_lambda,'seed':a.seed,'maxLength':a.max_length},'baseline':{'validationObjective':before,'behavioral':bb},'candidate':{'validationObjective':best,'behavioral':ab,'hiddenGain':gain,'capabilityGains':gains,'adapterSha256':sha(wf),'adapterBytes':wf.stat().st_size,'history':hist},'gates':gates,'rollback':'hector-asi-qwen15-v41','runtime':{'seconds':time.time()-start,'peakRssMb':rss(),'python':platform.python_version(),'torch':torch.__version__,'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True,ensure_ascii=False)+'\n');print(json.dumps(metrics,indent=2,sort_keys=True,ensure_ascii=False))
if __name__=='__main__':main()
