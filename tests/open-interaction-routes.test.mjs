import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const index=readFileSync('worker/index.ts','utf8');
const route=readFileSync('worker/routes/open-interaction.ts','utf8');

describe('open interaction routes',()=>{
 it('mounts the guard before the legacy API',()=>{
  expect(index.indexOf("app.route('/api',openInteraction)")).toBeGreaterThan(0);
  expect(index.indexOf("app.route('/api',openInteraction)")).toBeLessThan(index.indexOf("app.route('/api',api)"));
 });
 it('retires the legacy text chat endpoint',()=>{
  expect(route).toContain("openInteraction.post('/chat'");
  expect(route).toContain("replacement:'/api/intelligence/chat'");
  expect(route).toContain('410');
 });
 it('uses an open vision model and no OpenAI transport',()=>{
  expect(route).toContain('@cf/llava-hf/llava-1.5-7b-hf');
  expect(route).toContain("provider:'cloudflare'");
  expect(route).toContain('openAIUsed:false');
  expect(route).not.toContain('api.openai.com');
  expect(route).not.toContain('inspectImage');
 });
});
