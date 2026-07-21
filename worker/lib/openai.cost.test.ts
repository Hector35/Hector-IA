import {describe,expect,it} from 'vitest';
import {estimateCost} from './openai';

const usage={input_tokens:1_000_000,output_tokens:1_000_000,input_tokens_details:{cached_tokens:100_000}};

describe('GPT-5.6 cost estimation',()=>{
 it('distingue precios de Sol, Terra y Luna',()=>{
  const sol=estimateCost(usage,'gpt-5.6-sol').costUsd;
  const terra=estimateCost(usage,'gpt-5.6-terra').costUsd;
  const luna=estimateCost(usage,'gpt-5.6-luna').costUsd;
  expect(sol).toBeCloseTo(35.05,5);
  expect(terra).toBeCloseTo(17.275,5);
  expect(luna).toBeCloseTo(6.91,5);
  expect(sol).toBeGreaterThan(terra);
  expect(terra).toBeGreaterThan(luna);
 });

 it('usa Terra como valor conservador por defecto',()=>{
  expect(estimateCost(usage).costUsd).toBeCloseTo(17.275,5);
 });
});
