import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createExecutionPlan} from './execution-plan';
import {applyCallGovernorPolicy,buildCallGovernorMetrics,resetCallGovernorState,runGovernedExecution,shouldCacheGovernorRequest} from './call-governor';

async function ensemblePlan(){
 return createExecutionPlan({
  task:'code',route:{model:'gpt-5.6',tier:'deep',reasoning:'high',needsWeb:false},provider:{requested:'openai',reason:'tarea compleja'},
  cognition:{mode:'ensemble',passes:3,reason:'validación múltiple'},allowedModels:['gpt-5.6'],policySummary:'plan de prueba'
 });
}

describe('free-first call governor',()=>{
 beforeEach(()=>resetCallGovernorState());

 it('reduce una tarea parcialmente conocida de tres pasadas a una',async()=>{
  const original=await ensemblePlan();
  const governed=await applyCallGovernorPolicy(original,{prompt:'corrige el error usando la experiencia verificada',reuseKind:'assist'});
  expect(governed.originalPasses).toBe(3);
  expect(governed.plan.cognition).toMatchObject({mode:'single',passes:1});
  const metrics=buildCallGovernorMetrics({plan:governed.plan,originalPlannedPasses:3,reuseKind:'assist',provider:'openai',actualPasses:1,cacheStatus:'miss',estimatedCostUsd:.02,justification:governed.justification});
  expect(metrics).toMatchObject({advancedInferencePasses:1,callsAvoided:2,totalInferencePasses:1});
 });

 it('conserva verificación independiente para una auditoría crítica nueva',async()=>{
  const original=await ensemblePlan();
  const governed=await applyCallGovernorPolicy(original,{prompt:'auditoría crítica de seguridad en producción',reuseKind:'escalate'});
  expect(governed.plan.cognition).toMatchObject({mode:'ensemble',passes:3});
 });

 it('sirve una repetición exacta sin una segunda inferencia',async()=>{
  const execute=vi.fn(async()=>({text:'resultado verificado'}));
  const first=await runGovernedExecution({key:'same',cacheable:true,execute});
  const second=await runGovernedExecution({key:'same',cacheable:true,execute});
  expect(first.cacheStatus).toBe('miss');
  expect(second.cacheStatus).toBe('hit');
  expect(execute).toHaveBeenCalledOnce();
 });

 it('deduplica dos solicitudes idénticas que llegan al mismo tiempo',async()=>{
  let release=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const execute=vi.fn(async()=>{await gate;return{text:'una ejecución'};});
  const first=runGovernedExecution({key:'parallel',cacheable:false,execute});
  const second=runGovernedExecution({key:'parallel',cacheable:false,execute});
  release();
  const[a,b]=await Promise.all([first,second]);
  expect(a.cacheStatus).toBe('disabled');
  expect(b.cacheStatus).toBe('deduplicated');
  expect(execute).toHaveBeenCalledOnce();
 });

 it('no almacena consultas volátiles, con web o de riesgo',()=>{
  expect(shouldCacheGovernorRequest({prompt:'resume este texto estable',allowWeb:false,risk:'low'})).toBe(true);
  expect(shouldCacheGovernorRequest({prompt:'precio actual del producto',allowWeb:false,risk:'low'})).toBe(false);
  expect(shouldCacheGovernorRequest({prompt:'investiga en web',allowWeb:true,risk:'low'})).toBe(false);
  expect(shouldCacheGovernorRequest({prompt:'actualiza el repositorio',allowWeb:false,risk:'medium'})).toBe(false);
 });

 it('cuenta cero inferencias y tres llamadas evitadas en un cache hit',async()=>{
  const plan=await ensemblePlan();
  const metrics=buildCallGovernorMetrics({plan,originalPlannedPasses:3,reuseKind:'escalate',provider:'openai',actualPasses:3,cacheStatus:'hit',estimatedCostUsd:.06,justification:'coincidencia exacta segura'});
  expect(metrics).toMatchObject({totalInferencePasses:0,advancedInferencePasses:0,callsAvoided:3,estimatedCostUsd:0});
 });
});
