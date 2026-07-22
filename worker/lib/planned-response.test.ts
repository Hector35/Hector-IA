import {describe,expect,it} from 'vitest';
import {createExecutionPlan} from './execution-plan';
import {estimatePlannedCost} from './planned-response';

describe('planned response authority',()=>{
 it('mantiene el plan inmutable aunque el runtime proteja el chat con Héctor Base',async()=>{
  const plan=await createExecutionPlan({task:'ingeniería de software',route:{model:'gpt-deep',tier:'deep',reasoning:'high',needsWeb:false},provider:{requested:'openai',reason:'plan legado'},cognition:{mode:'ensemble',passes:3,reason:'doble resolución'},allowedModels:['gpt-deep','gpt-critic'],policySummary:'Ruta final deep.'});
  expect(plan.route).toEqual({model:'gpt-deep',tier:'deep',reasoning:'high',needsWeb:false});
  expect(plan.provider.requested).toBe('openai');
  expect(plan.cognition).toMatchObject({mode:'ensemble',passes:3});
  expect(Object.isFrozen(plan)).toBe(true);
 });
 it('conserva el cálculo de costo con metadata del modelo ejecutado',()=>{
  const cost=estimatePlannedCost({input_tokens:1000,output_tokens:500},'@cf/meta/llama-3.2-3b-instruct');
  expect(cost.input).toBe(1000);
  expect(cost.output).toBe(500);
  expect(cost.costUsd).toBeGreaterThanOrEqual(0);
 });
});
