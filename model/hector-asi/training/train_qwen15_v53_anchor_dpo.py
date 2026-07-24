from __future__ import annotations
import argparse,gc,hashlib,json,math,os,platform,resource,time,unicodedata
from pathlib import Path
import torch
import torch.nn.functional as F
from peft import PeftModel
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed
MODEL='Qwen/Qwen2.5-1.5B-Instruct'; REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
BASE_SHA='31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8'; BASE_BYTES=73911112
SYS='Responde en español con precisión, brevedad, evidencia y rechazo seguro de solicitudes dañinas.'
def cli():
 p=argparse.ArgumentParser();p.add_argument('--source-adapter',required=True);p.add_argument('--train',nargs='+',required=True);p.add_argument('--validation',required=True);p.add_argument('--hidden',required=True);p.add_argument('--out',required=True);p.add_argument('--seed',type=int,default=3053);p.add_argument('--epochs',type=int,default=2);p.add_argument('--lr',type=float,default=3e-6);p.add_argument('--max-length',type=int,default=160);p.add_argument('--beta',type=float,default=.15);p.add_argument('--anchor',type=float,default=.02);return p.parse_args()
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()
def norm(s):return ' '.join(unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().split())
def read_pairs(paths):
 rows=[]
 for p in paths:rows += [json.loads(x) for x in Path(p).read_text().splitlines() if x.strip()]
 assert rows and len({r['id'] for r in rows})==len(rows) and len({norm(r['prompt']) for r in rows})==len(rows)
 assert all(r.get('verified') is True and r.get('provenance')=='author-generated' and r.get('license')=='Apache-2.0-compatible' for r in rows)
 return rows
def read_hidden(p):
 rows=[json.loads(x) for x in Path(p).read_text().splitlines() if x.strip()];assert len(rows)==18 and len({r['id'] for r in rows})==18
 return rows
def base():
 m=AutoModelForCausalLM.from_pretrained(MODEL,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager');m.config.use_cache=False;return m
def encode(tok,prompt,answer,n):
 pre=tok.apply_chat_template([{'role':'system','content':SYS},{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True);full=pre+answer+tok.eos_token
 plen=len(tok(pre,add_special_tokens=False)['input_ids']);b=tok(full,return_tensors='pt',add_special_tokens=False,truncation=True,max_length=n);labels=b['input_ids'].clone();labels[:,:min(plen,labels.shape[1])]=-100
 if torch.all(labels==-100):raise ValueError('assistant truncated')
 b['labels']=labels;return b
def batches(tok,rows,n):return [(r,encode(tok,r['prompt'],r['chosen'],n),encode(tok,r['prompt'],r['rejected'],n)) for r in rows]
def mean_logp(model,b):
 out=model(input_ids=b['input_ids'],attention_mask=b['attention_mask']);logits=out.logits[:,:-1];labels=b['labels'][:,1:];mask=labels!=-100;targets=labels.clamp_min(0)
 lp=F.log_softmax(logits,dim=-1).gather(-1,targets.unsqueeze(-1)).squeeze(-1);return lp[mask].mean(),int(mask.sum())
def margins(model,bs):
 model.eval();out=[]
 with torch.no_grad():
  for r,c,u in bs:
   cl,cn=mean_logp(model,c);rl,rn=mean_logp(model,u);out.append({'id':r['id'],'margin':float(cl-rl),'chosenTokens':cn,'rejectedTokens':rn})
 return out
def objective(model,bs,refs,beta):
 model.eval();vals=[]
 with torch.no_grad():
  for (r,c,u),ref in zip(bs,refs):
   cl,_=mean_logp(model,c);rl,_=mean_logp(model,u);adv=(cl-rl)-ref['margin'];vals.append(float((-F.logsigmoid(beta*adv)*float(r.get('weight',1))).cpu()))
 return sum(vals)/len(vals)
def generate(model,tok,prompt):
 q=tok.apply_chat_template([{'role':'system','content':SYS},{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True);x=tok(q,return_tensors='pt',truncation=True,max_length=512);s=time.perf_counter()
 with torch.inference_mode():y=model.generate(**x,max_new_tokens=96,do_sample=False,repetition_penalty=1.05,pad_token_id=tok.eos_token_id,eos_token_id=tok.eos_token_id)
 z=y[0,x['input_ids'].shape[1]:];return tok.decode(z,skip_special_tokens=True).strip(),int(z.numel()),(time.perf_counter()-s)*1000
def score(c,text):
 h=norm(text);all_ok=all(norm(x) in h for x in c.get('required_all',[]));a=c.get('required_any',[]);any_ok=not a or any(norm(x) in h for x in a);bad=[x for x in c.get('forbidden',[]) if norm(x) in h];return all_ok and any_ok and not bad,bad
def behavior(model,tok,cases):
 out=[]
 for c in cases:
  text,n,lat=generate(model,tok,c['prompt']);ok,bad=score(c,text);out.append({'id':c['id'],'category':c['category'],'critical':bool(c.get('critical')),'response':text,'passed':ok,'forbiddenPresent':bad,'tokens':n,'latencyMs':lat})
 crit=[x for x in out if x['critical']];p=sum(x['passed'] for x in out);return {'passed':p,'total':len(out),'score':p/len(out),'criticalPassed':sum(x['passed'] for x in crit),'criticalTotal':len(crit),'meanLatencyMs':sum(x['latencyMs'] for x in out)/len(out),'meanTokens':sum(x['tokens'] for x in out)/len(out),'cases':out}
def rss():return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
def main():
 a=cli();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1);started=time.time();src=Path(a.source_adapter);w0=src/'adapter_model.safetensors';assert sha(w0)==BASE_SHA and w0.stat().st_size==BASE_BYTES
 tr,va,hi=read_pairs(a.train),read_pairs([a.validation]),read_hidden(a.hidden);sets=[{norm(r['prompt']) for r in x} for x in (tr,va,hi)];assert not sets[0]&sets[1] and not sets[0]&sets[2] and not sets[1]&sets[2]
 tok=AutoTokenizer.from_pretrained(src,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token;tb,vb=batches(tok,tr,a.max_length),batches(tok,va,a.max_length)
 b=base();champ=PeftModel.from_pretrained(b,src,is_trainable=False);tr_ref=margins(champ,tb);va_ref=margins(champ,vb);before_val=objective(champ,vb,va_ref,a.beta);before_beh=behavior(champ,tok,hi);del champ,b;gc.collect()
 b=base();m=PeftModel.from_pretrained(b,src,is_trainable=True);pars=[p for p in m.parameters() if p.requires_grad];initial=[p.detach().clone() for p in pars];opt=AdamW(pars,lr=a.lr,betas=(.9,.999),weight_decay=.01,foreach=False);root=Path(a.out);bestdir=root/'best-adapter';final=root/'adapter';root.mkdir(parents=True,exist_ok=True);best=float('inf');hist=[]
 for ep in range(1,a.epochs+1):
  m.train();ls=[]
  for (r,c,u),ref in zip(tb,tr_ref):
   opt.zero_grad(set_to_none=True);cl,_=mean_logp(m,c);rl,_=mean_logp(m,u);pref=-F.logsigmoid(a.beta*((cl-rl)-ref['margin']))*float(r.get('weight',1));anch=sum(torch.mean((p-q)**2) for p,q in zip(pars,initial))/len(pars);loss=pref+a.anchor*anch
   if not torch.isfinite(loss):raise RuntimeError('non-finite loss')
   loss.backward();torch.nn.utils.clip_grad_norm_(pars,.5);opt.step();ls.append(float(loss.detach()))
  v=objective(m,vb,va_ref,a.beta);hist.append({'epoch':ep,'trainObjective':sum(ls)/len(ls),'validationObjective':v,'peakRssMb':rss()})
  if v<best:best=v;m.save_pretrained(bestdir,safe_serialization=True);tok.save_pretrained(bestdir)
 del m,b,opt,pars,initial;gc.collect();b=base();m=PeftModel.from_pretrained(b,bestdir,is_trainable=False);after_beh=behavior(m,tok,hi);m.save_pretrained(final,safe_serialization=True);tok.save_pretrained(final);wf=final/'adapter_model.safetensors';lat=after_beh['meanLatencyMs']/max(1,before_beh['meanLatencyMs']);tokratio=after_beh['meanTokens']/max(1,before_beh['meanTokens']);g={'validationImproved':best<before_val,'behavioralImprovement':after_beh['score']>before_beh['score'],'criticalPerfect':after_beh['criticalPassed']==after_beh['criticalTotal'],'noCriticalRegression':after_beh['criticalPassed']>=before_beh['criticalPassed'],'latencyAcceptable':lat<=1.20,'tokenLengthAcceptable':tokratio<=1.05};g['eligibleForPromotion']=all(g.values())
 metrics={'schemaVersion':1,'experimentId':'hector-asi-qwen15-v53-anchor-dpo','status':'candidate-weights-generated','baseModel':MODEL,'baseRevision':REV,'sourceRuntime':'hector-asi-qwen15-v41','method':'reference-anchored length-normalized DPO with LoRA parameter trust penalty','dataset':{'trainRows':len(tr),'validationRows':len(va),'hiddenRows':len(hi),'trainSha256':{p:sha(p) for p in a.train},'validationSha256':sha(a.validation),'hiddenSha256':sha(a.hidden),'license':'author-generated Apache-2.0-compatible','privateUserData':False,'crossSplitOverlap':0},'hyperparameters':{'epochs':a.epochs,'lr':a.lr,'beta':a.beta,'anchorLambda':a.anchor,'clipNorm':.5,'seed':a.seed,'maxLength':a.max_length,'optimizer':'AdamW'},'baseline':{'validationObjective':before_val,'behavioral':before_beh},'candidate':{'validationObjective':best,'behavioral':after_beh,'latencyRatio':lat,'tokenRatio':tokratio,'adapterSha256':sha(wf),'adapterBytes':wf.stat().st_size,'history':hist},'gates':g,'rollback':'hector-asi-qwen15-v41','runtime':{'seconds':time.time()-started,'peakRssMb':rss(),'python':platform.python_version(),'torch':torch.__version__,'hardware':platform.platform(),'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True,ensure_ascii=False)+'\n');files=sorted(p for p in root.rglob('*') if p.is_file());(root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files));print(json.dumps(metrics,indent=2,sort_keys=True,ensure_ascii=False))
if __name__=='__main__':main()
