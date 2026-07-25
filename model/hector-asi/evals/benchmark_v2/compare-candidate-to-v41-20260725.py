#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
CAPS={'calibration','planning','transfer','code','mathematics','causality','metacognition','tool_use'}

def load(path): return json.loads(Path(path).read_text())
def main():
 p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--candidate',required=True);p.add_argument('--out',required=True);a=p.parse_args()
 b,c=load(a.baseline),load(a.candidate)
 errors=[]
 if c.get('fallback') not in (False,0,None): errors.append('fallback-used')
 if c.get('requestedModel') and c.get('effectiveModel')!=c.get('requestedModel'): errors.append('model-attribution-mismatch')
 if c.get('benchmarkSha256')!=b.get('hiddenSha256',b.get('benchmarkSha256')): errors.append('benchmark-hash-mismatch')
 scores=c.get('byCapability',{});missing=CAPS-set(scores);errors += [f'missing-capability:{x}' for x in sorted(missing)]
 gain=float(c.get('scorePercent',0))-float(b.get('scorePercent',0));deltas={k:float(scores.get(k,0))-float(b.get('byCapability',{}).get(k,0)) for k in CAPS}
 improved=sum(v>0 for v in deltas.values());severe=[k for k,v in deltas.items() if v<=-.10]
 if gain<3: errors.append('gain-below-3-points')
 if improved<2: errors.append('not-multicapability')
 if severe: errors.append('severe-regression:'+','.join(sorted(severe)))
 replicas=c.get('replicas',[])
 if len(replicas)<2 or any(not r.get('confirmed') for r in replicas[:2]): errors.append('confirmatory-replica-missing')
 report={'decision':'promote' if not errors else 'reject','absoluteGainPoints':round(gain,6),'improvedCapabilities':improved,'deltas':dict(sorted(deltas.items())),'severeRegressions':severe,'errors':errors,'baselineModel':b.get('model'),'candidateModel':c.get('effectiveModel'),'benchmarkSha256':c.get('benchmarkSha256')}
 Path(a.out).write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
 print(json.dumps(report,sort_keys=True));return 0 if not errors else 2
if __name__=='__main__':sys.exit(main())
