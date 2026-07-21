import {describe,expect,it} from 'vitest';
import {aggregateBudgetSavings} from './budget-savings';

describe('aggregateBudgetSavings',()=>{
 it('calcula ahorro contra el modelo original de una degradación',()=>{
  const result=aggregateBudgetSavings([{model:'gpt-5.6-luna',input_units:1000,cached_input_units:0,output_units:500,estimated_cost_usd:.0005,metadata_json:JSON.stringify({service:'chat',budgetDecision:{action:'degrade',projection:{model:'gpt-5.6-sol'}},qualityScore:92,qualityAccepted:true})}]);
  expect(result.degradedRequests).toBe(1);
  expect(result.savedUsd).toBeGreaterThan(0);
  expect(result.counterfactualCostUsd).toBeGreaterThan(result.actualCostUsd);
  expect(result.averageQuality).toBe(92);
  expect(result.acceptanceRate).toBe(100);
 });
 it('no inventa ahorro cuando no existe degradación o la tarifa es desconocida',()=>{
  const result=aggregateBudgetSavings([{model:'custom',input_units:100,output_units:20,estimated_cost_usd:.02,metadata_json:'{}'},{model:'custom',input_units:100,output_units:20,estimated_cost_usd:.03,metadata_json:JSON.stringify({budgetDecision:{action:'degrade',projection:{model:'desconocido'}}})}]);
  expect(result.savedUsd).toBe(0);
  expect(result.counterfactualCostUsd).toBeCloseTo(.05);
  expect(result.degradedRequests).toBe(0);
 });
 it('tolera metadata corrupta y agrupa por servicio',()=>{
  const result=aggregateBudgetSavings([{estimated_cost_usd:.01,metadata_json:'{rota'},{estimated_cost_usd:.02,metadata_json:JSON.stringify({service:'scheduled-work',qualityScore:70,qualityAccepted:false})}]);
  expect(result.actualCostUsd).toBeCloseTo(.03);
  expect(result.byService.general.requests).toBe(1);
  expect(result.byService['scheduled-work'].requests).toBe(1);
  expect(result.acceptanceRate).toBe(0);
 });
});
