#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re,sys
from fractions import Fraction
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
BASE=ROOT/'model/hector-asi/data/stage6'
SFT=BASE/'generated/cognitive-depth-sft-20260725.jsonl'
PREF=BASE/'generated/cognitive-depth-preference-20260725.jsonl'
MANIFEST=BASE/'cognitive-depth-20260725.json'
BENCH=ROOT/'model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json'

def sha(v):
 raw=v if isinstance(v,bytes) else json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
 return hashlib.sha256(raw).hexdigest()
def norm(s): return re.sub(r'[^a-z0-9áéíóúñ]+',' ',s.lower()).strip()
def rows(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]

def main():
 sft,pref=rows(SFT),rows(PREF); all_rows=sft+pref;m=json.loads(MANIFEST.read_text())
 assert len(sft)==960 and len(pref)==240 and len(all_rows)==1200
 assert m['counts']=={'sft':960,'preference':240,'total':1200}
 assert m['distribution']=={'adaptive_planning':300,'distributed_debugging':300,'mathematical_reasoning':300,'multi_tool_chaining':300}
 assert m['splits']=={'train':960,'validation':120,'test':120}
 assert m['pwa_feedback']['observed_human_approved']==m['pwa_feedback']['accepted']==m['pwa_feedback']['rejected']==0
 assert m['containsPrivateUserData'] is False and m['benchmarkExcluded'] is True
 ids=[r['id'] for r in all_rows];keys=[r['semantic_key'] for r in all_rows]
 assert len(ids)==len(set(ids))==1200
 assert len(keys)==len(set(keys))==1200
 prompts=[]
 for r in all_rows:
  copy=dict(r);expected=copy.pop('sha256');assert sha(copy)==expected
  assert r['origin']=='project-authored-deterministic-synthetic'
  assert r['review_scope']=='automated-structure-and-executable-verification'
  assert r['decision']=='accepted' and r['benchmark_excluded'] is True
  assert r['split'] in {'train','validation','test'}
  assert r['provenance']['containsPrivateUserData'] is False and r['provenance']['pwaFeedbackId'] is None
  p=r['messages'][1]['content'] if r['format']=='chat-sft' else r['prompt'][1]['content'];prompts.append(norm(p))
 assert len(prompts)==len(set(prompts))
 bench_text=norm(BENCH.read_text(encoding='utf-8'))
 for p in prompts: assert len(p)>30 and p not in bench_text
 # executable exact math verification
 for r in [x for x in sft if x['capability']=='mathematical_reasoning']:
  v=r['verification'];answer=json.loads(r['messages'][2]['content'])
  assert answer['numerador']==v['expectedNumerator'] and answer['denominador']==v['expectedDenominator']
  assert Fraction(answer['numerador'],answer['denominador'])==Fraction(v['expectedNumerator'],v['expectedDenominator'])
 # adaptive policy and distributed/tool contracts
 for r in [x for x in sft if x['capability']=='adaptive_planning']:
  a=json.loads(r['messages'][2]['content']);assert a['acción']==r['verification']['expectedAction'];assert a['rollback'] and a['evidencia_requerida']
 for r in [x for x in sft if x['capability']=='distributed_debugging']:
  a=json.loads(r['messages'][2]['content']);assert a['métrica_primaria']==r['verification']['requiredMetric'];assert a['falsación'] and a['rollback']
 for r in [x for x in sft if x['capability']=='multi_tool_chaining']:
  a=json.loads(r['messages'][2]['content']);assert a['tools']==r['verification']['expectedOrder'];assert [s['tool'] for s in a['steps']]==a['tools'];assert all(s['on_failure']=='stop_and_record' for s in a['steps'])
 assert m['files'][str(SFT.relative_to(ROOT))]==sha(SFT.read_bytes())
 assert m['files'][str(PREF.relative_to(ROOT))]==sha(PREF.read_bytes())
 copy=dict(m);expected=copy.pop('sha256');assert sha(copy)==expected
 print(json.dumps({'verified':True,'total':1200,'sft':960,'preference':240,'splits':m['splits'],'distribution':m['distribution'],'manifestSha256':m['sha256'],'benchmarkLeakageExact':0,'pwaAccepted':0,'pwaRejected':0},sort_keys=True))
if __name__=='__main__':
 try: main()
 except Exception as e:
  print(f'verification failed: {e}',file=sys.stderr);raise
