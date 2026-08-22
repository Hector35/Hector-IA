import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('Héctor Agent code runner safety contract',()=>{
 const route=readFileSync('worker/routes/runner.ts','utf8');
 const workflow=readFileSync('.github/workflows/agent-code-runner.yml','utf8');

 it('cancela ejecuciones viejas del mismo objetivo',()=>{
  expect(workflow).toContain('cancel-in-progress: true');
  expect(workflow).toContain('group: hector-agent-${{ inputs.job_id }}');
 });

 it('hace cumplir pausa y límites antes de seguir',()=>{
  expect(route).toContain('enforceRunnerControl');
  expect(route).toContain("control.isHectorAgent&&control.status!=='blocked'");
  expect(route).toContain('blockRunnerHectorGoal(env,jobId,control.reason)');
 });

 it('contabiliza costo real del modelo y ciclos del runner',()=>{
  expect(route).toContain('estimateModelCost(data?.usage,model).costUsd');
  expect(route).toContain('attempt_count=attempt_count+1');
  expect(route).toContain('recordHectorAgentCycle');
 });

 it('vuelve a comprobar autoridad antes de publicar cambios',()=>{
  expect(route).toContain("runner.post('/publish'");
  expect(route.match(/enforceRunnerControl\(c\.env,p\.data\.jobId\)/g)?.length||0).toBeGreaterThanOrEqual(3);
 });
});
