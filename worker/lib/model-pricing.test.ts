import {describe,expect,it} from 'vitest';
import {estimateModelCost,pricingForModel} from './model-pricing';

describe('pricingForModel',()=>{
 it('reconoce las tres capas GPT-5.6 y snapshots',()=>{
  expect(pricingForModel('gpt-5.6-sol').outputPerMTok).toBe(30);
  expect(pricingForModel('gpt-5.6-terra-2026-07-21').inputPerMTok).toBe(2.5);
  expect(pricingForModel('gpt-5.6-luna').cachedInputPerMTok).toBe(.1);
  expect(pricingForModel('gpt-5.6').family).toBe('gpt-5.6-sol');
 });
 it('reconoce Qwen 397B servido por la política cheapest',()=>{
  const pricing=pricingForModel('Qwen/Qwen3.5-397B-A17B:cheapest');
  expect(pricing).toMatchObject({family:'qwen3.5-397b-a17b:cheapest',inputPerMTok:.45,outputPerMTok:3,known:true});
  expect(pricing.source).toBe('huggingface-inference-providers-2026-07-25');
 });
 it('marca modelos desconocidos sin inventar que la tarifa es oficial',()=>{
  const pricing=pricingForModel('modelo-desconocido');
  expect(pricing.known).toBe(false);
  expect(pricing.source).toBe('legacy-fallback');
 });
});

describe('estimateModelCost',()=>{
 it('calcula Terra con lectura, escritura de caché y contexto largo',()=>{
  const result=estimateModelCost({input_tokens:1_000_000,output_tokens:100_000,input_tokens_details:{cached_tokens:200_000,cache_write_tokens:100_000}},'gpt-5.6-terra');
  expect(result.input).toBe(1_000_000);
  expect(result.cached).toBe(200_000);
  expect(result.cacheWrite).toBe(100_000);
  expect(result.longContext).toBe(true);
  expect(result.costUsd).toBeCloseTo(6.475,6);
  expect(result.pricingKnown).toBe(true);
 });
 it('calcula Qwen 397B sin inventar recargos no publicados',()=>{
  const result=estimateModelCost({input_tokens:1_000_000,output_tokens:100_000},'Qwen/Qwen3.5-397B-A17B');
  expect(result.longContext).toBe(true);
  expect(result.costUsd).toBeCloseTo(.75,6);
  expect(result.pricingKnown).toBe(true);
 });
 it('aplica recargo de contexto largo a entrada y salida',()=>{
  const result=estimateModelCost({input_tokens:300_000,output_tokens:20_000},'gpt-5.6-luna');
  expect(result.longContext).toBe(true);
  expect(result.costUsd).toBeCloseTo(.78,6);
 });
 it('no permite que los subconjuntos de caché excedan la entrada total',()=>{
  const result=estimateModelCost({input_tokens:100,output_tokens:0,input_tokens_details:{cached_tokens:500,cache_write_tokens:500}},'gpt-5.6-sol');
  expect(result.cached).toBe(100);
  expect(result.cacheWrite).toBe(0);
  expect(result.costUsd).toBeCloseTo(.00005,8);
 });
});
