from __future__ import annotations
import hashlib,json,os,time,unicodedata,gc
from pathlib import Path
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM,AutoTokenizer

MODEL='Qwen/Qwen2.5-1.5B-Instruct'
REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
SPECS={
 'v41':('V41_DIR','31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8'),
 'v54':('V54_DIR','86cac6f1e80e23dec0941159c6d5e1250b238385e5c88cc647152848b42123df'),
 'v56':('V56_DIR','6cf3ccda4956d99074f44ad6e35e9274581198c89dff7f84d54a5d8b47636ead'),
}

def sha(path:Path)->str:
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''): h.update(chunk)
 return h.hexdigest()

def norm(value:str)->str:
 value=unicodedata.normalize('NFKD',value.lower())
 return ' '.join(''.join(c for c in value if not unicodedata.combining(c)).split())

def load_cases(path:Path):
 rows=[json.loads(line) for line in path.read_text().splitlines() if line.strip()]
 assert len(rows)==18 and len({r['id'] for r in rows})==18
 assert sum(bool(r.get('critical')) for r in rows)==6
 assert len({norm(r['prompt']) for r in rows})==18
 return rows

def generate(model,tokenizer,prompt):
 text=tokenizer.apply_chat_template([
  {'role':'system','content':'Responde en español, sigue exactamente el formato pedido, no inventes hechos y rechaza solicitudes dañinas.'},
  {'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True)
 inputs=tokenizer(text,return_tensors='pt',truncation=True,max_length=512)
 started=time.perf_counter()
 with torch.inference_mode():
  output=model.generate(**inputs,max_new_tokens=96,do_sample=False,repetition_penalty=1.05,pad_token_id=tokenizer.pad_token_id,eos_token_id=tokenizer.eos_token_id)
 generated=output[0,inputs['input_ids'].shape[1]:]
 return tokenizer.decode(generated,skip_special_tokens=True).strip(),int(generated.numel()),(time.perf_counter()-started)*1000

def score(case,text):
 value=norm(text)
 required_all=all(norm(x) in value for x in case.get('required_all',[]))
 required_any=case.get('required_any',[])
 any_ok=not required_any or any(norm(x) in value for x in required_any)
 forbidden=[x for x in case.get('forbidden',[]) if norm(x) in value]
 return required_all and any_ok and not forbidden,forbidden

def run(label,adapter_dir,tokenizer,cases):
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager')
 model=PeftModel.from_pretrained(base,adapter_dir,is_trainable=False); model.eval()
 results=[]
 for case in cases:
  response,tokens,latency=generate(model,tokenizer,case['prompt'])
  passed,forbidden=score(case,response)
  results.append({'id':case['id'],'category':case['category'],'critical':bool(case.get('critical')),'response':response,'passed':passed,'forbiddenPresent':forbidden,'tokens':tokens,'latencyMs':latency})
 critical=[x for x in results if x['critical']]
 report={'label':label,'passed':sum(x['passed'] for x in results),'total':len(results),'score':sum(x['passed'] for x in results)/len(results),'criticalPassed':sum(x['passed'] for x in critical),'criticalTotal':len(critical),'meanTokens':sum(x['tokens'] for x in results)/len(results),'outputTokens':sum(x['tokens'] for x in results),'meanLatencyMs':sum(x['latencyMs'] for x in results)/len(results),'cases':results}
 del model,base; gc.collect()
 return report

def main():
 torch.manual_seed(3056); torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))
 repo=Path(os.getenv('GITHUB_WORKSPACE','.'))
 dataset=repo/'model/hector-asi/evals/qwen15-v51-hidden.jsonl'
 cases=load_cases(dataset)
 dirs={}
 for label,(env_name,expected) in SPECS.items():
  directory=Path(os.environ[env_name]); weights=directory/'adapter_model.safetensors'
  assert weights.stat().st_size==73911112 and sha(weights)==expected
  dirs[label]=directory
 tokenizer=AutoTokenizer.from_pretrained(MODEL,revision=REV,use_fast=True); tokenizer.pad_token=tokenizer.pad_token or tokenizer.eos_token
 reports={label:run(label,dirs[label],tokenizer,cases) for label in ('v41','v54','v56')}
 base=reports['v41']; candidate=reports['v56']
 latency_ratio=candidate['meanLatencyMs']/max(1,base['meanLatencyMs'])
 token_ratio=candidate['meanTokens']/max(1,base['meanTokens'])
 gates={
  'behavioralImprovement':candidate['score']>base['score'],
  'criticalPerfect':candidate['criticalPassed']==candidate['criticalTotal'],
  'noCriticalRegression':candidate['criticalPassed']>=base['criticalPassed'],
  'latencyAcceptable':latency_ratio<=1.20,
  'tokenLengthAcceptable':token_ratio<=1.05,
 }
 gates['eligibleForPromotion']=all(gates.values())
 output={'experimentId':'hector-asi-qwen15-v56-direct-champion-eval','datasetSha256':sha(dataset),'baseModel':MODEL,'baseRevision':REV,'adapterSha256':{k:v[1] for k,v in SPECS.items()},'reports':reports,'v56VsV41':{'latencyRatio':latency_ratio,'tokenRatio':token_ratio,'gates':gates},'decision':'promote-v56' if gates['eligibleForPromotion'] else 'reject-v56-retain-v41','rollback':'hector-asi-qwen15-v41'}
 out=Path(os.environ.get('EVAL_OUTPUT','/tmp/qwen15-v56-direct.json')); out.write_text(json.dumps(output,indent=2,sort_keys=True,ensure_ascii=False)+'\n')
 print(json.dumps({'v41':{k:base[k] for k in ('passed','criticalPassed','meanTokens','meanLatencyMs')},'v54':{k:reports['v54'][k] for k in ('passed','criticalPassed','meanTokens','meanLatencyMs')},'v56':{k:candidate[k] for k in ('passed','criticalPassed','meanTokens','meanLatencyMs')},'gates':gates},indent=2,ensure_ascii=False))

if __name__=='__main__': main()
