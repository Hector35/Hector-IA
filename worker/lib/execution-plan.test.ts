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

 it('prohíbe fallback de Héctor Base hacia OpenAI',async()=>{
  const plan=await createExecutionPlan(input({route:{model:'@cf/meta/llama-3.2-3b-instruct',tier:'fast',reasoning:'low',needsWeb:false},provider:{requested:'cloudflare',reason:'chat abierto'},allowedModels:['@cf/meta/llama-3.2-3b-instruct']}));
  expect(verifyExecutionPlan(plan,{model:'gpt-balanced',tier:'fast',provider:'openai',fallback:true,cognitiveMode:'single',deliberationPasses:1}).status).toBe('drift');
 });

 it('permite sustituir un plan legado de OpenAI por Héctor Base, nunca al revés',async()=>{
  const plan=await createExecutionPlan(input());
  const result=verifyExecutionPlan(plan,{model:'@cf/meta/llama-3.2-3b-instruct',tier:'balanced',provider:'cloudflare',fallback:true,cognitiveMode:'single',deliberationPasses:1});
  expect(result).toMatchObject({ok:true,status:'allowed-fallback'});
  expect(result.summary).toMatch(/OpenAI fue sustituido por Héctor Base/);
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
  const plan=await createExecutionPlan(input({route:{model:'@cf/meta/llama-3.2-3b-instruct',tier:'deep',reasoning:'high',needsWeb:false},provider:{requested:'cloudflare',reason:'profundo abierto'},cognition:{mode:'ensemble',passes:3,reason:'doble resolución'},allowedModels:['@cf/meta/llama-3.2-3b-instruct']}));
  expect(verifyExecutionPlan(plan,{model:'@cf/meta/llama-3.2-3b-instruct',tier:'deep',provider:'cloudflare',cognitiveMode:'ensemble-degraded',deliberationPasses:2,fallback:true}).ok).toBe(true);
 });
});
