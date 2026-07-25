#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path

TARGET='Qwen/Qwen3.5-397B-A17B'
PARAMS=397_000_000_000
ACTIVE=17_000_000_000
GIB=1024**3


def sha(obj):
    return hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def gib(x): return round(x/GIB,2)

def profile(name,bits,trainable_fraction,optimizer_bytes=8,activation_gib=64):
    weights=PARAMS*bits/8
    trainable=PARAMS*trainable_fraction
    grads=trainable*2
    optimizer=trainable*optimizer_bytes
    runtime=weights*.20
    total=weights+grads+optimizer+runtime+activation_gib*GIB
    checkpoint=weights+grads+optimizer
    return {'name':name,'bits':bits,'trainableFraction':trainable_fraction,'weightsGiB':gib(weights),'gradientsGiB':gib(grads),'optimizerGiB':gib(optimizer),'activationReserveGiB':activation_gib,'runtimeReserveGiB':gib(runtime),'estimatedPeakGiB':gib(total),'checkpointGiB':gib(checkpoint)}

def topology(name,count,memory,usable=.82,interconnect='unknown'):
    return {'name':name,'gpuCount':count,'memoryPerGpuGiB':memory,'usableFraction':usable,'usableClusterGiB':round(count*memory*usable,2),'interconnect':interconnect,'verifiedAllocation':False}

def transfer_seconds(gib_value,gbps,efficiency=.72):
    bits=gib_value*(1024**3)*8
    return round(bits/(gbps*1_000_000_000*efficiency),2)

def build(state):
    qlora=profile('qlora4bit-0.2pct',4,.002,8,96)
    lora8=profile('lora8bit-0.2pct',8,.002,8,128)
    full=profile('full16bit',16,1.0,8,384)
    modes=[qlora,lora8,full]
    tops=[
      topology('8xH100-80GB',8,80,.82,'NVLink/NVSwitch required'),
      topology('16xH100-80GB',16,80,.82,'NVLink/NVSwitch + multi-node fabric required'),
      topology('8xB200-192GB',8,192,.85,'NVLink/NVSwitch required'),
      topology('16xB200-192GB',16,192,.85,'NVLink/NVSwitch + multi-node fabric required'),
    ]
    for t in tops:
        t['fits']={m['name']:t['usableClusterGiB']>=m['estimatedPeakGiB'] for m in modes}
    checkpoint_generations=2
    atomic_temp=1
    safety=1.25
    required_storage=round(max(m['checkpointGiB'] for m in modes)*(checkpoint_generations+atomic_temp)*safety,2)
    bandwidth={str(g):{'restoreSecondsQlora':transfer_seconds(qlora['checkpointGiB'],g),'restoreSecondsFull':transfer_seconds(full['checkpointGiB'],g)} for g in (1,10,25,100,400)}
    corpus=state['data']['verifiedExamples']
    gates={
      'corpus':corpus>=state['data']['requiredExamples'],
      'benchmark':state['benchmark']['cases']>=512,
      'trainableFailures':state['benchmark']['v41TrainableFailures']>=100,
      'exactLiveEndpoint':bool(state['compute']['exactLiveEndpointAttested']),
      'distributedAllocation':bool(state['compute']['distributedGpuAllocationVerified']),
      'realWeightsResume':bool(state['compute']['real397BWeightsCheckpointResumeVerified']),
      'explicitBudget':isinstance(state['compute']['explicitBudgetMxn'],(int,float)) and state['compute']['explicitBudgetMxn']>=0,
      'frozenHashes':bool(state['gates']['frozenDataModelTokenizerHashesReady']),
    }
    report={
      'schemaVersion':1,'targetModel':TARGET,'totalParameters':PARAMS,'activeParametersPerToken':ACTIVE,
      'canonicalStateSha256':sha(state),'currentCorpus':corpus,'requiredCorpus':state['data']['requiredExamples'],
      'memoryProfiles':modes,'candidateTopologies':tops,
      'storageContract':{'checkpointGenerations':checkpoint_generations,'atomicTemporaryGeneration':atomic_temp,'safetyMultiplier':safety,'minimumObjectStorageGiB':required_storage,'requiresVersioning':True,'requiresMultipartUpload':True,'requiresPerShardSha256':True,'requiresAtomicLatestPointer':True,'verifiedRemoteBucket':False},
      'bandwidthPlanning':{'assumedEfficiency':.72,'restoreEstimates':bandwidth,'measured':False},
      'endpointAttestationContract':{'requestedModelMustEqual':TARGET,'effectiveModelMustEqual':TARGET,'fallbackMustBe':False,'responseModelFieldRequired':True,'liveInferencePerformed':False},
      'gates':gates,'trainingAuthorized':all(gates.values()),'actualCostMxn':0,'billingActivated':False,
      'decision':'train' if all(gates.values()) else 'do-not-train',
      'blockingReasons':[k for k,v in gates.items() if not v],
      'scope':'planning and fail-closed infrastructure contract; no GPU, provider inference, checkout, or paid storage used'
    }
    report['sha256']=sha(report)
    return report

def main():
    p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    state=json.loads(Path(a.state).read_text())
    assert state['compute']['targetModel']==TARGET
    report=build(state)
    Path(a.output).parent.mkdir(parents=True,exist_ok=True)
    Path(a.output).write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
    print(json.dumps(report,sort_keys=True))
    if report['trainingAuthorized']: raise SystemExit('unexpected authorization without real gates')
if __name__=='__main__':main()
