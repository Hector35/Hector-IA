import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {CHAT_CHAMPION} from './chat-champion';
import {hectorRuntimeCatalog,normalizeHectorRuntime,requestedHectorRuntime,stripHectorRuntimeDirective} from './custom-model-runtime';

const env=(overrides:Partial<Bindings>={})=>({
 CLOUDFLARE_AI_ENABLED:'true',
 AI:{} as Ai,
 HECTOR_QWEN_ENABLED:'true',
 HUGGINGFACE_TOKEN:'hf-test',
 HECTOR_QWEN_MODEL:'Qwen/Qwen3-4B-Instruct-2507',
 HECTOR_CUSTOM_MODEL_ENABLED:'false',
 ...overrides
}) as Bindings;

describe('Hector model runtime selection',()=>{
 it('normalizes unsupported runtime values to automatic',()=>{
  expect(normalizeHectorRuntime('hector-base')).toBe('hector-base');
  expect(normalizeHectorRuntime('invented')).toBe('auto');
 });

 it('recognizes explicit chat commands and versioned aliases',()=>{
  expect(requestedHectorRuntime('/modelo base explica esto')).toBe('hector-base');
  expect(requestedHectorRuntime('/modelo qwen explica esto')).toBe('hector-qwen');
  expect(requestedHectorRuntime('/modelo propio explica esto')).toBe('hector-experimental');
  expect(requestedHectorRuntime('/modelo qwen15-v21 explica esto')).toBe('hector-experimental');
  expect(requestedHectorRuntime('Habla con mi modelo: hola')).toBe('hector-experimental');
  expect(requestedHectorRuntime('hector-asi-qwen15-v21 resuelve esto')).toBe('hector-experimental');
  expect(requestedHectorRuntime('hola')).toBe('auto');
 });

 it('removes only the model directive and preserves the user request',()=>{
  expect(stripHectorRuntimeDirective('/modelo propio: analiza el plan')).toBe('analiza el plan');
  expect(stripHectorRuntimeDirective('/modelo qwen15-v21: analiza el plan')).toBe('analiza el plan');
  expect(stripHectorRuntimeDirective('Usa Héctor Base: responde breve')).toBe('responde breve');
 });

 it('keeps promoted custom weights available through the scheduled free queue without secrets',()=>{
  const custom=hectorRuntimeCatalog(env()).find(item=>item.id==='hector-experimental');
  expect(custom).toMatchObject({available:true,customWeights:true,status:'queued',model:CHAT_CHAMPION.runtimeId,label:CHAT_CHAMPION.label});
  expect(custom?.reason).toContain('cada cinco minutos');
 });

 it('uses immediate dispatch when an authorized GitHub runner token exists',()=>{
  const custom=hectorRuntimeCatalog(env({GITHUB_RUNNER_TOKEN:'github-token'})).find(item=>item.id==='hector-experimental');
  expect(custom).toMatchObject({available:true,customWeights:true,status:'queued',model:CHAT_CHAMPION.runtimeId});
  expect(custom?.reason).toContain('despacho inmediato');
 });

 it('prefers a dedicated endpoint when endpoint and token are configured',()=>{
  const custom=hectorRuntimeCatalog(env({GITHUB_RUNNER_TOKEN:'github-token',HECTOR_CUSTOM_MODEL_ENABLED:'true',HECTOR_CUSTOM_MODEL_BASE_URL:'https://example.test/v1',HECTOR_CUSTOM_MODEL_TOKEN:'secret'})).find(item=>item.id==='hector-experimental');
  expect(custom).toMatchObject({available:true,customWeights:true,status:'configured'});
 });
});
