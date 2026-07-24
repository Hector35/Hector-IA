#!/usr/bin/env python3
from __future__ import annotations

import argparse, ast, hashlib, json, math, re, subprocess, tempfile
from collections import Counter, defaultdict
from pathlib import Path

NUMBER_RE=re.compile(r"[-+]?\d+(?:\.\d+)?")


def rows(path:Path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def sha(path:Path): return hashlib.sha256(path.read_bytes()).hexdigest()

def numeric(answer:str, verifier:dict)->float:
    values=[float(x) for x in NUMBER_RE.findall(answer)]
    if not values:return 0.0
    expected=float(verifier['expected']); tol=float(verifier.get('tolerance',0))
    return 1.0 if any(abs(v-expected)<=tol for v in values) else 0.0

def extract_code(answer:str)->str:
    blocks=re.findall(r"```(?:python)?\s*(.*?)```",answer,re.S|re.I)
    return blocks[0] if blocks else answer

def code_score(answer:str, verifier:dict)->float:
    code=extract_code(answer)
    try: ast.parse(code)
    except SyntaxError:return 0.0
    tests=verifier['tests']; passed=0
    harness=code+"\nimport json,sys\n"
    for test in tests:
        program=harness+f"\nprint(json.dumps({verifier.get('entrypoint','solve')}(*{test['input']!r}),sort_keys=True))\n"
        try:
            out=subprocess.run(['python','-I','-c',program],capture_output=True,text=True,timeout=float(verifier.get('timeoutSeconds',2)))
            if out.returncode==0 and json.loads(out.stdout.strip().splitlines()[-1])==test['expected']: passed+=1
        except Exception: pass
    return passed/max(1,len(tests))

def rubric(answer:str, verifier:dict)->float:
    text=' '.join(answer.lower().split())
    required=verifier.get('requiredConcepts',[]); forbidden=verifier.get('forbiddenClaims',[])
    found=sum(1 for x in required if x.lower() in text)
    if any(x.lower() in text for x in forbidden): return 0.0
    minimum=max(1,int(verifier.get('minimumConcepts',len(required))))
    return min(1.0,found/minimum)

def main():
    p=argparse.ArgumentParser();p.add_argument('--hidden',required=True);p.add_argument('--predictions',required=True);p.add_argument('--output',required=True);p.add_argument('--expected-model',required=True);a=p.parse_args()
    hidden_path=Path(a.hidden); pred_path=Path(a.predictions); hidden=rows(hidden_path); preds=rows(pred_path)
    by_id={x['id']:x for x in preds}; expected_ids={x['id'] for x in hidden}
    if set(by_id)!=expected_ids: raise SystemExit(f'prediction ids mismatch missing={len(expected_ids-set(by_id))} extra={len(set(by_id)-expected_ids)}')
    category=defaultdict(list); failures=[]; attribution_failures=[]
    for case in hidden:
        pred=by_id[case['id']]
        requested=str(pred.get('requestedModel','')); effective=str(pred.get('effectiveModel',pred.get('model',''))); fallback=pred.get('fallback')
        attributable=requested==a.expected_model and effective==a.expected_model and fallback is False
        if not attributable: attribution_failures.append(case['id']); score=0.0
        else:
            answer=str(pred.get('answer',pred.get('content',''))); v=case['verifier']; typ=v['type']
            score=numeric(answer,v) if typ=='numeric' else code_score(answer,v) if typ=='python_function' else rubric(answer,v)
        category[case['category']].append(score)
        if score<1.0: failures.append({'idHash':hashlib.sha256(case['id'].encode()).hexdigest()[:16],'category':case['category'],'score':round(score,4),'trainable':score<0.75})
    total=sum(sum(v) for v in category.values())/len(hidden); trainable=sum(1 for x in failures if x['trainable'])
    report={'schemaVersion':1,'benchmarkVersion':hidden[0]['benchmarkVersion'],'hiddenCases':len(hidden),'hiddenSha256':sha(hidden_path),'predictionsSha256':sha(pred_path),'expectedModel':a.expected_model,'effectiveModelAttributionPassed':not attribution_failures,'attributionFailureCount':len(attribution_failures),'score':round(total,6),'scorePercent':round(total*100,3),'perCategory':{k:round(sum(v)/len(v),6) for k,v in sorted(category.items())},'failureCount':len(failures),'trainableFailureCount':trainable,'failureSummary':dict(Counter(x['category'] for x in failures)),'trainingGates':{'v41Below85Percent':total<.85,'minimumTrainableFailures':trainable>=100},'failures':failures}
    out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8');print(json.dumps({k:report[k] for k in ('scorePercent','failureCount','trainableFailureCount','effectiveModelAttributionPassed')},sort_keys=True))
    if attribution_failures: raise SystemExit(2)

if __name__=='__main__':main()
