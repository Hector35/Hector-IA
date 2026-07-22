import {applyBudgetQualityGovernance,loadBudgetQualityGovernance,type BudgetQualityGovernanceMode} from './budget-quality-governance';

export type BudgetQualitySample={qualityAccepted?:boolean|number|null;feedbackRating?:number|null;correction?:string|null;createdAt?:string|null};
export type BudgetQualityPolicy={state:'healthy'|'suspended'|'probe';sampleCount:number;acceptedCount:number;negativeCount:number;correctionCount:number;acceptanceRate:number|null;negativeRate:number|null;correctionRate:number|null;lastDegradedAt:string|null;reason:string;governanceMode?:BudgetQualityGovernanceMode;governanceReason?:string|null};
export type BudgetQualityCategory=BudgetQualityPolicy&{task:string};

export const BUDGET_QUALITY_BREAKER={windowDays:14,minSamples:5,maxSamples:20,maxCategories:12,minAcceptanceRate:.75,maxNegativeRate:.35,maxCorrectionRate:.3,probeAfterHours:24} as const;

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

export function sortBudgetQualityCategories(items:BudgetQualityCategory[]){const priority={suspended:0,probe:1,healthy:2};return [...items].sort((a,b)=>priority[a.state]-priority[b.state]||b.sampleCount-a.sampleCount||a.task.localeCompare(b.task,'es'));}

async function loadAutomaticPolicy(db:D1Database,userId:string,task:string):Promise<BudgetQualityPolicy>{
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

export async function loadBudgetQualityPolicy(db:D1Database,userId:string,task:string):Promise<BudgetQualityPolicy>{
 const [policy,governance]=await Promise.all([loadAutomaticPolicy(db,userId,task),loadBudgetQualityGovernance(db,userId,task)]);
 return applyBudgetQualityGovernance(policy,governance);
}

export async function loadBudgetQualityOverview(db:D1Database,userId:string):Promise<BudgetQualityCategory[]>{
 try{
  const tasks=(await db.prepare(`SELECT task FROM (
    SELECT task,MAX(created_at) last_seen FROM response_traces WHERE user_id=? AND created_at>=datetime('now',?) AND json_extract(context_json,'$.budgetDecision.action')='degrade' GROUP BY task
    UNION ALL
    SELECT task,updated_at last_seen FROM budget_quality_governance WHERE user_id=? AND mode<>'auto'
   ) WHERE trim(task)<>'' GROUP BY task ORDER BY MAX(last_seen) DESC LIMIT ?`).bind(userId,`-${BUDGET_QUALITY_BREAKER.windowDays} days`,userId,BUDGET_QUALITY_BREAKER.maxCategories).all<{task:string}>()).results||[];
  const items=await Promise.all(tasks.map(async row=>({task:String(row.task),...await loadBudgetQualityPolicy(db,userId,String(row.task))})));
  return sortBudgetQualityCategories(items);
 }catch{return [];}
}
