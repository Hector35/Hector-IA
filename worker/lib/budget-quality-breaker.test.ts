import {describe,expect,it} from 'vitest';
import {evaluateBudgetQuality} from './budget-quality-breaker';

const now=Date.parse('2026-07-21T23:00:00.000Z');
const recent='2026-07-21T22:30:00.000Z';

describe('evaluateBudgetQuality',()=>{
 it('mantiene ahorro con pocas muestras',()=>{
  const policy=evaluateBudgetQuality([{qualityAccepted:false,createdAt:recent}],now);
  expect(policy.state).toBe('healthy');
  expect(policy.reason).toContain('muestras insuficientes');
 });
 it('suspende degradaciones cuando cae la aceptación',()=>{
  const policy=evaluateBudgetQuality(Array.from({length:6},(_,index)=>({qualityAccepted:index<3,createdAt:recent})),now);
  expect(policy.state).toBe('suspended');
  expect(policy.acceptanceRate).toBe(.5);
 });
 it('considera valoraciones negativas y correcciones',()=>{
  const policy=evaluateBudgetQuality([
   {qualityAccepted:true,feedbackRating:-1,correction:'Usa mi contexto',createdAt:recent},
   {qualityAccepted:true,feedbackRating:-1,createdAt:recent},
   {qualityAccepted:true,correction:'Más técnico',createdAt:recent},
   {qualityAccepted:true,createdAt:recent},
   {qualityAccepted:true,createdAt:recent}
  ],now);
  expect(policy.state).toBe('suspended');
  expect(policy.negativeRate).toBe(.6);
  expect(policy.correctionRate).toBe(.4);
 });
 it('permite una prueba controlada después del enfriamiento',()=>{
  const old='2026-07-20T20:00:00.000Z';
  const policy=evaluateBudgetQuality(Array.from({length:5},()=>({qualityAccepted:false,createdAt:old})),now);
  expect(policy.state).toBe('probe');
  expect(policy.reason).toContain('prueba controlada');
 });
 it('mantiene degradaciones cuando la calidad es suficiente',()=>{
  const policy=evaluateBudgetQuality(Array.from({length:8},(_,index)=>({qualityAccepted:index<7,createdAt:recent})),now);
  expect(policy.state).toBe('healthy');
  expect(policy.acceptanceRate).toBe(.875);
 });
});
