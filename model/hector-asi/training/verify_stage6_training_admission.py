#!/usr/bin/env python3
from __future__ import annotations

import argparse, hashlib, json, os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
TARGET='Qwen/Qwen3.5-397B-A17B'


def sha(value):
    raw=json.dumps(value,sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(raw).hexdigest()


def load(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))


def build():
    bench=load(Path('model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json'))
    plan=load(Path('model/hector-asi/stage-6-plan.json'))
    state=load(Path('model/hector-asi/integration/stage6-integration-latest.json'))
    corpus_current=int(state['data']['verifiedExamples'])
    corpus_required=int(state['data']['requiredExamples'])
    budget=os.getenv('HECTOR_MAX_TRAINING_MXN','').strip()
    cluster_attestation=os.getenv('HECTOR_DISTRIBUTED_CLUSTER_ATTESTATION','').strip()
    remote_resume=os.getenv('HECTOR_REMOTE_RESUME_ATTESTATION','').strip()
    dataset_hash=os.getenv('HECTOR_FROZEN_DATASET_SHA256','').strip()
    model_hash=os.getenv('HECTOR_BASE_MODEL_SHA256','').strip()
    tokenizer_hash=os.getenv('HECTOR_TOKENIZER_SHA256','').strip()
    license_id=os.getenv('HECTOR_BASE_LICENSE','').strip()
    pwa_examples=int(os.getenv('HECTOR_PWA_VERIFIED_EXAMPLES','0'))

    gates={
      'corpus':{'current':corpus_current,'required':corpus_required,'open':corpus_current>=corpus_required},
      'benchmark':{'current':bench['gates']['benchmarkCases']['observed'],'required':500,'open':bench['gates']['benchmarkCases']['open']},
      'trainableFailures':{'current':bench['trainableFailureCount'],'required':100,'open':bench['trainableFailureCount']>=100},
      'exactModelTarget':{'expected':TARGET,'open':state['compute']['targetModel']==TARGET},
      'explicitBudgetMxn':{'value':float(budget) if budget else None,'open':bool(budget) and float(budget)>0},
      'distributedCluster':{'attestationPresent':bool(cluster_attestation),'open':bool(cluster_attestation)},
      'persistentRemoteResume':{'attestationPresent':bool(remote_resume),'open':bool(remote_resume)},
      'frozenDatasetHash':{'value':dataset_hash or None,'open':len(dataset_hash)==64},
      'baseModelHash':{'value':model_hash or None,'open':len(model_hash)==64},
      'tokenizerHash':{'value':tokenizer_hash or None,'open':len(tokenizer_hash)==64},
      'licenseFixed':{'value':license_id or None,'open':bool(license_id)},
    }
    stage_plan_drift={
      'detected':plan.get('operatingMode',{}).get('trainableFoundation')!=TARGET or state['compute']['targetModel']!=TARGET,
      'declaredTrainableFoundation':plan.get('operatingMode',{}).get('trainableFoundation'),
      'canonicalTargetModel':state['compute']['targetModel'],
      'requiredTrainableFoundation':TARGET,
      'blocking':True,
    }
    all_open=all(g['open'] for g in gates.values()) and not stage_plan_drift['detected']
    report={
      'schemaVersion':2,
      'targetModel':TARGET,
      'champion':state['champion']['id'],
      'benchmark':{'scorePercent':bench['scorePercent'],'hiddenSha256':bench['hiddenSha256'],'predictionsSha256':bench['predictionsSha256']},
      'corpusEvidence':{'current':corpus_current,'required':corpus_required,'remaining':corpus_required-corpus_current,'sourceMerges':state['data'].get('sourceMerges',[]),'verifiedDatasetManifests':state['data'].get('verifiedDatasetManifests',[]),'pwaVerifiedExamples':pwa_examples},
      'stagePlanDrift':stage_plan_drift,
      'gates':gates,
      'trainingAuthorized':all_open,
      'decision':'train' if all_open else 'do-not-train',
      'artifact':None,
      'actualCostMxn':0,
      'replicasCompleted':0,
      'blockingReasons':[name for name,g in gates.items() if not g['open']]+(['stagePlanDrift'] if stage_plan_drift['detected'] else []),
    }
    report['sha256']=sha(report)
    return report


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--output',required=True)
    args=ap.parse_args()
    report=build()
    Path(args.output).write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(report,sort_keys=True))
    raise SystemExit(0 if report['trainingAuthorized'] else 2)


if __name__=='__main__': main()
