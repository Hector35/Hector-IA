import {beforeEach,describe,expect,it,vi} from 'vitest';
import {benchmarkCallReduction,createCallGovernor,decideCallBudget,governExecutionPlan,resetCallGovernorState,shouldUseExactCallCache} from './call-governor';
import {createExecutionPlan} from './execution-plan';

async function ensemblePlan(){
 return createExecutionPlan({task:'code',route:{model:'advanced',tier:'deep',reasoning:'high',needsWeb:false},provider:{requested:'openai',reason:'test'},cognition:{mode:'ensemble',passes:3,reason:'test'},allowedModels:['advanced'],policySummary:'test'});
}

describe('free-first call governor',()=>{
 beforeEach(()=>resetCallGovernorState());

 it('usa cero llamadas avanzadas para un flujo determinista',()=>{
  const decision=decideCallBudget({prompt:'ejecuta procedimiento conocido',reuse:'deterministic',requestedPasses:3,reasoningLevel:'high'});
  expect(decision).toMatchObject({maxAdvancedCalls:0,allowedPasses:1,estimatedAdvancedCallsSaved:3});
 });

 it('limita a una llamada una tarea parcialmente conocida',async()=>{
  const governed=await governExecutionPlan(await ensemblePlan(),{prompt:'corrige solo la parte nueva usando el procedimiento verificado',reuse:'assist',reasoningLevel:'high'});
  expect(governed.plan.cognition).toMatchObject({mode:'single',passes:1});
  expect(governed.decision.estimatedAdvancedCallsSaved).toBe(2);
 });

 it('limita a una llamada una tarea nueva simple y conserva tres para análisis complejo',()=>{
  expect(decideCallBudget({prompt:'valida y normaliza estos datos',reuse:'escalate',requestedPasses:3,reasoningLevel:'high'}).maxAdvancedCalls).toBe(1);
  const complex='Audita la arquitectura completa, compara alternativas, diagnostica riesgos de seguridad y documenta trade-offs antes de una migracion irreversible con múltiples dependencias.';
  expect(decideCallBudget({prompt:complex,reuse:'escalate',requestedPasses:3,reasoningLevel:'high'}).maxAdvancedCalls).toBe(3);
 });

 it('deduplica entre gobernadores cuando la misma inferencia está en vuelo',async()=>{
  const decision=decideCallBudget({prompt:'valida datos',reuse:'escalate',requestedPasses:1,reasoningLevel:'auto'});
  const firstGovernor=createCallGovernor(decision),secondGovernor=createCallGovernor(decision);
  let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  const execute=vi.fn(async()=>{await gate;return'ok';});
  const first=firstGovernor.advanced({key:'same',justification:'resolver',execute});
  const second=secondGovernor.advanced({key:'same',justification:'resolver',execute});
  release();
  expect(await Promise.all([first,second])).toEqual(['ok','ok']);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(firstGovernor.metrics.advancedCalls).toBe(1);
  expect(secondGovernor.metrics.deduplicatedCalls).toBe(1);
 });

 it('reutiliza una respuesta exacta segura en otra ejecución',async()=>{
  const decision=decideCallBudget({prompt:'resume texto estable',reuse:'escalate',requestedPasses:1,reasoningLevel:'auto'});
  const execute=vi.fn(async()=>({text:'resultado estable'}));
  const first=createCallGovernor(decision),second=createCallGovernor(decision);
  expect(await first.advanced({key:'exact',justification:'primera',execute,cacheable:true})).toEqual({text:'resultado estable'});
  expect(await second.advanced({key:'exact',justification:'segunda',execute,cacheable:true})).toEqual({text:'resultado estable'});
  expect(execute).toHaveBeenCalledOnce();
  expect(second.metrics).toMatchObject({advancedCalls:0,cacheHits:1,executedPasses:0});
 });

 it('solo habilita cache exacta para lecturas estables de bajo riesgo',()=>{
  expect(shouldUseExactCallCache({prompt:'resume este texto',allowWeb:false,risk:'low'})).toBe(true);
  expect(shouldUseExactCallCache({prompt:'precio actual',allowWeb:false,risk:'low'})).toBe(false);
  expect(shouldUseExactCallCache({prompt:'consulta web',allowWeb:true,risk:'low'})).toBe(false);
  expect(shouldUseExactCallCache({prompt:'actualiza repositorio',allowWeb:false,risk:'medium'})).toBe(false);
 });

 it('bloquea llamadas que exceden el presupuesto',async()=>{
  const decision=decideCallBudget({prompt:'valida datos',reuse:'escalate',requestedPasses:1,reasoningLevel:'auto'});
  const governor=createCallGovernor(decision);
  await governor.advanced({key:'first',justification:'primera',execute:async()=>1});
  await expect(governor.advanced({key:'second',justification:'redundante',execute:async()=>2})).rejects.toThrow('bloqueó una inferencia avanzada redundante');
  expect(governor.metrics.blockedCalls).toBe(1);
 });

 it('demuestra reducción sin eliminar el escalamiento de tareas nuevas',()=>{
  const report=benchmarkCallReduction();
  expect(report).toEqual([
   expect.objectContaining({name:'conocida',beforeAdvancedCalls:3,afterAdvancedCalls:0,savedAdvancedCalls:3,successGuard:true}),
   expect.objectContaining({name:'parcial',afterAdvancedCalls:1,savedAdvancedCalls:2,successGuard:true}),
   expect.objectContaining({name:'nueva-simple',afterAdvancedCalls:1,savedAdvancedCalls:2,successGuard:true}),
   expect.objectContaining({name:'nueva-compleja',afterAdvancedCalls:3,savedAdvancedCalls:0,successGuard:true})
  ]);
 });
});
