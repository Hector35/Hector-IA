import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {QWEN_397_OPERATIONAL,hasQwen397Endpoint,qwen397Status} from './qwen397-runtime';

function env(values:Partial<Bindings>={}):Bindings{
 return values as Bindings;
}

describe('Qwen 397B Stage 6 runtime',()=>{
 it('uses the official open multimodal MoE checkpoint',()=>{
  expect(QWEN_397_OPERATIONAL.repository).toBe('Qwen/Qwen3.5-397B-A17B');
  expect(QWEN_397_OPERATIONAL.totalParameters).toBe('397B');
  expect(QWEN_397_OPERATIONAL.activeParameters).toBe('17B');
  expect(QWEN_397_OPERATIONAL.contextLength).toBe(262144);
  expect(QWEN_397_OPERATIONAL.multimodal).toBe(true);
  expect(QWEN_397_OPERATIONAL.thinking).toBe(true);
  expect(QWEN_397_OPERATIONAL.trainable).toBe(true);
  expect(QWEN_397_OPERATIONAL.license).toBe('Apache-2.0');
 });

 it('does not claim the model is active without an endpoint and token',()=>{
  const status=qwen397Status(env({QWEN_397B_ENABLED:'true'}));
  expect(status.endpointConfigured).toBe(false);
  expect(status.mode).toBe('pending-endpoint');
 });

 it('activates only when endpoint and token are both configured',()=>{
  const configured=env({QWEN_397B_ENABLED:'true',QWEN_397B_BASE_URL:'https://example.invalid/v1',QWEN_397B_TOKEN:'test-token'});
  expect(hasQwen397Endpoint(configured)).toBe(true);
  expect(qwen397Status(configured).mode).toBe('endpoint');
  expect(hasQwen397Endpoint(env({QWEN_397B_BASE_URL:'https://example.invalid/v1'}))).toBe(false);
 });
});
