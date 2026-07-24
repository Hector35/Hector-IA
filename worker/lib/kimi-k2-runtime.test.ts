import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {KIMI_K2_5_OPERATIONAL,KIMI_K2_BASE_TRAINING,hasKimiEndpoint,kimiStatus} from './kimi-k2-runtime';

function env(values:Partial<Bindings>={}):Bindings{
 return values as Bindings;
}

describe('Kimi Stage 6 model roles',()=>{
 it('keeps Kimi K2.5 operational and Kimi K2 Base trainable',()=>{
  expect(KIMI_K2_5_OPERATIONAL.repository).toBe('moonshotai/Kimi-K2.5');
  expect(KIMI_K2_5_OPERATIONAL.contextLength).toBe(262144);
  expect(KIMI_K2_5_OPERATIONAL.multimodal).toBe(true);
  expect(KIMI_K2_BASE_TRAINING.repository).toBe('moonshotai/Kimi-K2-Base');
  expect(KIMI_K2_BASE_TRAINING.role).toBe('trainable-foundation');
 });

 it('reports a pending endpoint without claiming Kimi is active',()=>{
  const status=kimiStatus(env({KIMI_K2_ENABLED:'true',KIMI_K2_MODEL:'moonshotai/Kimi-K2.5'}));
  expect(status.endpointConfigured).toBe(false);
  expect(status.mode).toBe('pending-endpoint');
  expect(status.trainingTarget.repository).toBe('moonshotai/Kimi-K2-Base');
 });

 it('activates only when endpoint and token are both configured',()=>{
  const configured=env({KIMI_K2_ENABLED:'true',KIMI_K2_BASE_URL:'https://example.invalid/v1',KIMI_K2_TOKEN:'test-token'});
  expect(hasKimiEndpoint(configured)).toBe(true);
  expect(kimiStatus(configured).mode).toBe('endpoint');
  expect(hasKimiEndpoint(env({KIMI_K2_BASE_URL:'https://example.invalid/v1'}))).toBe(false);
 });
});
