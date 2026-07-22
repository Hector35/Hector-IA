import {afterEach,describe,expect,it,vi} from 'vitest';
import {createExecutionPlan} from './execution-plan';
import {estimatePlannedCost,executePlannedContextual} from './planned-response';

afterEach(()=>vi.restoreAllMocks());

describe('planned response authority',()=>{
 it('mantiene la ruta autorizada dentro del plan inmutable',async()=>{
  const plan=await createExecutionPlan({task:'ingeniería de software',route:{model:'gpt-deep',tier:'deep',reasoning:'high',needsWeb:false},provider:{requested:'openai',reason:'plan aprobado'},cognition:{mode:'ensemble',passes:3,reason:'doble resolución'},allowedModels:['gpt-deep','gpt-critic'],policySummary:'Ruta final deep.'});
  expect(plan.route).toEqual({model:'gpt-deep',tier:'deep',reasoning:'high',needsWeb:false});
  expect(plan.provider.requested).toBe('openai');
  expect(plan.cognition).toMatchObject({mode:'ensemble',passes:3});
  expect(Object.isFrozen(plan)).toBe(true);
 });

 it('ejecuta Qwen sin sustituirlo silenciosamente por otro proveedor',async()=>{
  const plan=await createExecutionPlan({task:'consulta general',route:{model:'gpt-balanced',tier:'balanced',reasoning:'medium',needsWeb:false},provider:{requested:'huggingface',reason:'Héctor Qwen solicitado explícitamente'},cognition:{mode:'ensemble',passes:3,reason:'solicitud profunda'},allowedModels:['gpt-balanced'],policySummary:'Ruta Qwen provisional.'});
  const run=vi.fn(async()=>({success:true})),bind=vi.fn(()=>({run})),prepare=vi.fn(()=>({bind}));
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id:'hf-planned',choices:[{message:{content:'Respuesta Qwen verificada.'}}],usage:{prompt_tokens:8,completion_tokens:5}}),{status:200,headers:{'Content-Type':'application/json'}})));
  const out=await executePlannedContextual({HUGGINGFACE_TOKEN:'test-token',DB:{prepare} as any} as any,'Héctor Qwen: hola',[],'Contexto de prueba',plan,{feedback:{sampleCount:0,negativeRate:0,nonDeepSampleCount:0,nonDeepNegativeRate:0,cloudflareSampleCount:0,cloudflareNegativeRate:0,preferDeep:false,avoidCloudflare:false,guidance:[],reason:'neutral'},budgetDecision:null});
  expect(out).toMatchObject({provider:'huggingface',requestedProvider:'huggingface',model:'Qwen/Qwen3-4B-Instruct-2507',fallback:false,cognitiveMode:'single',deliberationPasses:1});
  expect(out.text).toBe('Respuesta Qwen verificada.');
 });

 it('conserva el cálculo de costo con metadata del modelo ejecutado',()=>{
  const cost=estimatePlannedCost({input_tokens:1000,output_tokens:500},'gpt-5.4');
  expect(cost.input).toBe(1000);
  expect(cost.output).toBe(500);
  expect(cost.costUsd).toBeGreaterThanOrEqual(0);
 });
});
