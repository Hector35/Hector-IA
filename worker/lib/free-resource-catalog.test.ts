import{describe,expect,it}from'vitest';
import{FREE_FIRST_MODELS,canAvoidPaidApi,firstFreeResource,isRejectedWorkersAiDefault,selectFreeResourcePlan}from'./free-resource-catalog';

describe('free resource catalog',()=>{
 it('prioriza reglas y D1 antes que inferencia gratuita',()=>{
  const plan=selectFreeResourcePlan(['routing','retrieval'],{d1:true,workersAi:true});
  expect(plan[0]?.id).toBe('deterministic-rules');
  expect(plan.findIndex(item=>item.id==='d1-hybrid-retrieval')).toBeLessThan(plan.findIndex(item=>item.id==='workers-ai-embeddings'));
 });

 it('usa WASM como respaldo y WebGPU solo cuando el dispositivo lo permite',()=>{
  expect(firstFreeResource('embedding',{browserWasm:true})?.id).toBe('browser-wasm-inference');
  const accelerated=selectFreeResourcePlan(['embedding'],{browserWasm:true,browserWebGpu:true});
  expect(accelerated.map(item=>item.id)).toEqual(expect.arrayContaining(['browser-wasm-inference','browser-webgpu-inference']));
 });

 it('mantiene modelos actuales y rechaza modelos deprecados como defaults',()=>{
  expect(FREE_FIRST_MODELS).toEqual({generation:'@cf/zai-org/glm-4.7-flash',embedding:'@cf/google/embeddinggemma-300m',reranker:'@cf/baai/bge-reranker-base'});
  expect(isRejectedWorkersAiDefault(FREE_FIRST_MODELS.generation)).toBe(false);
  expect(isRejectedWorkersAiDefault('@cf/meta/llama-3.1-8b-instruct')).toBe(true);
 });

 it('evita API pagada solo cuando existe una ruta gratuita para cada capacidad',()=>{
  expect(canAvoidPaidApi(['classification','retrieval'],{d1:true})).toBe(true);
  expect(canAvoidPaidApi(['generation'],{})).toBe(false);
  expect(canAvoidPaidApi(['generation'],{workersAi:true})).toBe(true);
 });

 it('reserva validación de código para runners públicos disponibles',()=>{
  expect(firstFreeResource('code-validation',{})?.id).toBeUndefined();
  expect(firstFreeResource('code-validation',{githubPublicRunners:true})?.id).toBe('github-actions-public-runner');
 });
});
