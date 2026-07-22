import {describe,expect,it} from 'vitest';
import {evaluateBudgetQuality,sortBudgetQualityCategories,type BudgetQualityCategory} from './budget-quality-breaker';

const now=Date.parse('2026-07-21T23:00:00.000Z');
const recent='2026-07-21T22:30:00.000Z';

describe('evaluateBudgetQuality',()=>{
 it('mantiene ahorro con pocas muestras',()=>{
  const policy=evaluateBudgetQuality([{qualityAccepted:false,createdAt:recent}],now);
  expect(policy.state).toBe('healthy');
  expect(policy.reason).toContain('muestras insuficientes');
  expect(policy.triggeredBy).toEqual([]);
  expect(policy.nextProbeAt).toBeNull();
 });
 it('suspende degradaciones cuando cae la aceptación y calcula recuperación',()=>{
  const policy=evaluateBudgetQuality(Array.from({length:6},(_,index)=>({qualityAccepted:index<3,createdAt:recent})),now);
  expect(policy.state).toBe('suspended');
  expect(policy.acceptanceRate).toBe(.5);
  expect(policy.triggeredBy).toContain('acceptance');
  expect(policy.nextProbeAt).toBe('2026-07-22T22:30:00.000Z');
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
  expect(policy.triggeredBy).toEqual(['negative','correction']);
 });
 it('permite una prueba controlada después del enfriamiento',()=>{
  const old='2026-07-20T20:00:00.000Z';
  const policy=evaluateBudgetQuality(Array.from({length:5},()=>({qualityAccepted:false,createdAt:old})),now);
  expect(policy.state).toBe('probe');
  expect(policy.reason).toContain('prueba controlada');
  expect(policy.nextProbeAt).toBeNull();
 });
 it('mantiene degradaciones cuando la calidad es suficiente',()=>{
  const policy=evaluateBudgetQuality(Array.from({length:8},(_,index)=>({qualityAccepted:index<7,createdAt:recent})),now);
  expect(policy.state).toBe('healthy');
  expect(policy.acceptanceRate).toBe(.875);
  expect(policy.triggeredBy).toEqual([]);
 });
});

describe('sortBudgetQualityCategories',()=>{
 const item=(task:string,state:BudgetQualityCategory['state'],sampleCount:number):BudgetQualityCategory=>({task,state,sampleCount,acceptedCount:0,negativeCount:0,correctionCount:0,acceptanceRate:null,negativeRate:null,correctionRate:null,lastDegradedAt:null,nextProbeAt:null,triggeredBy:[],reason:''});
 it('muestra primero suspensiones, después pruebas y luego estados sanos',()=>{
  expect(sortBudgetQualityCategories([item('general','healthy',20),item('salud','suspended',5),item('software','probe',8),item('finanzas','suspended',9)]).map(x=>x.task)).toEqual(['finanzas','salud','software','general']);
 });
});
