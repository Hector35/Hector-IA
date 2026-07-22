import {describe,expect,it} from 'vitest';
import {createExecutionPlan,hashExecutionPlan,verifyExecutionPlan,type ExecutionPlanInput} from './execution-plan';

const input=(overrides:Partial<ExecutionPlanInput>={}):ExecutionPlanInput=>({
 task:'consulta general',
 route:{model:'gpt-balanced',tier:'balanced',reasoning:'medium',needsWeb:false},
 provider:{requested:'openai',reason:'requiere razonamiento balanceado'},
 cognition:{mode:'single',passes:1,reason:'una pasada es proporcional'},
 allowedModels:['gpt-balanced'],
 policySummary:'Ruta final balanced.',
 ...overrides
});

describe('execution plan',()=>{
 it('produce un hash determinista independiente del orden de claves',async()=>{
  const a=input(),b={...input(),allowedModels:['gpt-balanced']};
  expect(await hashExecutionPlan(a)).toBe(await hashExecutionPlan(b));
 });

 it('acepta una ejecución exacta',async()=>{
  const plan=await createExecutionPlan(input());
  const result=verifyExecutionPlan(plan,{model:'gpt-balanced',tier:'balanced',provider:'openai',cognitiveMode:'single',deliberationPasses:1});
  expect(result).toMatchObject({ok:true,status:'exact'});
 });

 it('normaliza un plan Qwen a su modelo real y una sola inferencia',async()=>{
  const plan=await createExecutionPlan(input({provider:{requested:'huggingface',reason:'solicitud explícita'},cognition:{mode:'ensemble',passes:3,reason:'profundo'},allowedModels:['gpt-balanced']}));
  expect(plan.route.model).toBe('Qwen/Qwen3-4B-Instruct-2507');
  expect(plan.allowedModels).toContain('Qwen/Qwen3-4B-Instruct-2507');
  expect(plan.cognition).toMatchObject({mode:'single',passes:1});
  expect(verifyExecutionPlan(plan,{model:'Qwen/Qwen3-4B-Instruct-2507',tier:'balanced',provider:'huggingface',cognitiveMode:'single',deliberationPasses:1})).toMatchObject({ok:true,status:'exact'});
 });

 it('acepta únicamente el fallback explícito Cloudflare a OpenAI',async()=>{
  const plan=await createExecutionPlan(input({route:{model:'cf-fast',tier:'fast',reasoning:'low',needsWeb:false},provider:{requested:'cloudflare',reason:'consulta breve'},allowedModels:['cf-fast']}));
  expect(verifyExecutionPlan(plan,{model:'cf-fast',tier:'fast',provider:'openai',fallback:true,cognitiveMode:'single',deliberationPasses:1}).status).toBe('allowed-fallback');
  expect(verifyExecutionPlan(plan,{model:'cf-fast',tier:'fast',provider:'openai',fallback:false,cognitiveMode:'single',deliberationPasses:1}).status).toBe('drift');
 });

 it('bloquea cambios de modelo, nivel o modo cognitivo',async()=>{
  const plan=await createExecutionPlan(input());
  const result=verifyExecutionPlan(plan,{model:'otro-modelo',tier:'deep',provider:'openai',cognitiveMode:'ensemble',deliberationPasses:3});
  expect(result.ok).toBe(false);
  expect(result.differences.join(' ')).toMatch(/tier previsto/);
  expect(result.differences.join(' ')).toMatch(/modelo no autorizado/);
  expect(result.differences.join(' ')).toMatch(/modo previsto/);
 });

 it('permite degradación interna del ensemble sin cambiar la ruta',async()=>{
  const plan=await createExecutionPlan(input({route:{model:'gpt-deep',tier:'deep',reasoning:'high',needsWeb:false},provider:{requested:'openai',reason:'profundo'},cognition:{mode:'ensemble',passes:3,reason:'doble resolución'},allowedModels:['gpt-deep','gpt-critic']}));
  expect(verifyExecutionPlan(plan,{model:'gpt-deep',tier:'deep',provider:'openai',cognitiveMode:'ensemble-degraded',deliberationPasses:2,fallback:true}).ok).toBe(true);
 });
});
