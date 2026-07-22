import type {CallGovernorMetrics} from './call-governor';

export async function recordCallGovernorEvent(db:{prepare:(sql:string)=>{bind:(...values:unknown[])=>{run:()=>Promise<unknown>}}},input:{userId:string;requestKey:string;metrics:CallGovernorMetrics}){
 try{
  await db.prepare(`INSERT INTO call_governor_events (id,user_id,request_key,reuse_kind,cache_status,inference_tier,original_planned_passes,governed_planned_passes,total_inference_passes,free_inference_passes,economy_inference_passes,advanced_inference_passes,calls_avoided,estimated_cost_usd,justification,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(
   crypto.randomUUID(),input.userId,input.requestKey,input.metrics.reuseKind,input.metrics.cacheStatus,input.metrics.inferenceTier,input.metrics.originalPlannedPasses,input.metrics.governedPlannedPasses,input.metrics.totalInferencePasses,input.metrics.freeInferencePasses,input.metrics.economyInferencePasses,input.metrics.advancedInferencePasses,input.metrics.callsAvoided,input.metrics.estimatedCostUsd,input.metrics.justification.slice(0,1000)
  ).run();
  return true;
 }catch{return false;}
}
