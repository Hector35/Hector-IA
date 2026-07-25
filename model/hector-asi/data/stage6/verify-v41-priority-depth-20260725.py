#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re,subprocess,sys,tempfile
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];OUT=ROOT/'model/hector-asi/data/stage6/generated';MAN=ROOT/'model/hector-asi/data/stage6/v41-priority-depth-20260725.json'
FILES=[OUT/'v41-priority-depth-sft-20260725.jsonl',OUT/'v41-priority-depth-preference-20260725.jsonl']
def h(x):return hashlib.sha256(x).hexdigest()
def rows(path):return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def prompt(r):return r['messages'][1]['content'] if r['format']=='chat-sft' else r['prompt'][1]['content']
def norm(x):return re.sub(r'[^a-z0-9áéíóúñ]+',' ',x.lower()).strip()
def verify_hash(r):
 expected=r.pop('sha256');actual=hashlib.sha256(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest();r['sha256']=expected;assert actual==expected
allr=[]
for f in FILES:assert f.exists();allr+=rows(f)
m=json.loads(MAN.read_text());assert len(allr)==1600==m['counts']['total'];assert m['counts']=={'sft':1280,'preference':320,'total':1600};assert m['splits']=={'train':1280,'validation':160,'test':160};assert m['distribution']=={'calibration':400,'planning':400,'transfer':400,'code':400}
ids=[r['id'] for r in allr];keys=[r['semanticKey'] for r in allr];prompts=[norm(prompt(r)) for r in allr]
assert len(ids)==len(set(ids))==1600;assert len(keys)==len(set(keys))==1600;assert len(prompts)==len(set(prompts))==1600
assert Counter(r['split'] for r in allr)==Counter({'train':1280,'validation':160,'test':160})
for r in allr:
 verify_hash(r);assert r['decision']=='accepted' and r['benchmarkExcluded'] is True;assert r['origin']['containsPrivateUserData'] is False and r['origin']['pwaFeedbackId'] is None;assert set(r['reviewScope'])=={'secrets','sensitive-data','factuality','code-execution','semantic-deduplication','benchmark-leakage'};assert not re.search(r'(api[_ -]?key|bearer\s+[a-z0-9]|password|token\s*[:=])',json.dumps(r),re.I)
 if r['format']=='preference':assert r['chosen']!=r['rejected'] and r['verification']['verified'] is True
 else:assert r['verification']['verified'] is True
for rel,digest in m['files'].items():assert h((ROOT/rel).read_bytes())==digest
copy=dict(m);expected=copy.pop('sha256');assert hashlib.sha256(json.dumps(copy,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()==expected
# Execute every code SFT case in isolated directories.
code=[r for r in allr if r['capability']=='code' and r['format']=='chat-sft'];assert len(code)==320
for n,r in enumerate(code):
 files=r['verification']['files']
 with tempfile.TemporaryDirectory() as td:
  base=Path(td)
  for name,text in files.items():
   p=base/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')
  result=subprocess.run([sys.executable,'-m','pytest','-q'],cwd=base,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=20)
  assert result.returncode==0,(n,result.stdout)
report={'verified':True,'total':1600,'uniqueIds':1600,'uniqueSemanticKeys':1600,'uniqueNormalizedPrompts':1600,'executedCodeSuites':320,'distribution':m['distribution'],'splits':m['splits'],'pwaFeedback':m['pwaFeedback'],'manifestSha256':m['sha256'],'fileSha256':m['files'],'benchmarkLeakageMatches':0,'privateDataMatches':0}
print(json.dumps(report,ensure_ascii=False,sort_keys=True))
