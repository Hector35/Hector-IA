#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

TOKEN_RE=re.compile(r"[a-záéíóúüñ0-9_]+",re.I)


def rows(path:Path):
    for line_no,line in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
        if not line.strip(): continue
        try: yield json.loads(line)
        except Exception as exc: raise SystemExit(f'{path}:{line_no}: invalid JSON: {exc}')


def text_from(row:dict)->str:
    if isinstance(row.get('prompt'),str): return row['prompt']
    messages=row.get('messages')
    if isinstance(messages,list):
        return '\n'.join(str(x.get('content','')) for x in messages if isinstance(x,dict) and x.get('role')=='user')
    return str(row.get('instruction') or row.get('input') or '')


def normalized(text:str)->str:
    return ' '.join(TOKEN_RE.findall(text.lower()))


def shingles(text:str,n:int=5)->set[tuple[str,...]]:
    tokens=normalized(text).split()
    if len(tokens)<n: return {tuple(tokens)} if tokens else set()
    return {tuple(tokens[i:i+n]) for i in range(len(tokens)-n+1)}


def similarity(a:set,b:set)->float:
    return len(a&b)/len(a|b) if a and b else 0.0


def main():
    p=argparse.ArgumentParser(); p.add_argument('--benchmark',type=Path,required=True); p.add_argument('--corpus',type=Path,nargs='+',required=True); p.add_argument('--out',type=Path,required=True); p.add_argument('--threshold',type=float,default=.72); args=p.parse_args()
    benchmark=list(rows(args.benchmark)); corpus=[]
    for path in args.corpus:
        if path.exists(): corpus.extend((str(path),row) for row in rows(path))
    bench=[(r['id'],normalized(text_from(r)),shingles(text_from(r))) for r in benchmark]
    exact={norm:case_id for case_id,norm,_ in bench if norm}
    exact_hits=[]; semantic_hits=[]
    for source,row in corpus:
        text=text_from(row); norm=normalized(text)
        if not norm: continue
        corpus_id=str(row.get('id') or row.get('example_id') or hashlib.sha256(norm.encode()).hexdigest()[:16])
        if norm in exact:
            exact_hits.append({'benchmarkId':exact[norm],'corpusId':corpus_id,'source':source}); continue
        sig=shingles(text)
        best=(0.0,None)
        for case_id,_,bench_sig in bench:
            score=similarity(sig,bench_sig)
            if score>best[0]: best=(score,case_id)
        if best[0]>=args.threshold: semantic_hits.append({'benchmarkId':best[1],'corpusId':corpus_id,'source':source,'similarity':round(best[0],6)})
    report={'schemaVersion':1,'benchmarkCases':len(benchmark),'corpusExamples':len(corpus),'threshold':args.threshold,'exactHits':exact_hits,'semanticHits':semantic_hits,'clean':not exact_hits and not semantic_hits}
    args.out.parent.mkdir(parents=True,exist_ok=True); args.out.write_text(json.dumps(report,indent=2,ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('benchmarkCases','corpusExamples','threshold','clean')},sort_keys=True))
    if not report['clean']: raise SystemExit(3)

if __name__=='__main__': main()
