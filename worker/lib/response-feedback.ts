export type FeedbackReason='incorrect'|'incomplete'|'not_personalized'|'too_long'|'too_short'|'unsafe'|'other';
export type FeedbackRow={rating:number;reason?:FeedbackReason|null;provider:string;model_tier:string;created_at?:string|null};
export type UserFeedbackProfile={sampleCount:number;downRate:number;nonDeepSampleCount:number;nonDeepDownRate:number;cloudflareSampleCount:number;cloudflareDownRate:number;preferDeep:boolean;avoidCloudflare:boolean;guidance:string[];reason:string};

export const USER_FEEDBACK_POLICY={windowDays:60,sampleLimit:60,minNonDeepSamples:5,minCloudflareSamples:4,preferDeepDownRate:.5,avoidCloudflareDownRate:.5};

function smoothedDownRate(rows:FeedbackRow[]){
 const downs=rows.filter(row=>Number(row.rating)<0).length;
 return(rows.length?downs+1:0)/(rows.length?rows.length+2:1);
}

function guidanceFromReasons(rows:FeedbackRow[]){
 const counts=new Map<FeedbackReason,number>();
 for(const row of rows){if(Number(row.rating)>=0||!row.reason)continue;counts.set(row.reason,(counts.get(row.reason)||0)+1);}
 const guidance:string[]=[];
 const tooLong=counts.get('too_long')||0,tooShort=counts.get('too_short')||0;
 if(tooLong>=2&&tooLong>tooShort)guidance.push('Prioriza una respuesta más compacta, con el resultado primero y sin repetir contexto conocido.');
 if(tooShort>=2&&tooShort>tooLong)guidance.push('Aumenta el detalle técnico, los supuestos y los pasos verificables antes de concluir.');
 if((counts.get('not_personalized')||0)>=2)guidance.push('Usa de forma explícita el contexto personal relevante de Héctor y evita respuestas genéricas.');
 if((counts.get('incomplete')||0)>=2)guidance.push('Comprueba que todas las partes de la solicitud quedaron respondidas y señala cualquier parte pendiente.');
 if((counts.get('incorrect')||0)>=1)guidance.push('Verifica cálculos, hechos y afirmaciones antes de responder; distingue evidencia de inferencias.');
 if((counts.get('unsafe')||0)>=1)guidance.push('Eleva el control de riesgos y evita instrucciones que puedan causar daño o pérdida de datos.');
 return guidance.slice(0,4);
}

export function summarizeUserFeedback(rows:FeedbackRow[]):UserFeedbackProfile{
 const sampleCount=rows.length,downRate=smoothedDownRate(rows);
 const nonDeep=rows.filter(row=>row.model_tier!=='deep'&&row.model_tier!=='verified'),cloudflare=rows.filter(row=>row.provider==='cloudflare');
 const nonDeepDownRate=smoothedDownRate(nonDeep),cloudflareDownRate=smoothedDownRate(cloudflare);
 const preferDeep=nonDeep.length>=USER_FEEDBACK_POLICY.minNonDeepSamples&&nonDeepDownRate>=USER_FEEDBACK_POLICY.preferDeepDownRate;
 const avoidCloudflare=cloudflare.length>=USER_FEEDBACK_POLICY.minCloudflareSamples&&cloudflareDownRate>=USER_FEEDBACK_POLICY.avoidCloudflareDownRate;
 const reason=preferDeep?'feedback reciente indica que el razonamiento no profundo es insuficiente':avoidCloudflare?'feedback reciente indica baja utilidad de Workers AI':'sin evidencia suficiente para cambiar el enrutamiento';
 return{sampleCount,downRate,nonDeepSampleCount:nonDeep.length,nonDeepDownRate,cloudflareSampleCount:cloudflare.length,cloudflareDownRate,preferDeep,avoidCloudflare,guidance:guidanceFromReasons(rows),reason};
}

export function neutralFeedbackProfile():UserFeedbackProfile{return summarizeUserFeedback([]);}

export async function loadUserFeedbackProfile(db:D1Database,userId:string,task:string):Promise<UserFeedbackProfile>{
 try{
  const result=await db.prepare(`SELECT rating,reason,provider,model_tier,created_at FROM response_feedback
   WHERE user_id=? AND task=? AND created_at>=datetime('now',?)
   ORDER BY created_at DESC LIMIT ?`).bind(userId,task,`-${USER_FEEDBACK_POLICY.windowDays} days`,USER_FEEDBACK_POLICY.sampleLimit).all<FeedbackRow>();
  return summarizeUserFeedback(result.results||[]);
 }catch{return neutralFeedbackProfile();}
}
