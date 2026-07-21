import {applyGovernance,normalizeGovernanceMode,type GovernanceMode} from './strategy-governance';
import {loadBudgetQualityPolicy,type BudgetQualityPolicy} from './budget-quality-breaker';

export type BenchmarkAggregateRow={winner:'baseline'|'adaptive'|'tie';baseline_score:number;adaptive_score:number;baseline_cost_usd:number;adaptive_cost_usd:number;created_at?:string};
export type BenchmarkPolicy={strategy:'baseline'|'adaptive';status:string;sampleCount:number;adaptiveWinRate:number;averageScoreDelta:number;averageCostMultiplier:number;reason:string;governanceMode?:GovernanceMode;governanceReason?:string|null;budgetQuality?:BudgetQualityPolicy|null};

export const BENCHMARK_PROMOTION_POLICY={windowDays:90,sampleLimit:40,minSamples:5,minAdaptiveWinRate:.6,minAverageScoreDelta:2,maxAverageCostMultiplier:4,rollbackWindow:3,rollbackBaselineWinRate:.5};

const finite=(value:unknown,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};
export function summarizeBenchmarkPolicy(rows:BenchmarkAggregateRow[],current?:Pick<BenchmarkPolicy,'strategy'|'status'>):BenchmarkPolicy{
 const safe=rows.slice(0,BENCHMARK_PROMOTION_POLICY.sampleLimit),sampleCount=safe.length;
 const adaptiveWins=safe.filter(x=>x.winner==='adaptive').length,adaptiveWinRate=sampleCount?adaptiveWins/sampleCount:0;
 const averageScoreDelta=sampleCount?safe.reduce((sum,x)=>sum+finite(x.adaptive_score)-finite(x.baseline_score),0)/sampleCount:0;
 const costRatios=safe.map(x=>finite(x.baseline_cost_usd)>0?finite(x.adaptive_cost_usd)/finite(x.baseline_cost_usd):null).filter((x):x is number=>x!==null&&Number.isFinite(x));
 const averageCostMultiplier=costRatios.length?costRatios.reduce((a,b)=>a+b,0)/costRatios.length:1;
 const recent=safe.slice(0,BENCHMARK_PROMOTION_POLICY.rollbackWindow),recentBaselineRate=recent.length?recent.filter(x=>x.winner==='baseline').length/recent.length:0;
 if(current?.strategy==='adaptive'&&current.status==='promoted'&&recent.length===BENCHMARK_PROMOTION_POLICY.rollbackWindow&&(recentBaselineRate>=BENCHMARK_PROMOTION_POLICY.rollbackBaselineWinRate||recent.reduce((s,x)=>s+finite(x.adaptive_score)-finite(x.baseline_score),0)<0))return{strategy:'baseline',status:'rolled_back',sampleCount,adaptiveWinRate,averageScoreDelta,averageCostMultiplier,reason:'rollback: las muestras recientes ya no sostienen la ventaja adaptativa'};
 const eligible=sampleCount>=BENCHMARK_PROMOTION_POLICY.minSamples&&adaptiveWinRate>=BENCHMARK_PROMOTION_POLICY.minAdaptiveWinRate&&averageScoreDelta>=BENCHMARK_PROMOTION_POLICY.minAverageScoreDelta&&averageCostMultiplier<=BENCHMARK_PROMOTION_POLICY.maxAverageCostMultiplier;
 if(eligible)return{strategy:'adaptive',status:'promoted',sampleCount,adaptiveWinRate,averageScoreDelta,averageCostMultiplier,reason:'promoción: ventaja de calidad repetida dentro del límite de costo'};
 return{strategy:'baseline',status:current?.status==='rolled_back'?'rolled_back':'observing',sampleCount,adaptiveWinRate,averageScoreDelta,averageCostMultiplier,reason:sampleCount<BENCHMARK_PROMOTION_POLICY.minSamples?'muestras insuficientes':'la ventaja adaptativa aún no cumple calidad, consistencia y costo'};
}

export function applyBudgetQualityProtection(policy:BenchmarkPolicy,quality:BudgetQualityPolicy,governanceMode:GovernanceMode='auto'):BenchmarkPolicy{
 if(governanceMode!=='auto'||quality.state!=='suspended')return{...policy,budgetQuality:quality};
 return{...policy,strategy:'adaptive',status:'promoted',reason:`protección temporal de calidad presupuestaria: ${quality.reason}`,budgetQuality:quality};
}

export async function loadBenchmarkPolicy(db:D1Database,userId:string,category:string):Promise<BenchmarkPolicy|null>{
 try{
  const row=await db.prepare('SELECT strategy,status,sample_count,adaptive_win_rate,average_score_delta,average_cost_multiplier,reason,governance_mode,governance_reason FROM intelligence_strategy_policies WHERE user_id=? AND category=?').bind(userId,category).first<any>();
  const governanceMode=normalizeGovernanceMode(row?.governance_mode),base:BenchmarkPolicy=row?{strategy:row.strategy,status:row.status,sampleCount:Number(row.sample_count),adaptiveWinRate:Number(row.adaptive_win_rate),averageScoreDelta:Number(row.average_score_delta),averageCostMultiplier:Number(row.average_cost_multiplier),reason:String(row.reason),governanceMode,governanceReason:row.governance_reason?String(row.governance_reason):null}:{strategy:'baseline',status:'observing',sampleCount:0,adaptiveWinRate:0,averageScoreDelta:0,averageCostMultiplier:1,reason:'sin benchmark adaptativo persistido',governanceMode,governanceReason:null};
  const quality=await loadBudgetQualityPolicy(db,userId,category);
  return applyBudgetQualityProtection(base,quality,governanceMode);
 }catch{return null;}
}

export async function recomputeBenchmarkPolicy(db:D1Database,userId:string,category:string){
 const existing=await loadBenchmarkPolicy(db,userId,category),rows=(await db.prepare(`SELECT winner,baseline_score,adaptive_score,baseline_cost_usd,adaptive_cost_usd,created_at FROM intelligence_benchmark_results WHERE user_id=? AND category=? AND created_at>=datetime('now',?) ORDER BY created_at DESC LIMIT ?`).bind(userId,category,`-${BENCHMARK_PROMOTION_POLICY.windowDays} days`,BENCHMARK_PROMOTION_POLICY.sampleLimit).all<BenchmarkAggregateRow>()).results||[],automatic=summarizeBenchmarkPolicy(rows,existing||undefined),policy=applyGovernance(automatic,existing?{strategy:existing.strategy,status:existing.status,governanceMode:existing.governanceMode||'auto',governanceReason:existing.governanceReason||null}:null),nowPromoted=policy.status==='promoted'&&existing?.status!=='promoted',nowRolledBack=policy.status==='rolled_back'&&existing?.status==='promoted';
 await db.prepare(`INSERT INTO intelligence_strategy_policies(user_id,category,strategy,status,sample_count,adaptive_win_rate,average_score_delta,average_cost_multiplier,reason,promoted_at,rolled_back_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,category) DO UPDATE SET strategy=excluded.strategy,status=excluded.status,sample_count=excluded.sample_count,adaptive_win_rate=excluded.adaptive_win_rate,average_score_delta=excluded.average_score_delta,average_cost_multiplier=excluded.average_cost_multiplier,reason=excluded.reason,promoted_at=COALESCE(excluded.promoted_at,intelligence_strategy_policies.promoted_at),rolled_back_at=COALESCE(excluded.rolled_back_at,intelligence_strategy_policies.rolled_back_at),updated_at=CURRENT_TIMESTAMP`).bind(userId,category,policy.strategy,policy.status,policy.sampleCount,policy.adaptiveWinRate,policy.averageScoreDelta,policy.averageCostMultiplier,policy.reason,nowPromoted?new Date().toISOString():null,nowRolledBack?new Date().toISOString():null).run();return{...policy,governanceMode:existing?.governanceMode||'auto',governanceReason:existing?.governanceReason||null};
}
