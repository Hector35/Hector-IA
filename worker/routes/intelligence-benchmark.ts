import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack,renderContext} from '../lib/context';
import {estimateCost,respondContextual} from '../lib/openai';
import {BLIND_BENCHMARK_CASES,compareBenchmarkCase,summarizeBenchmark} from '../lib/blind-benchmark';

export const intelligenceBenchmark=new Hono<{Bindings:Bindings;Variables:Variables}>();
intelligenceBenchmark.use('*',requireAuth);

intelligenceBenchmark.get('/manifest',c=>c.json({
 version:'1.0.0',
 maxCasesPerRun:3,
 contentStored:false,
 methodology:'Mismos prompts y contexto; baseline usa una pasada automática, adaptive fuerza razonamiento alto y deliberación multiagente. El orden A/B se oculta hasta completar la corrida y el puntaje usa criterios deterministas observables.',
 cases:BLIND_BENCHMARK_CASES.map(({id,category,prompt,maxScore})=>({id,category,prompt,maxScore}))
}));

intelligenceBenchmark.post('/run',async c=>{
 const parsed=z.object({caseIds:z.array(z.string()).min(1).max(3).optional(),seed:z.string().min(1).max(80).optional()}).safeParse(await c.req.json().catch(()=>({})));
 if(!parsed.success)return c.json({error:'Solicitud de benchmark inválida'},400);
 const requested=parsed.data.caseIds?.length?parsed.data.caseIds:BLIND_BENCHMARK_CASES.slice(0,3).map(item=>item.id);
 const unique=[...new Set(requested)],cases=unique.map(id=>BLIND_BENCHMARK_CASES.find(item=>item.id===id)).filter((item):item is (typeof BLIND_BENCHMARK_CASES)[number]=>!!item);
 if(cases.length!==unique.length)return c.json({error:'Uno o más casos no existen'},400);
 const userId=c.get('userId'),seed=parsed.data.seed||crypto.randomUUID(),started=Date.now(),results:any[]=[];
 for(const item of cases){
  const pack=await loadContextPack(c.env,userId,undefined,item.prompt),context=renderContext(pack);
  const baselineStarted=Date.now(),baseline=await respondContextual(c.env,item.prompt,[],context,false,{userId,reasoning:'auto',deliberation:'off'}),baselineLatencyMs=Date.now()-baselineStarted,baselineCost=estimateCost(baseline.usage);
  const adaptiveStarted=Date.now(),adaptive=await respondContextual(c.env,item.prompt,[],context,false,{userId,reasoning:'high',deliberation:'force'}),adaptiveLatencyMs=Date.now()-adaptiveStarted,adaptiveCost=estimateCost(adaptive.usage);
  const comparison=compareBenchmarkCase(item,baseline.text,adaptive.text,seed),answers={A:comparison.labelMap.A==='baseline'?baseline.text:adaptive.text,B:comparison.labelMap.B==='baseline'?baseline.text:adaptive.text};
  results.push({...comparison,prompt:item.prompt,maxScore:item.maxScore,answers,metrics:{baseline:{model:baseline.model,provider:baseline.provider,latencyMs:baselineLatencyMs,costUsd:baselineCost.costUsd,cognitiveMode:baseline.cognitiveMode},adaptive:{model:adaptive.model,provider:adaptive.provider,latencyMs:adaptiveLatencyMs,costUsd:adaptiveCost.costUsd,cognitiveMode:adaptive.cognitiveMode}},context:{memories:pack.memories.length,hasSummary:!!pack.summary}});
 }
 const summary=summarizeBenchmark(results),totalCostUsd=results.reduce((sum,item)=>sum+item.metrics.baseline.costUsd+item.metrics.adaptive.costUsd,0);
 return c.json({runId:crypto.randomUUID(),seed,contentStored:false,elapsedMs:Date.now()-started,totalCostUsd,summary,results});
});
