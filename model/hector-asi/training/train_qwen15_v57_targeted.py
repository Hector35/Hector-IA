from __future__ import annotations
import argparse,gc,hashlib,json,math,os,platform,resource,time,unicodedata
from pathlib import Path
import torch
from peft import PeftModel
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed
from safetensors.torch import load_file
MODEL='Qwen/Qwen2.5-1.5B-Instruct'; REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
SOURCE_SHA='31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8'; SOURCE_BYTES=73911112

def args():
 p=argparse.ArgumentParser(); p.add_argument('--source-adapter',required=True);p.add_argument('--train',required=True);p.add_argument('--validation',required=True);p.add_argument('--hidden',required=True);p.add_argument('--out',required=True)
 p.add_argument('--epochs',type=int,default=2);p.add_argument('--lr',type=float,default=3e-6);p.add_argument('--seed',type=int,default=3057);p.add_argument('--max-length',type=int,default=144);p.add_argument('--max-new-tokens',type=int,default=64);return p.parse_args()
def sha(p):
 h=hashlib.sha256();
 with open(p,'rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()
def norm(s):
 s=unicodedata.normalize('NFKD',s.lower());return ' '.join(''.join(c for c in s if not unicodedata.combining(c)).split())
def read(p,training=False):
 rows=[json.loads(x) for x in Path(p).read_text().splitlines() if x.strip()]
 if not rows:raise ValueError('empty')
 ids=[];prompts=[]
 for r in rows:
  v=r.get('verification',{}); roles=[m.get('role') for m in r.get('messages',[])]
  if v.get('verified') is not True or v.get('source')!='author-generated' or v.get('license')!='Apache-2.0-compatible':raise ValueError(f'bad provenance {r.get("id")}')
  if roles[-1:]!=['assistant'] or 'user' not in roles:raise ValueError(f'bad chat {r.get("id")}')
  w=float(r.get('trainingWeight',1));
  if training and w not in {1.0,2.0}:raise ValueError(f'bad weight {r.get("id")}')
  ids.append(r['id']);prompts.append(norm(next(m['content'] for m in r['messages'] if m['role']=='user')))
 if len(ids)!=len(set(ids)) or len(prompts)!=len(set(prompts)):raise ValueError('duplicates')
 return rows
def sig(rows):return {r['id'] for r in rows},{norm(next(m['content'] for m in r['messages'] if m['role']=='user')) for r in rows}
def encode(tok,rows,n,training=False):
 out=[]
 for r in rows:
  prefix=tok.apply_chat_template(r['messages'][:-1],tokenize=False,add_generation_prompt=True);full=tok.apply_chat_template(r['messages'],tokenize=False,add_generation_prompt=False)
  plen=len(tok(prefix,add_special_tokens=False)['input_ids']);b=tok(full,return_tensors='pt',add_special_tokens=False,truncation=True,max_length=n);lab=b['input_ids'].clone();lab[:,:min(plen,lab.shape[1])]=-100
  if torch.all(lab==-100):raise ValueError(f'truncated {r["id"]}')
  b['labels']=lab;out.append((b,float(r.get('trainingWeight',1)) if training else 1.0,r['id']))
 return out
def avg_loss(m,batches):
 m.eval();vals=[]
 with torch.no_grad():
  for b,_,_ in batches:vals.append(float(m(**b).loss.detach().cpu()))
 return sum(vals)/len(vals)
def generate(m,t,r,n):
 p=t.apply_chat_template(r['messages'][:-1],tokenize=False,add_generation_prompt=True);x=t(p,return_tensors='pt',add_special_tokens=False);s=time.perf_counter()
 with torch.no_grad():y=m.generate(**x,do_sample=False,max_new_tokens=n,repetition_penalty=1.05,pad_token_id=t.eos_token_id,eos_token_id=t.eos_token_id)
 z=y[0,x['input_ids'].shape[1]:];return t.decode(z,skip_special_tokens=True).strip(),(time.perf_counter()-s)*1000,int(z.numel())
def score(r,text):
 n=norm(text);e=r.get('evaluation',{});missing=[]
 for g in e.get('required',[]):
  if not any(norm(x) in n for x in g):missing.append(g)
 bad=[x for x in e.get('forbidden',[]) if norm(x) in n]
 return not missing and not bad,missing,bad
def behavior(m,t,rows,n):
 cases=[]
 for r in rows:
  text,ms,tok=generate(m,t,r,n);passed,missing,bad=score(r,text);cases.append({'id':r['id'],'category':r['verification']['category'],'critical':bool(r.get('evaluation',{}).get('critical')),'response':text,'passed':passed,'missingRequired':missing,'forbiddenPresent':bad,'latencyMs':ms,'tokens':tok})
 crit=[x for x in cases if x['critical']];p=sum(x['passed'] for x in cases)
 return {'passed':p,'total':len(cases),'score':p/len(cases),'criticalPassed':sum(x['passed'] for x in crit),'criticalTotal':len(crit),'meanLatencyMs':sum(x['latencyMs'] for x in cases)/len(cases),'meanTokens':sum(x['tokens'] for x in cases)/len(cases),'cases':cases}
def base():
 m=AutoModelForCausalLM.from_pretrained(MODEL,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager');m.config.use_cache=False;return m
def rss():return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
def main():
 a=args();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1)
 src=Path(a.source_adapter);w=src/'adapter_model.safetensors'
 if sha(w)!=SOURCE_SHA or w.stat().st_size!=SOURCE_BYTES:raise RuntimeError('source mismatch')
 tr,va,hi=read(a.train,True),read(a.validation),read(a.hidden);ss=[sig(x) for x in (tr,va,hi)]
 for i in range(3):
  for j in range(i+1,3):
   if ss[i][0]&ss[j][0] or ss[i][1]&ss[j][1]:raise ValueError('split contamination')
 root=Path(a.out);best=root/'best-adapter';final=root/'adapter';root.mkdir(parents=True,exist_ok=True);started=time.time()
 tok=AutoTokenizer.from_pretrained(src,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 tb,vb,hb=encode(tok,tr,a.max_length,True),encode(tok,va,a.max_length),encode(tok,hi,a.max_length)
 b=base();old=PeftModel.from_pretrained(b,src,is_trainable=False);old_val=avg_loss(old,vb);old_hidden=avg_loss(old,hb);old_beh=behavior(old,tok,hi,a.max_new_tokens);del old,b;gc.collect()
 b=base();m=PeftModel.from_pretrained(b,src,is_trainable=True);pars=[p for p in m.parameters() if p.requires_grad];opt=AdamW(pars,lr=a.lr,weight_decay=.02,foreach=False)
 hist=[];best_val=1e9;best_epoch=0
 for epoch in range(1,a.epochs+1):
  m.train();raw=[];weighted=[]
  for batch,weight,rowid in tb:
   opt.zero_grad(set_to_none=True);loss=m(**batch).loss;z=loss*weight
   if not torch.isfinite(z):raise RuntimeError(f'nonfinite {rowid}')
   z.backward();torch.nn.utils.clip_grad_norm_(pars,.5);opt.step();raw.append(float(loss.detach().cpu()));weighted.append(float(z.detach().cpu()))
  vl=avg_loss(m,vb);hist.append({'epoch':epoch,'rawTrainLoss':sum(raw)/len(raw),'weightedTrainLoss':sum(weighted)/len(weighted),'validationLoss':vl,'peakRssMb':rss()})
  if vl<best_val:best_val=vl;best_epoch=epoch;m.save_pretrained(best,safe_serialization=True);tok.save_pretrained(best)
 del m,b,opt;gc.collect();b=base();m=PeftModel.from_pretrained(b,best,is_trainable=False);new_hidden=avg_loss(m,hb);new_beh=behavior(m,tok,hi,a.max_new_tokens)
 source_state=load_file(str(w)); candidate_state=load_file(str(best/'adapter_model.safetensors'));delta=sum(float(torch.sum((candidate_state[k].float()-source_state[k].float())**2)) for k in candidate_state if k in source_state)
 m.save_pretrained(final,safe_serialization=True);tok.save_pretrained(final);wf=final/'adapter_model.safetensors'
 lr=new_beh['meanLatencyMs']/old_beh['meanLatencyMs'];tratio=new_beh['meanTokens']/old_beh['meanTokens'];hr=new_hidden/old_hidden
 gates={'weightsChanged':math.sqrt(delta)>0,'validationImproved':best_val<old_val,'behavioralImprovement':new_beh['score']>old_beh['score'],'criticalPerfect':new_beh['criticalPassed']==new_beh['criticalTotal'],'noCriticalRegression':new_beh['criticalPassed']>=old_beh['criticalPassed'],'hiddenLossWithinFivePercent':hr<=1.05,'latencyWithinFifteenPercent':lr<=1.15,'tokensWithinFivePercent':tratio<=1.05};gates['eligibleForChampion']=all(gates.values())
 metrics={'schemaVersion':'1.0.0','experimentId':'hector-asi-qwen15-v57-targeted-repair','status':'candidate-weights-generated','eligibleForChampion':gates['eligibleForChampion'],'baseModel':{'repository':MODEL,'revision':REV},'baseline':{'runtimeId':'hector-asi-qwen15-v41','artifactId':8560331055,'adapterSha256':SOURCE_SHA,'validationLoss':old_val,'hiddenLoss':old_hidden,'behavioral':old_beh},'method':'targeted assistant-response-only LoRA SFT with 2x weight on seven stable failure capabilities and safety/general replay','dataset':{'trainExamples':len(tr),'validationExamples':len(va),'hiddenExamples':len(hi),'trainSha256':sha(a.train),'validationSha256':sha(a.validation),'hiddenSha256':sha(a.hidden),'crossSplitOverlap':0,'privateUserData':False,'license':'author-generated Apache-2.0-compatible'},'hyperparameters':{'epochs':a.epochs,'bestEpoch':best_epoch,'learningRate':a.lr,'seed':a.seed,'maxLength':a.max_length,'maxNewTokens':a.max_new_tokens,'optimizer':'AdamW','clip':.5,'weightDecay':.02},'candidate':{'adapterSha256':sha(wf),'adapterBytes':wf.stat().st_size,'parameterDeltaL2':math.sqrt(delta),'bestValidationLoss':best_val,'hiddenLoss':new_hidden,'hiddenLossRatio':hr,'behavioral':new_beh,'latencyRatio':lr,'tokenRatio':tratio,'history':hist},'gates':gates,'runtime':{'seconds':time.time()-started,'peakRssMb':rss(),'python':platform.python_version(),'torch':torch.__version__,'hardware':platform.platform(),'githubRunId':os.getenv('GITHUB_RUN_ID'),'githubSha':os.getenv('GITHUB_SHA')},'rollback':'hector-asi-qwen15-v41'}
 (root/'metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2,sort_keys=True)+'\n');files=sorted(p for p in root.rglob('*') if p.is_file());(root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root)}\n' for p in files));(root/'run-manifest.json').write_text(json.dumps({'experimentId':metrics['experimentId'],'sourceArtifactId':8560331055,'sourceAdapterSha256':SOURCE_SHA,'files':{str(p.relative_to(root)):sha(p) for p in files},'rollback':metrics['rollback']},indent=2,sort_keys=True)+'\n');print(json.dumps(metrics,ensure_ascii=False,indent=2,sort_keys=True))
if __name__=='__main__':main()
