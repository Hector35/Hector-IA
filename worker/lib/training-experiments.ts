export type TrainingCapabilityCandidate={
  capabilityKey:string;
  benchmarkKey:string;
  hypothesis:string;
  files:string[];
  expectedGain:number;
  transfer:number;
  successProbability:number;
  estimatedMinutes:number;
  estimatedCostUsd:number;
  conflictRisk:number;
};

export type TrainingLease={
  capabilityKey:string;
  experimentId:string;
  ownerSlot:string;
  hypothesis:string;
  benchmarkKey:string;
  files:string[];
  costLimitUsd:number;
  acquiredAt:string;
  leaseExpiresAt:string;
};

export type PromotionEvidence={
  baselineScore:number;
  candidateScore:number;
  holdoutScore:number;
  transferScore:number;
  regressionScore:number;
  reproducible:boolean;
  rollbackReady:boolean;
};

export type PromotionDecision={
  promote:boolean;
  delta:number;
  reason:string;
};

type LeaseRow={
  capability_key:string;
  experiment_id:string;
  owner_slot:string;
  hypothesis:string;
  benchmark_key:string;
  files_json:string;
  cost_limit_usd:number;
  acquired_at:string;
  lease_expires_at:string;
};

const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:0));
const normalize=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,96);
const safeJsonArray=(value:string)=>{try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter(item=>typeof item==='string'):[];}catch{return[];}};

export function trainingPriority(candidate:TrainingCapabilityCandidate){
  const numerator=Math.max(0,candidate.expectedGain)+Math.max(0,candidate.transfer)+Math.max(0,candidate.expectedGain*candidate.transfer);
  const denominator=Math.max(1,candidate.estimatedMinutes)+Math.max(0,candidate.estimatedCostUsd*60)+Math.max(0,candidate.conflictRisk*30);
  return numerator*clamp(candidate.successProbability)/denominator;
}

export function rankTrainingCandidates(candidates:TrainingCapabilityCandidate[]){
  return [...candidates]
    .filter(candidate=>normalize(candidate.capabilityKey)&&candidate.benchmarkKey.trim())
    .sort((a,b)=>trainingPriority(b)-trainingPriority(a)||a.capabilityKey.localeCompare(b.capabilityKey));
}

export function decidePromotion(evidence:PromotionEvidence):PromotionDecision{
  const delta=evidence.holdoutScore-evidence.baselineScore;
  if(!evidence.reproducible)return{promote:false,delta,reason:'El resultado no fue reproducible.'};
  if(!evidence.rollbackReady)return{promote:false,delta,reason:'No existe rollback validado.'};
  if(delta<.03)return{promote:false,delta,reason:`La mejora no vista ${(delta*100).toFixed(1)}% no alcanza 3%.`};
  if(evidence.regressionScore>.01)return{promote:false,delta,reason:`La regresión ${(evidence.regressionScore*100).toFixed(1)}% supera 1%.`};
  if(evidence.transferScore<evidence.baselineScore)return{promote:false,delta,reason:'La transferencia quedó por debajo del campeón.'};
  if(evidence.candidateScore<evidence.holdoutScore-.08)return{promote:false,delta,reason:'Existe una brecha excesiva entre candidato y evaluación no vista.'};
  return{promote:true,delta,reason:`Mejora no vista ${(delta*100).toFixed(1)}%, transferencia estable y sin regresión crítica.`};
}

function mapLease(row:LeaseRow):TrainingLease{
  return{
    capabilityKey:row.capability_key,
    experimentId:row.experiment_id,
    ownerSlot:row.owner_slot,
    hypothesis:row.hypothesis,
    benchmarkKey:row.benchmark_key,
    files:safeJsonArray(row.files_json),
    costLimitUsd:Number(row.cost_limit_usd)||0,
    acquiredAt:row.acquired_at,
    leaseExpiresAt:row.lease_expires_at
  };
}

export async function claimTrainingLease(db:D1Database,input:{candidate:TrainingCapabilityCandidate;ownerSlot:string;leaseMinutes?:number;now?:Date}):Promise<TrainingLease|null>{
  const capabilityKey=normalize(input.candidate.capabilityKey),ownerSlot=normalize(input.ownerSlot);
  if(!capabilityKey||!ownerSlot)return null;
  const now=input.now??new Date(),acquiredAt=now.toISOString(),leaseExpiresAt=new Date(now.getTime()+Math.max(5,input.leaseMinutes??45)*60_000).toISOString(),experimentId=crypto.randomUUID();
  const result=await db.prepare(`INSERT INTO training_capability_leases(capability_key,experiment_id,owner_slot,hypothesis,benchmark_key,files_json,cost_limit_usd,status,acquired_at,lease_expires_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'active',?,?,?)
    ON CONFLICT(capability_key) DO UPDATE SET
      experiment_id=excluded.experiment_id,
      owner_slot=excluded.owner_slot,
      hypothesis=excluded.hypothesis,
      benchmark_key=excluded.benchmark_key,
      files_json=excluded.files_json,
      cost_limit_usd=excluded.cost_limit_usd,
      status='active',
      acquired_at=excluded.acquired_at,
      lease_expires_at=excluded.lease_expires_at,
      updated_at=excluded.updated_at
    WHERE training_capability_leases.status!='active'
       OR training_capability_leases.lease_expires_at<=excluded.acquired_at
       OR training_capability_leases.owner_slot=excluded.owner_slot`).bind(
      capabilityKey,experimentId,ownerSlot,input.candidate.hypothesis.trim(),input.candidate.benchmarkKey.trim(),JSON.stringify(input.candidate.files),Math.max(0,input.candidate.estimatedCostUsd),acquiredAt,leaseExpiresAt,acquiredAt
    ).run();
  if(!result.success)return null;
  const row=await db.prepare(`SELECT capability_key,experiment_id,owner_slot,hypothesis,benchmark_key,files_json,cost_limit_usd,acquired_at,lease_expires_at FROM training_capability_leases WHERE capability_key=? AND status='active'`).bind(capabilityKey).first<LeaseRow>();
  return row&&row.owner_slot===ownerSlot&&row.experiment_id===experimentId?mapLease(row):null;
}

export async function claimNextTrainingExperiment(db:D1Database,input:{candidates:TrainingCapabilityCandidate[];ownerSlot:string;leaseMinutes?:number;now?:Date}){
  for(const candidate of rankTrainingCandidates(input.candidates)){
    const lease=await claimTrainingLease(db,{candidate,ownerSlot:input.ownerSlot,leaseMinutes:input.leaseMinutes,now:input.now});
    if(lease)return{lease,candidate,skipped:input.candidates.filter(item=>item.capabilityKey!==candidate.capabilityKey).length};
  }
  return null;
}

export async function renewTrainingLease(db:D1Database,input:{lease:TrainingLease;leaseMinutes?:number;now?:Date}){
  const now=input.now??new Date(),expiresAt=new Date(now.getTime()+Math.max(5,input.leaseMinutes??45)*60_000).toISOString();
  const result=await db.prepare(`UPDATE training_capability_leases SET lease_expires_at=?,updated_at=? WHERE capability_key=? AND experiment_id=? AND owner_slot=? AND status='active'`).bind(expiresAt,now.toISOString(),input.lease.capabilityKey,input.lease.experimentId,input.lease.ownerSlot).run();
  return Boolean(result.success&&Number(result.meta?.changes||0)>0);
}

export async function completeTrainingExperiment(db:D1Database,input:{lease:TrainingLease;evidence:PromotionEvidence;advancedCalls:number;tokens:number;costUsd:number;artifacts:string[];failureReason?:string;now?:Date}){
  const decision=decidePromotion(input.evidence),now=(input.now??new Date()).toISOString(),outcome=decision.promote?'promoted':input.failureReason?'failed':'rejected';
  const statements=[
    db.prepare(`INSERT INTO training_experiment_runs(id,capability_key,experiment_id,owner_slot,benchmark_key,baseline_score,candidate_score,holdout_score,transfer_score,regression_score,advanced_calls,tokens,cost_usd,promoted,outcome,artifacts_json,failure_reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),input.lease.capabilityKey,input.lease.experimentId,input.lease.ownerSlot,input.lease.benchmarkKey,input.evidence.baselineScore,input.evidence.candidateScore,input.evidence.holdoutScore,input.evidence.transferScore,input.evidence.regressionScore,Math.max(0,input.advancedCalls),Math.max(0,input.tokens),Math.max(0,input.costUsd),decision.promote?1:0,outcome,JSON.stringify(input.artifacts),input.failureReason||null,now),
    db.prepare(`UPDATE training_capability_leases SET status=?,lease_expires_at=?,updated_at=? WHERE capability_key=? AND experiment_id=? AND owner_slot=?`).bind(decision.promote?'completed':input.failureReason?'failed':'released',now,now,input.lease.capabilityKey,input.lease.experimentId,input.lease.ownerSlot)
  ];
  const results=await db.batch(statements);
  return{decision,outcome,recorded:results.every(result=>result.success)};
}

export function trainingControlBenchmark(){
  const candidates:TrainingCapabilityCandidate[]=[
    {capabilityKey:'planning',benchmarkKey:'planning-v1',hypothesis:'mejorar planificación',files:['worker/lib/planner.ts'],expectedGain:.12,transfer:.8,successProbability:.8,estimatedMinutes:45,estimatedCostUsd:0,conflictRisk:.1},
    {capabilityKey:'verification',benchmarkKey:'verification-v1',hypothesis:'mejorar verificación',files:['worker/lib/verification.ts'],expectedGain:.09,transfer:.9,successProbability:.9,estimatedMinutes:35,estimatedCostUsd:0,conflictRisk:.05}
  ];
  const ranked=rankTrainingCandidates(candidates),promote=decidePromotion({baselineScore:.6,candidateScore:.69,holdoutScore:.65,transferScore:.66,regressionScore:.005,reproducible:true,rollbackReady:true});
  return{first:ranked[0]?.capabilityKey,priorityGap:trainingPriority(ranked[0])-trainingPriority(ranked[1]),promote:promote.promote,holdoutDelta:promote.delta,advancedCalls:0};
}
