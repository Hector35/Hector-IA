export type BudgetQualitySample={qualityAccepted?:boolean|number|null;feedbackRating?:number|null;correction?:string|null;createdAt?:string|null};
export type BudgetQualityPolicy={state:'healthy'|'suspended'|'probe';sampleCount:number;acceptedCount:number;negativeCount:number;correctionCount:number;acceptanceRate:number|null;negativeRate:number|null;correctionRate:number|null;lastDegradedAt:string|null;reason:string};

export const BUDGET_QUALITY_BREAKER={windowDays:14,minSamples:5,maxSamples:20,minAcceptanceRate:.75,maxNegativeRate:.35,maxCorrectionRate:.3,probeAfterHours:24} as const;

function validDate(value:unknown){const date=new Date(String(value||''));return Number.isNaN(date.getTime())?null:date;}

export function evaluateBudgetQuality(samples:BudgetQualitySample[],nowMs=Date.now()):BudgetQualityPolicy{
 const rows=samples.slice(0,BUDGET_QUALITY_BREAKER.maxSamples),sampleCount=rows.length;
 let acceptedCount=0,negativeCount=0,correctionCount=0;
 for(const row of rows){
  const accepted=row.qualityAccepted===true||row.qualityAccepted===1,negative=row.feedbackRating===-1||row.qualityAccepted===false||row.qualityAccepted===0,corrected=!!String(row.correction||'').trim();
  if(accepted)acceptedCount++;
  if(negative||corrected)negativeCount++;
  if(corrected)correctionCount++;
 }
 const acceptanceRate=sampleCount?acceptedCount/sampleCount:null,negativeRate=sampleCount?negativeCount/sampleCount:null,correctionRate=sampleCount?correctionCount/sampleCount:null,lastDate=validDate(rows[0]?.createdAt),lastDegradedAt=lastDate?.toISOString()||null;
 if(sampleCount<BUDGET_QUALITY_BREAKER.minSamples)return{state:'healthy',sampleCount,acceptedCount,negativeCount,correctionCount,acceptanceRate,negativeRate,correctionRate,lastDegradedAt,reason:`muestras insuficientes (${sampleCount}/${BUDGET_QUALITY_BREAKER.minSamples})`};
 const unhealthy=Number(acceptanceRate)<BUDGET_QUALITY_BREAKER.minAcceptanceRate||Number(negativeRate)>=BUDGET_QUALITY_BREAKER.maxNegativeRate||Number(correctionRate)>=BUDGET_QUALITY_BREAKER.maxCorrectionRate;
 if(!unhealthy)return{state:'healthy',sampleCount,acceptedCount,negativeCount,correctionCount,acceptanceRate,negativeRate,correctionRate,lastDegradedAt,reason:'la calidad observada permite mantener degradaciones presupuestarias'};
 const elapsedHours=lastDate?(nowMs-lastDate.getTime())/3_600_000:0;
 if(lastDate&&elapsedHours>=BUDGET_QUALITY_BREAKER.probeAfterHours)return{state:'probe',sampleCount,acceptedCount,negativeCount,correctionCount,acceptanceRate,negativeRate,correctionRate,lastDegradedAt,reason:`calidad degradada; se permite una prueba controlada tras ${Math.floor(elapsedHours)} h sin degradaciones`};
 return{state:'suspended',sampleCount,acceptedCount,negativeCount,correctionCount,acceptanceRate,negativeRate,correctionRate,lastDegradedAt,reason:'degradaciones suspendidas para proteger calidad: aceptación o correcciones fuera de umbral'};
}

export async function loadBudgetQualityPolicy(db:D1Database,userId:string,task:string):Promise<BudgetQualityPolicy>{
 try{
  const rows=(await db.prepare(`SELECT t.quality_accepted qualityAccepted,t.created_at createdAt,f.rating feedbackRating,f.correction correction
   FROM response_traces t
   LEFT JOIN response_feedback f ON f.trace_id=t.id AND f.user_id=t.user_id
   WHERE t.user_id=? AND t.task=? AND t.created_at>=datetime('now',?)
     AND json_extract(t.context_json,'$.budgetDecision.action')='degrade'
   ORDER BY t.created_at DESC LIMIT ?`).bind(userId,task,`-${BUDGET_QUALITY_BREAKER.windowDays} days`,BUDGET_QUALITY_BREAKER.maxSamples).all<BudgetQualitySample>()).results||[];
  return evaluateBudgetQuality(rows);
 }catch{return evaluateBudgetQuality([]);}
}
