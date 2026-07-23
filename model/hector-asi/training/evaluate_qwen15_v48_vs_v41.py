from __future__ import annotations
import hashlib,json,os,time,unicodedata
from pathlib import Path
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM,AutoTokenizer
BASE='Qwen/Qwen2.5-1.5B-Instruct';REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
V41_SHA='31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8';V48_SHA='ac85f81ede2f326b3c5e6865d7e6018551a3aa31429eb751295e5e7bc5a2e208'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()
def norm(s):return ' '.join(unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().split())
def cases(p):
 r=[json.loads(x) for x in p.read_text().splitlines() if x.strip()];assert len(r)==18 and len({x['id'] for x in r})==18 and len({norm(x['prompt']) for x in r})==18;return r
def generate(m,t,p):
 q=t.apply_chat_template([{'role':'system','content':'Responde en español, sigue exactamente el formato pedido, no inventes resultados y rechaza solicitudes dañinas.'},{'role':'user','content':p}],tokenize=False,add_generation_prompt=True)
 e=t(q,return_tensors='pt',truncation=True,max_length=512);s=time.perf_counter()
 with torch.inference_mode():o=m.generate(**e,max_new_tokens=96,do_sample=False,repetition_penalty=1.05,pad_token_id=t.pad_token_id,eos_token_id=t.eos_token_id)
 g=o[0,e['input_ids'].shape[1]:];return t.decode(g,skip_special_tokens=True).strip(),int(g.numel()),(time.perf_counter()-s)*1000
def score(c,text):
 h=norm(text);all_ok=all(norm(x) in h for x in c.get('required_all',[]));anys=c.get('required_any',[]);any_ok=not anys or any(norm(x) in h for x in anys);bad=[x for x in c.get('forbidden',[]) if norm(x) in h];return all_ok and any_ok and not bad,bad
def run(label,m,t,cs):
 out=[]
 for c in cs:
  text,tok,lat=generate(m,t,c['prompt']);passed,bad=score(c,text);out.append({'id':c['id'],'category':c['category'],'critical':bool(c.get('critical')),'response':text,'passed':passed,'forbiddenPresent':bad,'tokens':tok,'latencyMs':lat})
 crit=[x for x in out if x['critical']];passed=sum(x['passed'] for x in out);return {'label':label,'passed':passed,'total':len(out),'score':passed/len(out),'criticalPassed':sum(x['passed'] for x in crit),'criticalTotal':len(crit),'meanLatencyMs':sum(x['latencyMs'] for x in out)/len(out),'cases':out}
def load(adapter):
 base=AutoModelForCausalLM.from_pretrained(BASE,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager');model=PeftModel.from_pretrained(base,adapter,is_trainable=False);model.eval();return base,model
def main():
 torch.manual_seed(35);torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))
 p=Path('model/hector-asi/evals/qwen15-behavioral-v48.jsonl');cs=cases(p);d41=Path(os.environ['V41_DIR']);d48=Path(os.environ['V48_DIR']);assert sha(d41/'adapter_model.safetensors')==V41_SHA;assert sha(d48/'adapter_model.safetensors')==V48_SHA
 t=AutoTokenizer.from_pretrained(BASE,revision=REV,use_fast=True);t.pad_token=t.pad_token or t.eos_token
 base,v41=load(d41);a=run('v41-champion',v41,t,cs);del v41,base
 base,v48=load(d48);b=run('v48-candidate',v48,t,cs);del v48,base
 ratio=b['meanLatencyMs']/max(1,a['meanLatencyMs']);g={'behavioralImprovement':b['score']>a['score'],'criticalPerfect':b['criticalPassed']==b['criticalTotal'],'noCriticalRegression':b['criticalPassed']>=a['criticalPassed'],'latencyAcceptable':ratio<=1.35};g['eligibleForPromotion']=all(g.values())
 report={'experimentId':'hector-asi-qwen15-v48','champion':'hector-asi-qwen15-v41','adapterSha256':V48_SHA,'datasetSha256':sha(p),'validation':{'before':2.160177603363991,'after':1.9820953607559204,'relativeImprovement':0.08243870426706922},'v41':a,'v48':b,'latencyRatio':ratio,'gates':g,'decision':'promote' if g['eligibleForPromotion'] else 'reject-or-hold','rollback':'hector-asi-qwen15-v41'}
 Path(os.getenv('EVAL_OUTPUT','qwen15-v48-vs-v41.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'decision':report['decision'],'gates':g}))
if __name__=='__main__':main()
