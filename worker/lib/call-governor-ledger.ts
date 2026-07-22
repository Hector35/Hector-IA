import type {CallGovernorMetrics} from './call-governor';

export async function recordCallGovernorEvent(db:{prepare:(sql:string)=>any},input:{userId:string;requestKey:string;metrics:CallGovernorMetrics}){
 try{
  await db.prepare(`INSERT INTO call_governor_events (id,user_id,request_key,advanced_calls,deduplicated_calls,cache_hits,blocked_calls,requested_passes,executed_passes,estimated_calls_saved,justifications_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(
   crypto.randomUUID(),input.userId,input.requestKey,input.metrics.advancedCalls,input.metrics.deduplicatedCalls,input.metrics.cacheHits,input.metrics.blockedCalls,input.metrics.requestedPasses,input.metrics.executedPasses,input.metrics.estimatedAdvancedCallsSaved,JSON.stringify(input.metrics.justifications.slice(-12))
  ).run();
  return true;
 }catch{return false;}
}
