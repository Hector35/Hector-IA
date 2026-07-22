import {beforeEach,describe,expect,it,vi} from 'vitest';
import {benchmarkCallReduction,createCallGovernor,decideCallBudget,governExecutionPlan,resetCallGovernorState} from './call-governor';
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

 it('deduplica inferencias idénticas entre solicitudes distintas',async()=>{
  const decision=decideCallBudget({prompt:'valida datos',reuse:'escalate',requestedPasses:1,reasoningLevel:'auto'});
  const firstGovernor=createCallGovernor(decision),secondGovernor=createCallGovernor(decision);
  let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  const execute=vi.fn(async()=>{await gate;return'ok';});
  const first=firstGovernor.advanced({key:'same',justification:'resolver',execute});
  await new Promise(resolve=>setTimeout(resolve,0));
  const second=secondGovernor.advanced({key:'same',justification:'resolver',execute});
  await new Promise(resolve=>setTimeout(resolve,0));
  release();
  expect(await Promise.all([first,second])).toEqual(['ok','ok']);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(firstGovernor.metrics.advancedCalls).toBe(1);
  expect(secondGovernor.metrics).toMatchObject({advancedCalls:0,deduplicatedCalls:1,blockedCalls:0,estimatedAdvancedCallsSaved:1});
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
