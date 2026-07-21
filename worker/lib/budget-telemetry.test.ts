import {describe,expect,it} from 'vitest';
import {normalizeBudgetTelemetry} from './budget-telemetry';

describe('normalizeBudgetTelemetry',()=>{
 it('conserva una decisión presupuestaria serializable',()=>{
  const decision={status:'exceeded',action:'degrade',reason:'límite diario',originalModel:'gpt-5.6-sol',projection:{estimatedCostUsd:.04}};
  expect(normalizeBudgetTelemetry(decision)).toEqual(decision);
 });
 it('descarta valores ausentes o no estructurados',()=>{
  expect(normalizeBudgetTelemetry(null)).toBeNull();
  expect(normalizeBudgetTelemetry('degrade')).toBeNull();
  expect(normalizeBudgetTelemetry([])).toBeNull();
 });
 it('descarta estructuras no serializables sin romper el chat',()=>{
  const cyclic:any={action:'allow'};cyclic.self=cyclic;
  expect(normalizeBudgetTelemetry(cyclic)).toBeNull();
 });
});
