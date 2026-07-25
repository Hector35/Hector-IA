#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
TARGET='Qwen/Qwen3.5-397B-A17B';PARAMS=397_000_000_000;ACTIVE=17_000_000_000;GIB=1024**3

def sha(obj): return hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def gib(x): return round(x/GIB,2)
def profile(name,bits,fraction,opt=8,activation=64):
 w=PARAMS*bits/8;t=PARAMS*fraction;g=t*2;o=t*opt;r=w*.20;peak=w+g+o+r+activation*GIB;ck=w+g+o
 return {'name':name,'bits':bits,'trainableFraction':fraction,'weightsGiB':gib(w),'gradientsGiB':gib(g),'optimizerGiB':gib(o),'activationReserveGiB':activation,'runtimeReserveGiB':gib(r),'estimatedPeakGiB':gib(peak),'checkpointGiB':gib(ck)}
def topology(name,n,mem,usable,link): return {'name':name,'gpuCount':n,'memoryPerGpuGiB':mem,'usableFraction':usable,'usableClusterGiB':round(n*mem*usable,2),'interconnect':link,'verifiedAllocation':False}
def transfer_seconds(size,gbps): return round(size*GIB*8/(gbps*1e9*.72),2)
def manifest_count(path):
 m=json.loads(Path(path).read_text());return int(m['counts']['total']),m.get('sha256')

def build(state,extra_manifests):
 q=profile('qlora4bit-0.2pct',4,.002,8,96);l=profile('lora8bit-0.2pct',8,.002,8,128);f=profile('full16bit',16,1,8,384);modes=[q,l,f]
 tops=[topology('8xH100-80GB',8,80,.82,'NVLink/NVSwitch required'),topology('16xH100-80GB',16,80,.82,'NVLink/NVSwitch + multi-node fabric required'),topology('8xB200-192GB',8,192,.85,'NVLink/NVSwitch required'),topology('16xB200-192GB',16,192,.85,'NVLink/NVSwitch + multi-node fabric required')]
 for t in tops:t['fits']={m['name']:t['usableClusterGiB']>=m['estimatedPeakGiB'] for m in modes}
 extras=[]
 for p in extra_manifests:
  c,h=manifest_count(p);extras.append({'path':p,'count':c,'manifestSha256':h})
 canonical=int(state['data']['verifiedExamples']);delta=sum(x['count'] for x in extras);effective=canonical+delta
 storage=round(max(x['checkpointGiB'] for x in modes)*3*1.25,2)
 gates={'corpus':effective>=state['data']['requiredExamples'],'benchmark':state['benchmark']['cases']>=512,'trainableFailures':state['benchmark']['v41TrainableFailures']>=100,'exactLiveEndpoint':bool(state['compute']['exactLiveEndpointAttested']),'distributedAllocation':bool(state['compute']['distributedGpuAllocationVerified']),'realWeightsResume':bool(state['compute']['real397BWeightsCheckpointResumeVerified']),'explicitBudget':isinstance(state['compute']['explicitBudgetMxn'],(int,float)) and state['compute']['explicitBudgetMxn']>=0,'frozenHashes':bool(state['gates']['frozenDataModelTokenizerHashesReady']),'canonicalStateSynchronized':delta==0}
 report={'schemaVersion':2,'targetModel':TARGET,'totalParameters':PARAMS,'activeParametersPerToken':ACTIVE,'canonicalStateSha256':sha(state),'corpus':{'canonical':canonical,'verifiedManifestDelta':delta,'effectiveVerified':effective,'required':state['data']['requiredExamples'],'canonicalStateDriftDetected':delta!=0,'unintegratedManifests':extras},'memoryProfiles':modes,'candidateTopologies':tops,'storageContract':{'checkpointGenerations':2,'atomicTemporaryGeneration':1,'safetyMultiplier':1.25,'minimumObjectStorageGiB':storage,'requiresVersioning':True,'requiresMultipartUpload':True,'requiresPerShardSha256':True,'requiresAtomicLatestPointer':True,'verifiedRemoteBucket':False},'bandwidthPlanning':{'assumedEfficiency':.72,'restoreEstimates':{str(g):{'restoreSecondsQlora':transfer_seconds(q['checkpointGiB'],g),'restoreSecondsFull':transfer_seconds(f['checkpointGiB'],g)} for g in (1,10,25,100,400)},'measured':False},'endpointAttestationContract':{'requestedModelMustEqual':TARGET,'effectiveModelMustEqual':TARGET,'fallbackMustBe':False,'responseModelFieldRequired':True,'liveInferencePerformed':False},'gates':gates,'trainingAuthorized':all(gates.values()),'actualCostMxn':0,'billingActivated':False,'decision':'do-not-train','blockingReasons':[k for k,v in gates.items() if not v],'scope':'planning and fail-closed infrastructure contract; no GPU, provider inference, checkout, or paid storage used'}
 report['sha256']=sha(report);return report

def main():
 p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--extra-manifest',action='append',default=[]);p.add_argument('--output',required=True);a=p.parse_args();state=json.loads(Path(a.state).read_text());assert state['compute']['targetModel']==TARGET;r=build(state,a.extra_manifest);Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(json.dumps(r,indent=2,sort_keys=True)+'\n');print(json.dumps(r,sort_keys=True));assert not r['trainingAuthorized']
if __name__=='__main__':main()
