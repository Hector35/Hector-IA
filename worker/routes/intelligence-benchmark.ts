import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack,renderContext} from '../lib/context';
import {estimateCost,respondContextual} from '../lib/openai';
import {BLIND_BENCHMARK_CASES,compareBenchmarkCase,summarizeBenchmark} from '../lib/blind-benchmark';
import {BENCHMARK_PROMOTION_POLICY,recomputeBenchmarkPolicy} from '../lib/benchmark-promotion';
import {manualGovernanceUpdate,type GovernanceAction} from '../lib/strategy-governance';

export const intelligenceBenchmark=new Hono<{Bindings:Bindings;Variables:Variables}>();
intelligenceBenchmark.use('*',requireAuth);

intelligenceBenchmark.get('/manifest',c=>c.json({version:'1.2.0',maxCasesPerRun:3,contentStored:false,aggregateResultsStored:true,promotionPolicy:BENCHMARK_PROMOTION_POLICY,methodology:'Mismos prompts y contexto; baseline usa una pasada automática, adaptive fuerza razonamiento alto y deliberación multiagente. El orden A/B se oculta hasta completar la corrida y el puntaje usa criterios deterministas observables.',cases:BLIND_BENCHMARK_CASES.map(({id,category,prompt,maxScore})=>({id,category,prompt,maxScore}))}));

intelligenceBenchmark.get('/policies',async c=>{
 try{const [policies,events]=await Promise.all([c.env.DB.prepare('SELECT category,strategy,status,sample_count,adaptive_win_rate,average_score_delta,average_cost_multiplier,reason,promoted_at,rolled_back_at,governance_mode,governance_reason,governance_updated_at,updated_at FROM intelligence_strategy_policies WHERE user_id=? ORDER BY category').bind(c.get('userId')).all(),c.env.DB.prepare('SELECT id,category,action,strategy,status,reason,created_at FROM intelligence_strategy_events WHERE user_id=? ORDER BY created_at DESC LIMIT 30').bind(c.get('userId')).all()]);return c.json({contentStored:false,items:policies.results||[],events:events.results||[]});}
 catch{return c.json({contentStored:false,items:[],events:[],available:false,reason:'La migración de gobierno aún no está aplicada'});}
});

intelligenceBenchmark.put('/policies/:category/governance',async c=>{
 const parsed=z.object({action:z.enum(['freeze','unfreeze','exclude','include','manual_rollback']),reason:z.string().trim().min(3).max(300)}).safeParse(await c.req.json().catch(()=>null));
 if(!parsed.success)return c.json({error:'Decisión de gobierno inválida'},400);
 const userId=c.get('userId'),category=decodeURIComponent(c.req.param('category')),current=await c.env.DB.prepare('SELECT strategy,status FROM intelligence_strategy_policies WHERE user_id=? AND category=?').bind(userId,category).first<{strategy:'baseline'|'adaptive';status:string}>();
 if(!current)return c.json({error:'Política no encontrada'},404);
 const update=manualGovernanceUpdate(parsed.data.action as GovernanceAction,current,parsed.data.reason);
 await c.env.DB.batch([
  c.env.DB.prepare(`UPDATE intelligence_strategy_policies SET strategy=?,status=?,governance_mode=?,governance_reason=?,governance_updated_at=CURRENT_TIMESTAMP,rolled_back_at=CASE WHEN ?='manual_rollback' THEN CURRENT_TIMESTAMP ELSE rolled_back_at END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND category=?`).bind(update.strategy,update.status,update.governanceMode,update.reason,update.eventAction,userId,category),
  c.env.DB.prepare('INSERT INTO intelligence_strategy_events(id,user_id,category,action,strategy,status,reason) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,category,update.eventAction,update.strategy,update.status,update.reason)
 ]);
 return c.json({ok:true,category,...update});
});

intelligenceBenchmark.post('/run',async c=>{
 const parsed=z.object({caseIds:z.array(z.string()).min(1).max(3).optional(),seed:z.string().min(1).max(80).optional()}).safeParse(await c.req.json().catch(()=>({})));if(!parsed.success)return c.json({error:'Solicitud de benchmark inválida'},400);
 const requested=parsed.data.caseIds?.length?parsed.data.caseIds:BLIND_BENCHMARK_CASES.slice(0,3).map(item=>item.id),unique=[...new Set(requested)],cases=unique.map(id=>BLIND_BENCHMARK_CASES.find(item=>item.id===id)).filter((item):item is (typeof BLIND_BENCHMARK_CASES)[number]=>!!item);if(cases.length!==unique.length)return c.json({error:'Uno o más casos no existen'},400);
 const userId=c.get('userId'),seed=parsed.data.seed||crypto.randomUUID(),runId=crypto.randomUUID(),started=Date.now(),results:any[]=[];
 for(const item of cases){const pack=await loadContextPack(c.env,userId,undefined,item.prompt),context=renderContext(pack);const baselineStarted=Date.now(),baseline=await respondContextual(c.env,item.prompt,[],context,false,{userId,reasoning:'auto',deliberation:'off'}),baselineLatencyMs=Date.now()-baselineStarted,baselineCost=estimateCost(baseline.usage,baseline.model);const adaptiveStarted=Date.now(),adaptive=await respondContextual(c.env,item.prompt,[],context,false,{userId,reasoning:'high',deliberation:'force'}),adaptiveLatencyMs=Date.now()-adaptiveStarted,adaptiveCost=estimateCost(adaptive.usage,adaptive.model);const comparison=compareBenchmarkCase(item,baseline.text,adaptive.text,seed),answers={A:comparison.labelMap.A==='baseline'?baseline.text:adaptive.text,B:comparison.labelMap.B==='baseline'?baseline.text:adaptive.text},metrics={baseline:{model:baseline.model,provider:baseline.provider,latencyMs:baselineLatencyMs,costUsd:baselineCost.costUsd,cognitiveMode:baseline.cognitiveMode},adaptive:{model:adaptive.model,provider:adaptive.provider,latencyMs:adaptiveLatencyMs,costUsd:adaptiveCost.costUsd,cognitiveMode:adaptive.cognitiveMode}};results.push({...comparison,prompt:item.prompt,maxScore:item.maxScore,answers,metrics,context:{memories:pack.memories.length,hasSummary:!!pack.summary}});await c.env.DB.prepare('INSERT INTO intelligence_benchmark_results(id,user_id,run_id,case_id,category,baseline_score,adaptive_score,winner,baseline_cost_usd,adaptive_cost_usd,baseline_latency_ms,adaptive_latency_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,runId,item.id,item.category,comparison.baselineScore,comparison.adaptiveScore,comparison.winner,baselineCost.costUsd,adaptiveCost.costUsd,baselineLatencyMs,adaptiveLatencyMs).run();}
 const policies:any[]=[];for(const category of [...new Set(cases.map(item=>item.category))])policies.push({category,policy:await recomputeBenchmarkPolicy(c.env.DB,userId,category)});const summary=summarizeBenchmark(results),totalCostUsd=results.reduce((sum,item)=>sum+item.metrics.baseline.costUsd+item.metrics.adaptive.costUsd,0);return c.json({runId,seed,contentStored:false,aggregateResultsStored:true,elapsedMs:Date.now()-started,totalCostUsd,summary,policies,results});
});
