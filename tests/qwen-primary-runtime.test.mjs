import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const wrangler=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const runtime=JSON.parse(readFileSync('model/hector-asi/runtime-registry.json','utf8'));
const planned=readFileSync('worker/lib/planned-response.ts','utf8');

describe('Qwen3 primary chat runtime',()=>{
 it('deploys Qwen3 30B through the existing Workers AI binding',()=>{
  expect(wrangler.vars.CLOUDFLARE_MODEL_FAST).toBe('@cf/qwen/qwen3-30b-a3b-fp8');
  expect(wrangler.ai.binding).toBe('AI');
  expect(runtime.operationalBase.models.primaryConversation).toBe('@cf/qwen/qwen3-30b-a3b-fp8');
 });
 it('keeps the custom 4B candidate separate',()=>{
  expect(runtime.customCandidate.id).toBe('hector-asi-v0.1-qwen3-4b-sft');
  expect(runtime.customCandidate.customWeightsAvailable).toBe(false);
  expect(runtime.champion).toBe(null);
 });
 it('never uses OpenAI as the Qwen fallback',()=>{
  expect(runtime.operationalBase.routing.failurePolicy).toMatch(/never fallback to OpenAI/);
  expect(planned).not.toContain('api.openai.com');
 });
});
