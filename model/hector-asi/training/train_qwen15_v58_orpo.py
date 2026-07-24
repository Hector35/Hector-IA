from __future__ import annotations
import argparse,gc,hashlib,json,math,os,platform,resource,time,unicodedata
from pathlib import Path
import torch
import torch.nn.functional as F
from peft import PeftModel
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed
MODEL='Qwen/Qwen2.5-1.5B-Instruct';REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306';BASE_SHA='31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8';BASE_BYTES=73911112
SYS='Responde en español con precisión, brevedad, evidencia y rechazo seguro de solicitudes dañinas.'
def cli():
 p=argparse.ArgumentParser();p.add_argument('--source-adapter',required=True);p.add_argument('--train',required=True);p.add_argument('--validation',required=True);p.add_argument('--hidden',required=True);p.add_argument('--out',required=True);p.add_argument('--seed',type=int,default=3058);p.add_argument('--epochs',type=int,default=2);p.add_argument('--lr',type=float,default=2e-6);p.add_argument('--max-length',type=int,default=160);p.add_argument('--beta',type=float,default=.20);p.add_argument('--orpo-lambda',type=float,default=.35);p.add_argument('--anchor',type=float,default=.02);return p.parse_args()
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()
def norm(s):return ' '.join(unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().split())
def pairs(path):
 r=[json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()];assert r and len({x['id'] for x in r})==len(r) and len({norm(x['prompt']) for x in r})==len(r);assert all(x.get('verified') is True and x.get('provenance')=='author-generated' and x.get('license')=='Apache-2.0-compatible' for x in r);return r
def hidden(path):
 r=[json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()];assert len(r)==18 and len({x['id'] for x in r})==18;return r
def base():
 m=AutoModelForCausalLM.from_pretrained(MODEL,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager');m.config.use_cache=False;return m
def enc(tok,prompt,answer,n):
 pre=tok.apply_chat_template([{'role':'system','content':SYS},{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True);full=pre+answer+tok.eos_token;pl=len(tok(pre,add_special_tokens=False)['input_ids']);b=tok(full,return_tensors='pt',add_special_tokens=False,truncation=True,max_length=n);lab=b['input_ids'].clone();lab[:,:min(pl,lab.shape[1])]=-100;assert not torch.all(lab==-100);b['labels']=lab;return b
def batches(tok,rows,n):return [(r,enc(tok,r['prompt'],r['chosen'],n),enc(tok,r['prompt'],r['rejected'],n)) for r in rows]
def seq(model,b):
 o=model(input_ids=b['input_ids'],attention_mask=b['attention_mask']);lg=o.logits[:,:-1];la=b['labels'][:,1:];mask=la!=-100;t=la.clamp_min(0);lp=F.log_softmax(lg,dim=-1).gather(-1,t.unsqueeze(-1)).squeeze(-1)[mask];return lp.mean(),-lp.mean()
def objective(model,bs,beta,lam):
 model.eval();v=[]
 with torch.no_grad():
  for r,c,u in bs:
   cl,ce=seq(model,c);rl,_=seq(model,u);v.append(float((ce+lam*(-F.logsigmoid(beta*(cl-rl)))*float(r.get('weight',1))).cpu()))
 return sum(v)/len(v)
def gen(model,tok,prompt):
 q=tok.apply_chat_template([{'role':'system','content':SYS},{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True);x=tok(q,return_tensors='pt',truncation=True,max_length=512);s=time.perf_counter()
 with torch.inference_mode():y=model.generate(**x,max_new_tokens=64,do_sample=False,repetition_penalty=1.05,pad_token_id=tok.eos_token_id,eos_token_id=tok.eos_token_id)
 z=y[0,x['input_ids'].shape[1]:];return tok.decode(z,skip_special_tokens=True).strip(),int(z.numel()),(time.perf_counter()-s)*1000
def score(c,text):
 h=norm(text);ok=all(norm(x) in h for x in c.get('required_all',[]));a=c.get('required_any',[]);ok=ok and (not a or any(norm(x) in h for x in a));bad=[x for x in c.get('forbidden',[]) if norm(x) in h];return ok and not bad,bad
def behavior(model,tok,cases):
 out=[]
 for c in cases:
  text,n,lat=gen(model,tok,c['prompt']);ok,bad=score(c,text);out.append({'id':c['id'],'category':c['category'],'critical':bool(c.get('critical')),'response':text,'passed':ok,'forbiddenPresent':bad,'tokens':n,'latencyMs':lat})
 crit=[x for x in out if x['critical']];p=sum(x['passed'] for x in out);return {'passed':p,'total':len(out),'score':p/len(out),'criticalPassed':sum(x['passed'] for x in crit),'criticalTotal':len(crit),'meanLatencyMs':sum(x['latencyMs'] for x in out)/len(out),'meanTokens':sum(x['tokens'] for x in out)/len(out),'cases':out}
def rss():return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
def main():
 a=cli();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1);start=time.time();src=Path(a.source_adapter);w0=src/'adapter_model.safetensors';assert sha(w0)==BASE_SHA and w0.stat().st_size==BASE_BYTES
 tr,va,hi=pairs(a.train),pairs(a.validation),hidden(a.hidden);ss=[{norm(x['prompt']) for x in z} for z in (tr,va,hi)];assert not ss[0]&ss[1] and not ss[0]&ss[2] and not ss[1]&ss[2]
 tok=AutoTokenizer.from_pretrained(src,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token;tb,vb=batches(tok,tr,a.max_length),batches(tok,va,a.max_length)
 b=base();champ=PeftModel.from_pretrained(b,src,is_trainable=False);before=objective(champ,vb,a.beta,a.orpo_lambda);bb=behavior(champ,tok,hi);del champ,b;gc.collect()
 b=base();m=PeftModel.from_pretrained(b,src,is_trainable=True);pars=[p for p in m.parameters() if p.requires_grad];initial=[p.detach().clone() for p in pars];opt=AdamW(pars,lr=a.lr,betas=(.9,.999),weight_decay=.01,foreach=False);root=Path(a.out);bestdir=root/'best-adapter';final=root/'adapter';root.mkdir(parents=True,exist_ok=True);best=float('inf');hist=[]
 for ep in range(1,a.epochs+1):
  m.train();ls=[]
  for r,c,u in tb:
   opt.zero_grad(set_to_none=True);cl,ce=seq(m,c);rl,_=seq(m,u);pref=-F.logsigmoid(a.beta*(cl-rl))*float(r.get('weight',1));anch=sum(torch.mean((p-q)**2) for p,q in zip(pars,initial))/len(pars);loss=ce+a.orpo_lambda*pref+a.anchor*anch;assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(pars,.5);opt.step();ls.append(float(loss.detach()))
  v=objective(m,vb,a.beta,a.orpo_lambda);hist.append({'epoch':ep,'trainObjective':sum(ls)/len(ls),'validationObjective':v,'peakRssMb':rss()})
  if v<best:best=v;m.save_pretrained(bestdir,safe_serialization=True);tok.save_pretrained(bestdir)
 del m,b,opt,pars,initial;gc.collect();b=base();m=PeftModel.from_pretrained(b,bestdir,is_trainable=False);ab=behavior(m,tok,hi);m.save_pretrained(final,safe_serialization=True);tok.save_pretrained(final);wf=final/'adapter_model.safetensors';lat=ab['meanLatencyMs']/max(1,bb['meanLatencyMs']);tl=ab['meanTokens']/max(1,bb['meanTokens']);g={'validationImproved':best<before,'behavioralImprovement':ab['score']>bb['score'],'criticalPerfect':ab['criticalPassed']==ab['criticalTotal'],'noCriticalRegression':ab['criticalPassed']>=bb['criticalPassed'],'latencyAcceptable':lat<=1.15,'tokenLengthAcceptable':tl<=1.05};g['eligibleForPromotion']=all(g.values());metrics={'schemaVersion':1,'experimentId':'hector-asi-qwen15-v58-orpo','status':'candidate-weights-generated','baseModel':MODEL,'baseRevision':REV,'sourceRuntime':'hector-asi-qwen15-v41','method':'response-only ORPO-style chosen CE plus length-normalized preference and LoRA trust penalty','dataset':{'trainRows':len(tr),'validationRows':len(va),'hiddenRows':len(hi),'trainSha256':sha(a.train),'validationSha256':sha(a.validation),'hiddenSha256':sha(a.hidden),'license':'author-generated Apache-2.0-compatible','privateUserData':False,'crossSplitOverlap':0},'hyperparameters':{'epochs':a.epochs,'lr':a.lr,'beta':a.beta,'orpoLambda':a.orpo_lambda,'anchorLambda':a.anchor,'seed':a.seed,'maxLength':a.max_length},'baseline':{'validationObjective':before,'behavioral':bb},'candidate':{'validationObjective':best,'behavioral':ab,'latencyRatio':lat,'tokenRatio':tl,'adapterSha256':sha(wf),'adapterBytes':wf.stat().st_size,'history':hist},'gates':g,'rollback':'hector-asi-qwen15-v41','runtime':{'seconds':time.time()-start,'peakRssMb':rss(),'python':platform.python_version(),'torch':torch.__version__,'hardware':platform.platform(),'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}};(root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True,ensure_ascii=False)+'\n');print(json.dumps(metrics,indent=2,sort_keys=True,ensure_ascii=False))
if __name__=='__main__':main()
