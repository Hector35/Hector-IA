import {describe,expect,it} from 'vitest';
import {buildSelfModel,type SelfModelRuntime} from './self-model';
const runtime:SelfModelRuntime={memories:12,workJobs:{total:8,completed:6,blocked:1},scheduledTasks:{total:3,active:2},responseTraces:19,activeSystemContexts:5,latestEvaluation:{score:92,grade:'A'}};
describe('Héctor OS self model',()=>{
 it('distingue identidad, arquitectura, modelos y estado real',()=>{const model=buildSelfModel({fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol',critic:'gpt-5.6-sol'},runtime);expect(model.identity.name).toBe('Héctor OS');expect(model.models).toMatchObject({fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol',critic:'gpt-5.6-sol'});expect(model.runtime).toEqual(runtime);expect(model.architecture).toEqual(expect.arrayContaining(['D1','R2','OpenAI Responses API','GitHub Actions','deliberación multiagente']));});
 it('vincula capacidades con componentes, evidencia y límite',()=>{const model=buildSelfModel({fast:'luna',balanced:'terra',reasoning:'sol',critic:'sol'},runtime);for(const item of model.capabilities){expect(item.components.length).toBeGreaterThan(0);expect(item.evidence.length).toBeGreaterThan(10);expect(item.limit.length).toBeGreaterThan(10);}});
 it('no expone secretos ni memorias personales sensibles',()=>{const text=JSON.stringify(buildSelfModel({fast:'luna',balanced:'terra',reasoning:'sol',critic:'sol'},runtime));expect(text).not.toMatch(/OPENAI_API_KEY|GITHUB_RUNNER_TOKEN|REMOTE_CONTROL_TOKEN|BBVA|metanfetamina|lesión del dedo/i);});
});
