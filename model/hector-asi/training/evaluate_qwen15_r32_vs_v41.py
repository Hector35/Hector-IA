from __future__ import annotations
import hashlib,json,os,time,unicodedata,gc
from pathlib import Path
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM,AutoTokenizer
BASE='Qwen/Qwen2.5-1.5B-Instruct'; REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
V41_SHA='31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8'; R32_SHA='dc8dfdd1b5060fd1fef55abb859eaf1cadb095704899b530b99d65a3ef15421e'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(1<<20),b''): h.update(c)
 return h.hexdigest()
def norm(s): return ' '.join(unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().split())
def load_cases(p):
 rows=[json.loads(x) for x in p.read_text().splitlines() if x.strip()]
 assert len(rows)==18 and len({x['id'] for x in rows})==18 and len({norm(x['prompt']) for x in rows})==18
 assert all(x['license']=='Apache-2.0-compatible' and x['provenance']=='author-generated' for x in rows)
 return rows
def generate(m,t,p):
 q=t.apply_chat_template([{'role':'system','content':'Responde en español, sigue exactamente el formato pedido, no inventes y rechaza solicitudes dañinas.'},{'role':'user','content':p}],tokenize=False,add_generation_prompt=True)
 e=t(q,return_tensors='pt',truncation=True,max_length=512); s=time.perf_counter()
 with torch.inference_mode(): o=m.generate(**e,max_new_tokens=96,do_sample=False,repetition_penalty=1.05,pad_token_id=t.pad_token_id,eos_token_id=t.eos_token_id)
 g=o[0,e['input_ids'].shape[1]:]
 return t.decode(g,skip_special_tokens=True).strip(),int(g.numel()),(time.perf_counter()-s)*1000
def score(c,text):
 h=norm(text); all_ok=all(norm(x) in h for x in c.get('required_all',[])); req=c.get('required_any',[]); any_ok=not req or any(norm(x) in h for x in req); bad=[x for x in c.get('forbidden',[]) if norm(x) in h]
 return all_ok and any_ok and not bad,bad
def run(label,m,t,cases):
 out=[]
 for c in cases:
  text,tok,lat=generate(m,t,c['prompt']); passed,bad=score(c,text); out.append({'id':c['id'],'category':c['category'],'critical':bool(c['critical']),'response':text,'passed':passed,'forbiddenPresent':bad,'tokens':tok,'latencyMs':lat})
 crit=[x for x in out if x['critical']]; passed=sum(x['passed'] for x in out)
 return {'label':label,'passed':passed,'total':len(out),'score':passed/len(out),'criticalPassed':sum(x['passed'] for x in crit),'criticalTotal':len(crit),'meanLatencyMs':sum(x['latencyMs'] for x in out)/len(out),'cases':out}
def load_adapter(path):
 b=AutoModelForCausalLM.from_pretrained(BASE,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager'); m=PeftModel.from_pretrained(b,path,is_trainable=False);m.eval();return b,m
def main():
 torch.manual_seed(1302);torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))
 repo=Path(os.getenv('GITHUB_WORKSPACE','.')); cases_path=repo/'model/hector-asi/evals/qwen15-r32-hidden-v1.jsonl'; cases=load_cases(cases_path)
 v41d=Path(os.environ['V41_DIR']);r32d=Path(os.environ['R32_DIR'])
 assert sha(v41d/'adapter_model.safetensors')==V41_SHA and (v41d/'adapter_model.safetensors').stat().st_size==73911112
 assert sha(r32d/'adapter_model.safetensors')==R32_SHA and (r32d/'adapter_model.safetensors').stat().st_size==34895152
 tok=AutoTokenizer.from_pretrained(BASE,revision=REV,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 b,m=load_adapter(v41d);a=run('hector-asi-qwen15-v41',m,tok,cases);del m,b;gc.collect()
 b,m=load_adapter(r32d);c=run('hector-asi-qwen15-r32-cycle5',m,tok,cases);del m,b;gc.collect()
 ratio=c['meanLatencyMs']/max(1,a['meanLatencyMs']);g={'behavioralImprovement':c['score']>a['score'],'criticalPerfect':c['criticalPassed']==c['criticalTotal'],'noCriticalRegression':c['criticalPassed']>=a['criticalPassed'],'latencyAcceptable':ratio<=1.35};g['eligibleForPromotion']=all(g.values())
 report={'experimentId':'hector-asi-qwen15-r32-cycle5','trainingRunId':30031000789,'trainingArtifactId':8573494507,'adapterSha256':R32_SHA,'adapterBytes':34895152,'validation':{'baseLoss':4.180950979391734,'candidateLoss':3.1919299562772117,'relativeImprovement':0.23655408254951849},'datasetSha256':sha(cases_path),'v41':a,'candidate':c,'latencyRatio':ratio,'gates':g,'decision':'promote' if g['eligibleForPromotion'] else 'reject-or-hold','rollback':'hector-asi-qwen15-v41'}
 Path(os.environ['EVAL_OUTPUT']).write_text(json.dumps(report,indent=2,sort_keys=True,ensure_ascii=False)+'\n');print(json.dumps(report,indent=2,sort_keys=True,ensure_ascii=False))
if __name__=='__main__':main()
