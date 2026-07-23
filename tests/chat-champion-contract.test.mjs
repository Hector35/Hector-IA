import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=path=>readFileSync(path,'utf8');
const manifest=JSON.parse(read('model/hector-asi/registry/chat-champion.json'));
const worker=read('worker/routes/model-chat.ts');
const runtime=read('worker/lib/custom-model-runtime.ts');
const chatWorkflow=read('.github/workflows/hector-custom-model-chat.yml');
const smokeWorkflow=read('.github/workflows/hector-custom-model-smoke.yml');
const actionRunner=read('model/hector-asi/inference/run_action_chat.py');
const smokeRunner=read('model/hector-asi/inference/smoke_custom_model.py');

describe('chat champion integration contract',()=>{
 it('has one promoted immutable source of truth',()=>{
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.promotionState).toBe('active');
  expect(manifest.runtimeId).toMatch(/^hector-asi-qwen15-v\d+$/);
  expect(manifest.adapterSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.adapterBytes).toBeGreaterThan(30_000_000);
 });

 it('makes every inference surface consume the same manifest',()=>{
  for(const source of [worker,runtime])expect(source).toContain('CHAT_CHAMPION');
  for(const source of [chatWorkflow,smokeWorkflow,actionRunner,smokeRunner])expect(source).toContain('chat-champion.json');
 });

 it('does not pin a historical Qwen15 version outside the manifest',()=>{
  for(const source of [worker,runtime,chatWorkflow,smokeWorkflow,actionRunner,smokeRunner]){
   expect(source).not.toMatch(/hector-asi-qwen15-v\d+/);
  }
 });

 it('verifies artifact identity beyond the model name',()=>{
  for(const field of ['artifactId','adapterSha256','adapterBytes','sourceRunId']){
   expect(worker).toContain(field);
   expect(actionRunner).toContain(field);
  }
 });
});
