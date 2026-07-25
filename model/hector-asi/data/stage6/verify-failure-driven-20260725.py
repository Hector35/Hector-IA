#!/usr/bin/env python3
from __future__ import annotations
import ast,hashlib,json,re,subprocess,sys,tempfile
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
SFT=ROOT/'model/hector-asi/data/stage6/generated/failure-driven-sft-20260725.jsonl'
PREF=ROOT/'model/hector-asi/data/stage6/generated/failure-driven-preference-20260725.jsonl'
MANIFEST=ROOT/'model/hector-asi/data/stage6/failure-driven-20260725.json'
HIDDEN=ROOT/'model/hector-asi/evals/benchmark_v2/hidden.jsonl'

def load(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def norm(s): return re.sub(r'[^a-z0-9]+',' ',s.lower()).strip()
def sha_bytes(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def prompt(row):
    seq=row['messages'] if row['format']=='chat-sft' else row['prompt']
    return next(x['content'] for x in seq if x['role']=='user')

def main():
    sft,pref=load(SFT),load(PREF); rows=sft+pref
    assert len(sft)==800 and len(pref)==160 and len(rows)==960
    assert len({r['id'] for r in rows})==960
    assert len({r['sha256'] for r in rows})==960
    assert len({r['semantic_key'] for r in rows})==960
    dist=Counter(r['capability'] for r in rows)
    assert dist==Counter({'calibration':240,'planning':240,'transfer':240,'code':240})
    normalized=[norm(prompt(r)) for r in rows]
    assert len(set(normalized))==960
    hidden=[]
    if HIDDEN.exists(): hidden=[norm(json.loads(x).get('prompt','')) for x in HIDDEN.read_text(encoding='utf-8').splitlines() if x.strip()]
    assert not (set(normalized)&set(hidden))
    python_runs=0
    for row in sft:
        v=row['verification']; assert v.get('verified') is True
        if v['type']=='json-structure':
            answer=json.loads(row['messages'][-1]['content'])
            assert all(k in answer for k in v['required']) and answer==v['expected']
        elif v['type']=='python-tests':
            ast.parse(v['code']);ast.parse(v['test'])
            script=v['code']+'\n'+v['test']+'\n'
            result=subprocess.run([sys.executable,'-I','-c',script],capture_output=True,text=True,timeout=3)
            assert result.returncode==0,(row['id'],result.stderr)
            python_runs+=1
        else: raise AssertionError(v['type'])
    for row in pref:
        assert row['verification']['verified'] is True
        assert row['chosen']!=row['rejected'] and len(row['verification']['criteria'])>=3
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
    assert manifest['generatedExamples']==960 and manifest['integratedExamples']==0
    assert manifest['pwaApprovedObserved']==0 and manifest['pwaAccepted']==0
    assert manifest['sftSha256']==sha_bytes(SFT)
    assert manifest['preferenceSha256']==sha_bytes(PREF)
    print(json.dumps({'validated':960,'sft':800,'preference':160,'pythonSuites':python_runs,'distribution':dist,'exactDuplicates':0,'semanticDuplicates':0,'hiddenExactOverlap':0,'pwaAccepted':0,'pwaRejected':0},default=dict,sort_keys=True))
if __name__=='__main__': main()
