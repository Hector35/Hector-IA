from __future__ import annotations
import argparse,hashlib,json,math,os,platform,subprocess,time
from pathlib import Path
from typing import Any
import torch
import torch.nn.functional as F
from peft import LoraConfig,TaskType,get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed

MODEL='Qwen/Qwen2.5-0.5B-Instruct'
REVISION='a338b55dd21219a5f4da42bc11a9313d1a27d4cc'
SYSTEM='Eres Héctor. Distingues evidencia, incertidumbre, seguridad y rollback; prefieres respuestas verificables y calibradas.'

def cli():
 p=argparse.ArgumentParser();p.add_argument('--train-file');p.add_argument('--eval-file');p.add_argument('--output-dir');p.add_argument('--epochs',type=int,default=8);p.add_argument('--max-length',type=int,default=160);p.add_argument('--lr',type=float,default=1e-4);p.add_argument('--beta',type=float,default=.3);p.add_argument('--sft-weight',type=float,default=.08);p.add_argument('--seed',type=int,default=35);return p.parse_args()

def rows(path):
 data=[json.loads(x) for x in Path(path).read_text().splitlines() if x.strip()];ids=set()
 for r in data:
  if not r.get('id') or r['id'] in ids or r.get('verification',{}).get('verified') is not True: raise ValueError(f'invalid pair {r.get("id")}')
  ids.add(r['id'])
  if not all(str(r.get(k,'')).strip() for k in ('prompt','chosen','rejected')) or r['chosen'].strip()==r['rejected'].strip(): raise ValueError(f'incomplete pair {r["id"]}')
 return data

def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()

def encode(tok,prompt,response,maxlen):
 prefix=tok.apply_chat_template([{'role':'system','content':SYSTEM},{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True)
 full=prefix+response+tok.eos_token;plen=len(tok(prefix,add_special_tokens=False)['input_ids']);b=tok(full,add_special_tokens=False,return_tensors='pt',truncation=True,max_length=maxlen);lab=b['input_ids'].clone();lab[:,:min(plen,lab.shape[1]-1)]=-100
 if int((lab!=-100).sum())<2: raise ValueError('response truncated')
 b['labels']=lab;return b

def avg_logp(model,b):
 out=model(input_ids=b['input_ids'],attention_mask=b['attention_mask']);logits=out.logits[:,:-1];targets=b['labels'][:,1:];mask=targets!=-100;safe=targets.masked_fill(~mask,0);lp=F.log_softmax(logits,dim=-1).gather(-1,safe.unsqueeze(-1)).squeeze(-1);return (lp*mask).sum(-1)/mask.sum(-1).clamp_min(1)

def pref(model,pairs):
 model.eval();m=[]
 with torch.no_grad():
  for c,r in pairs:m.append(float((avg_logp(model,c)-avg_logp(model,r)).cpu()))
 return {'accuracy':sum(x>0 for x in m)/len(m),'meanMargin':sum(m)/len(m),'minimumMargin':min(m),'margins':m}

def lang(model,batches):
 model.eval();v=[]
 with torch.no_grad():
  for b in batches:v.append(float(model(**b).loss.cpu()))
 return sum(v)/len(v)

def main():
 a=cli();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1)
 tr,ev=rows(a.train_file),rows(a.eval_file)
 if {x['id'] for x in tr}&{x['id'] for x in ev}:raise ValueError('split contamination')
 start=time.time();tok=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 train=[(encode(tok,x['prompt'],x['chosen'],a.max_length),encode(tok,x['prompt'],x['rejected'],a.max_length)) for x in tr];test=[(encode(tok,x['prompt'],x['chosen'],a.max_length),encode(tok,x['prompt'],x['rejected'],a.max_length)) for x in ev]
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True);base.config.use_cache=False;base_pref=pref(base,test);base_loss=lang(base,[x[0] for x in test]);refs=[];base.eval()
 with torch.no_grad():
  for c,r in train:refs.append((avg_logp(base,c).detach(),avg_logp(base,r).detach()))
 model=get_peft_model(base,LoraConfig(r=4,lora_alpha=8,lora_dropout=0.0,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=['q_proj','v_proj']));pars=[p for p in model.parameters() if p.requires_grad];before=[p.detach().clone() for p in pars];opt=AdamW(pars,lr=a.lr);losses=[];dpo_losses=[];sft_losses=[]
 for _ in range(a.epochs):
  model.train()
  for i,(c,r) in enumerate(train):
   opt.zero_grad(set_to_none=True);pc,pr=avg_logp(model,c),avg_logp(model,r);rc,rr=refs[i];dpo=-F.logsigmoid(a.beta*((pc-pr)-(rc-rr))).mean();sft=-pc.mean();loss=dpo+a.sft_weight*sft;loss.backward();torch.nn.utils.clip_grad_norm_(pars,1.0);opt.step();losses.append(float(loss.detach()));dpo_losses.append(float(dpo.detach()));sft_losses.append(float(sft.detach()))
 delta=math.sqrt(sum(float(torch.sum((p.detach()-q)**2)) for p,q in zip(pars,before)));cand_pref=pref(model,test);cand_loss=lang(model,[x[0] for x in test]);root=Path(a.output_dir);ad=root/'adapter';ad.mkdir(parents=True,exist_ok=True);model.save_pretrained(ad,safe_serialization=True);tok.save_pretrained(ad);w=ad/'adapter_model.safetensors'
 freeze=subprocess.run([os.sys.executable,'-m','pip','freeze'],capture_output=True,text=True,check=True).stdout;(root/'environment.txt').write_text(freeze)
 metrics={'schemaVersion':'1.0.0','experimentId':'hector-asi-qwen05-dpo-v3','status':'experimental-anchored-preference-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'length-normalized LoRA DPO with chosen-response SFT anchor','dataset':{'trainPath':a.train_file,'trainSha256':sha(a.train_file),'trainPairs':len(tr),'evalPath':a.eval_file,'evalSha256':sha(a.eval_file),'evalPairs':len(ev),'privateUserData':False,'splitContaminationChecked':True},'hyperparameters':{'epochs':a.epochs,'maxLength':a.max_length,'learningRate':a.lr,'beta':a.beta,'sftWeight':a.sft_weight,'seed':a.seed,'rank':4,'alpha':8},'results':{'steps':len(losses),'firstTotalLoss':losses[0],'finalTotalLoss':losses[-1],'firstDpoLoss':dpo_losses[0],'finalDpoLoss':dpo_losses[-1],'firstSftLoss':sft_losses[0],'finalSftLoss':sft_losses[-1],'basePreferenceAccuracy':base_pref['accuracy'],'candidatePreferenceAccuracy':cand_pref['accuracy'],'baseMeanPreferenceMargin':base_pref['meanMargin'],'candidateMeanPreferenceMargin':cand_pref['meanMargin'],'candidateMinimumPreferenceMargin':cand_pref['minimumMargin'],'candidateMargins':cand_pref['margins'],'baseLanguageLoss':base_loss,'candidateLanguageLoss':cand_loss,'languageLossRelativeChange':(cand_loss-base_loss)/base_loss,'parameterDeltaL2':delta,'trainableParameters':sum(p.numel() for p in pars),'weightsGenerated':True,'adapterBytes':w.stat().st_size,'adapterSha256':sha(w)},'promotionDecision':{'decision':'evaluate-only','blockedBy':'0.5B base and six hidden preference pairs are insufficient for champion promotion.'},'runtime':{'seconds':time.time()-start,'python':platform.python_version(),'torch':torch.__version__,'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n');files=sorted(x for x in root.rglob('*') if x.is_file());(root/'SHA256SUMS').write_text(''.join(f'{sha(x)}  {x.relative_to(root)}\n' for x in files));print(json.dumps(metrics,indent=2,sort_keys=True))
if __name__=='__main__':main()
