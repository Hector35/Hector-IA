#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
SOURCE=ROOT/'model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json'
OUT=ROOT/'model/hector-asi/evals/benchmark_v2/v41-failure-taxonomy-latest.json'
FAMILIES={'calibration':['overconfidence','missing uncertainty interval','no escalation condition'],'planning':['missing rollback','weak success criteria','unsafe sequencing'],'transfer':['surface analogy','missing invariant','no target-domain counterexample'],'code':['incorrect implementation','missing edge-case tests','non-executable answer'],'mathematics':['arithmetic/algebra error','missing verification','unsupported result'],'metacognition':['fails to detect uncertainty','does not revise strategy','weak self-check'],'tool_use':['wrong tool/arguments','missing result validation','claims unobserved execution'],'causality':['confuses correlation and cause','missing confounder','weak intervention test']}
def sha(obj): return hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(',',':')).encode()).hexdigest()
data=json.loads(SOURCE.read_text())
per=[]
for cap,score in sorted(data['byCapability'].items(),key=lambda kv:kv[1]):
 severity='critical' if score<.10 else 'high' if score<.25 else 'medium' if score<.50 else 'moderate'
 per.append({'capability':cap,'score':score,'severity':severity,'estimatedFailures':round(64*(1-score)),'priorityWeight':round((1-score)**2,6),'families':FAMILIES[cap]})
report={'schemaVersion':1,'sourceModel':data['model'],'benchmarkVersion':data['benchmarkVersion'],'benchmarkSha256':data['hiddenSha256'],'predictionsSha256':data['predictionsSha256'],'scorePercent':data['scorePercent'],'failureCount':data['failureCount'],'trainableFailureCount':data['trainableFailureCount'],'capabilities':per,'priorityOrder':[x['capability'] for x in per],'promotionContract':{'minimumAbsoluteGainPoints':3.0,'requiresMulticapabilityGain':True,'maxSevereRegressions':0,'requiresEffectiveModelMatch':True,'requiresNoFallback':True,'requiresConfirmatoryReplica':True},'nextDiscriminatingExperiment':{'name':'paired sealed re-evaluation','cases':512,'replicas':2,'compareAgainst':'hector-asi-qwen15-v41','focus':['calibration','planning','transfer','code'],'singleHiddenTestUse':True}}
report['sha256']=sha(report)
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print(json.dumps({'output':str(OUT),'sha256':report['sha256'],'priorityOrder':report['priorityOrder']}))
