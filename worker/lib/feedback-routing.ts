export type FeedbackRoutingRow={rating:number;correction?:string|null;actual_provider:string;route_tier:string;updated_at?:string|null};
export type FeedbackRoutingProfile={sampleCount:number;negativeRate:number;nonDeepSampleCount:number;nonDeepNegativeRate:number;cloudflareSampleCount:number;cloudflareNegativeRate:number;preferDeep:boolean;avoidCloudflare:boolean;guidance:string[];reason:string};

export const FEEDBACK_ROUTING_POLICY={windowDays:60,sampleLimit:60,minNonDeepSamples:5,minCloudflareSamples:4,preferDeepNegativeRate:.5,avoidCloudflareNegativeRate:.5,maxGuidanceItems:4};

function smoothedNegativeRate(rows:FeedbackRoutingRow[]){
 if(!rows.length)return 0;
 const negative=rows.filter(row=>Number(row.rating)<0).length;
 return(negative+1)/(rows.length+2);
}

function normalize(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();}

function guidanceFromCorrections(rows:FeedbackRoutingRow[]){
 const seen=new Set<string>(),guidance:string[]=[];
 for(const row of rows){
  if(Number(row.rating)>=0||!row.correction?.trim())continue;
  const content=row.correction.trim().slice(0,600),key=normalize(content);
  if(key.length<3||seen.has(key))continue;
  seen.add(key);guidance.push(content);
  if(guidance.length>=FEEDBACK_ROUTING_POLICY.maxGuidanceItems)break;
 }
 return guidance;
}

export function summarizeFeedbackRouting(rows:FeedbackRoutingRow[]):FeedbackRoutingProfile{
 const nonDeep=rows.filter(row=>row.route_tier!=='deep'),cloudflare=rows.filter(row=>row.actual_provider==='cloudflare');
 const negativeRate=smoothedNegativeRate(rows),nonDeepNegativeRate=smoothedNegativeRate(nonDeep),cloudflareNegativeRate=smoothedNegativeRate(cloudflare);
 const preferDeep=nonDeep.length>=FEEDBACK_ROUTING_POLICY.minNonDeepSamples&&nonDeepNegativeRate>=FEEDBACK_ROUTING_POLICY.preferDeepNegativeRate;
 const avoidCloudflare=cloudflare.length>=FEEDBACK_ROUTING_POLICY.minCloudflareSamples&&cloudflareNegativeRate>=FEEDBACK_ROUTING_POLICY.avoidCloudflareNegativeRate;
 const reason=preferDeep?'las valoraciones recientes muestran que el nivel no profundo es insuficiente':avoidCloudflare?'las valoraciones recientes muestran baja utilidad de Workers AI':'aún no existe evidencia suficiente para cambiar el enrutamiento';
 return{sampleCount:rows.length,negativeRate,nonDeepSampleCount:nonDeep.length,nonDeepNegativeRate,cloudflareSampleCount:cloudflare.length,cloudflareNegativeRate,preferDeep,avoidCloudflare,guidance:guidanceFromCorrections(rows),reason};
}

export function neutralFeedbackRoutingProfile():FeedbackRoutingProfile{return summarizeFeedbackRouting([]);}

export async function loadFeedbackRoutingProfile(db:D1Database,userId:string,task:string):Promise<FeedbackRoutingProfile>{
 try{
  const result=await db.prepare(`SELECT f.rating,f.correction,t.actual_provider,t.route_tier,f.updated_at
   FROM response_feedback f JOIN response_traces t ON t.id=f.trace_id AND t.user_id=f.user_id
   WHERE f.user_id=? AND t.task=? AND f.updated_at>=datetime('now',?)
   ORDER BY f.updated_at DESC LIMIT ?`).bind(userId,task,`-${FEEDBACK_ROUTING_POLICY.windowDays} days`,FEEDBACK_ROUTING_POLICY.sampleLimit).all<FeedbackRoutingRow>();
  return summarizeFeedbackRouting(result.results||[]);
 }catch{return neutralFeedbackRoutingProfile();}
}
