import {describe,expect,it} from 'vitest';
import {buildSelfModel,type SelfModelRuntime} from './self-model';

const runtime:SelfModelRuntime={memories:12,workJobs:{total:8,completed:6,blocked:1},scheduledTasks:{total:3,active:2},responseTraces:19,activeSystemContexts:5,latestEvaluation:{score:92,grade:'A'}};

describe('Héctor OS self model',()=>{
 it('distingue identidad, arquitectura, modelos y estado real',()=>{
  const model=buildSelfModel({fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol'},runtime);
  expect(model.identity.name).toBe('Héctor OS');
  expect(model.models).toMatchObject({fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol'});
  expect(model.runtime).toEqual(runtime);
  expect(model.architecture).toEqual(expect.arrayContaining(['D1','R2','OpenAI Responses API','GitHub Actions']));
 });

 it('vincula cada capacidad con componentes, evidencia y límite',()=>{
  const model=buildSelfModel({fast:'luna',balanced:'terra',reasoning:'sol'},runtime);
  expect(model.capabilities.length).toBeGreaterThanOrEqual(8);
  for(const capability of model.capabilities){
   expect(capability.components.length).toBeGreaterThan(0);
   expect(capability.evidence.length).toBeGreaterThan(10);
   expect(capability.limit.length).toBeGreaterThan(10);
  }
 });

 it('no expone secretos ni memorias personales sensibles',()=>{
  const serialized=JSON.stringify(buildSelfModel({fast:'luna',balanced:'terra',reasoning:'sol'},runtime));
  expect(serialized).not.toMatch(/OPENAI_API_KEY|GITHUB_RUNNER_TOKEN|REMOTE_CONTROL_TOKEN|BBVA|metanfetamina|lesión del dedo/i);
 });
});
