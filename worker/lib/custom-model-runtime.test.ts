import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {hectorRuntimeCatalog,normalizeHectorRuntime,requestedHectorRuntime,stripHectorRuntimeDirective} from './custom-model-runtime';

const env=(overrides:Partial<Bindings>={})=>({
 CLOUDFLARE_AI_ENABLED:'true',
 AI:{} as Ai,
 HECTOR_QWEN_ENABLED:'true',
 HUGGINGFACE_TOKEN:'hf-test',
 HECTOR_QWEN_MODEL:'Qwen/Qwen3-4B-Instruct-2507',
 HECTOR_CUSTOM_MODEL_ENABLED:'false',
 HECTOR_CUSTOM_MODEL_ID:'hector-asi-qwen15-v10',
 HECTOR_CUSTOM_MODEL_LABEL:'Héctor Qwen15 v10',
 ...overrides
}) as Bindings;

describe('Hector model runtime selection',()=>{
 it('normalizes unsupported runtime values to automatic',()=>{
  expect(normalizeHectorRuntime('hector-base')).toBe('hector-base');
  expect(normalizeHectorRuntime('invented')).toBe('auto');
 });

 it('recognizes explicit chat commands',()=>{
  expect(requestedHectorRuntime('/modelo base explica esto')).toBe('hector-base');
  expect(requestedHectorRuntime('/modelo qwen explica esto')).toBe('hector-qwen');
  expect(requestedHectorRuntime('/modelo propio explica esto')).toBe('hector-experimental');
  expect(requestedHectorRuntime('Habla con mi modelo: hola')).toBe('hector-experimental');
  expect(requestedHectorRuntime('hola')).toBe('auto');
 });

 it('removes only the model directive and preserves the user request',()=>{
  expect(stripHectorRuntimeDirective('/modelo propio: analiza el plan')).toBe('analiza el plan');
  expect(stripHectorRuntimeDirective('Usa Héctor Base: responde breve')).toBe('responde breve');
 });

 it('reports trained custom weights honestly when no endpoint exists',()=>{
  const catalog=hectorRuntimeCatalog(env());
  const custom=catalog.find(item=>item.id==='hector-experimental');
  expect(custom).toMatchObject({available:false,customWeights:true,status:'trained-offline',model:'hector-asi-qwen15-v10'});
  expect(custom?.reason).toContain('todavía no desplegados');
 });

 it('enables custom inference only with endpoint and token',()=>{
  const custom=hectorRuntimeCatalog(env({HECTOR_CUSTOM_MODEL_ENABLED:'true',HECTOR_CUSTOM_MODEL_BASE_URL:'https://example.test/v1',HECTOR_CUSTOM_MODEL_TOKEN:'secret'})).find(item=>item.id==='hector-experimental');
  expect(custom).toMatchObject({available:true,customWeights:true,status:'configured'});
 });
});
