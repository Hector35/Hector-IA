#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import math
import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

NUMBER_RE = re.compile(r"(?<![\w.])-?\d+(?:\.\d+)?")
CODE_RE = re.compile(r"```(?:python)?\s*(.*?)```", re.I | re.S)


def load_jsonl(path: Path) -> list[dict]:
    rows=[]
    for line_no,line in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
        if not line.strip(): continue
        try: rows.append(json.loads(line))
        except Exception as exc: raise SystemExit(f'{path}:{line_no}: invalid JSON: {exc}')
    return rows


def numeric_score(answer: str, verifier: dict) -> tuple[float,str]:
    values=[float(x) for x in NUMBER_RE.findall(answer)]
    expected=float(verifier['expected']); tol=float(verifier.get('tolerance',0))
    ok=any(math.isfinite(v) and abs(v-expected)<=tol for v in values)
    return (1.0 if ok else 0.0, f'expected={expected}; parsed={values[-8:]}')


def extract_code(answer: str) -> str:
    match=CODE_RE.search(answer)
    return (match.group(1) if match else answer).strip()


def validate_python(code: str) -> None:
    tree=ast.parse(code)
    forbidden=(ast.Import,ast.ImportFrom,ast.With,ast.AsyncWith,ast.ClassDef,ast.Global,ast.Nonlocal)
    if any(isinstance(node,forbidden) for node in ast.walk(tree)):
        raise ValueError('forbidden Python construct')
    calls={node.func.id for node in ast.walk(tree) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name)}
    if calls & {'eval','exec','compile','open','input','__import__'}:
        raise ValueError('forbidden Python call')


def code_score(answer: str, verifier: dict) -> tuple[float,str]:
    code=extract_code(answer)
    try: validate_python(code)
    except Exception as exc: return 0.0,f'code rejected: {exc}'
    payload=json.dumps(verifier['tests'],ensure_ascii=False)
    harness=f'''{code}\n\nimport json\ntests=json.loads({payload!r})\npassed=0\nfor test in tests:\n    got=solve(*test["input"])\n    if got==test["expected"]: passed+=1\nprint(json.dumps({{"passed":passed,"total":len(tests)}}))\n'''
    try:
        with tempfile.TemporaryDirectory() as tmp:
            script=Path(tmp)/'candidate.py'; script.write_text(harness,encoding='utf-8')
            proc=subprocess.run([sys.executable,'-I',str(script)],capture_output=True,text=True,timeout=float(verifier.get('timeoutSeconds',2)),check=False)
        if proc.returncode!=0: return 0.0,f'python failed: {proc.stderr[-300:]}'
        result=json.loads(proc.stdout.splitlines()[-1]); score=result['passed']/max(1,result['total'])
        return score,f"tests={result['passed']}/{result['total']}"
    except Exception as exc: return 0.0,f'python exception: {exc}'


def rubric_score(answer: str, verifier: dict) -> tuple[float,str]:
    text=' '.join(answer.lower().split())
    required=verifier['requiredConcepts']; forbidden=verifier.get('forbiddenClaims',[])
    hits=[term for term in required if term.lower() in text]
    bad=[term for term in forbidden if term.lower() in text]
    threshold=int(verifier.get('minimumConcepts',len(required)))
    score=min(1.0,len(hits)/max(1,threshold))
    if bad: score=0.0
    return score,f'hits={hits}; forbidden={bad}'


def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument('--benchmark',type=Path,required=True)
    p.add_argument('--responses',type=Path,required=True,help='JSONL with id, response, model, effectiveModel, fallback')
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    cases={row['id']:row for row in load_jsonl(args.benchmark)}
    responses=load_jsonl(args.responses)
    seen=set(); details=[]; by_category=defaultdict(list); effective=Counter(); fallbacks=0
    for row in responses:
        case_id=row.get('id')
        if case_id not in cases or case_id in seen: continue
        seen.add(case_id); case=cases[case_id]; answer=str(row.get('response',''))
        verifier=case['verifier']; kind=verifier['type']
        score,reason=(numeric_score(answer,verifier) if kind=='numeric' else code_score(answer,verifier) if kind=='python_function' else rubric_score(answer,verifier))
        effective_model=str(row.get('effectiveModel') or row.get('model') or 'unknown')
        fallback=bool(row.get('fallback',False)); fallbacks+=int(fallback); effective[effective_model]+=1
        by_category[case['category']].append(score)
        details.append({'id':case_id,'category':case['category'],'score':score,'verifier':kind,'effectiveModel':effective_model,'fallback':fallback,'reason':reason})
    missing=sorted(set(cases)-seen)
    category_scores={k:sum(v)/len(v) for k,v in sorted(by_category.items())}
    total=sum(d['score'] for d in details); denominator=len(cases)
    report={'schemaVersion':1,'benchmarkVersion':'2.1.0','cases':len(cases),'scored':len(details),'missing':len(missing),'score':total/denominator if denominator else 0,'categoryScores':category_scores,'effectiveModels':dict(effective),'fallbackResponses':fallbacks,'complete':not missing,'trainingGateEligible':not missing and fallbacks==0,'missingIds':missing,'details':details}
    args.out.parent.mkdir(parents=True,exist_ok=True); args.out.write_text(json.dumps(report,indent=2,ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('cases','scored','missing','score','effectiveModels','fallbackResponses','trainingGateEligible')},sort_keys=True))
    if missing or fallbacks: raise SystemExit(2)

if __name__=='__main__': main()
