import {describe,expect,it} from 'vitest';
import {calculateQualityProtectionImpact,summarizeQualityImpactWindow,type QualityImpactSample} from './quality-protection-impact';

function sample(overrides:Partial<QualityImpactSample>={}):QualityImpactSample{return{createdAt:'2026-07-21T00:00:00Z',estimatedCostUsd:.01,qualityScore:80,qualityAccepted:true,rating:null,corrected:false,routeTier:'balanced',model:'gpt-5.6-terra',...overrides};}

describe('quality protection impact',()=>{
 it('resume costo, calidad, feedback y profundidad',()=>{
  const summary=summarizeQualityImpactWindow([
   sample(),
   sample({estimatedCostUsd:.03,qualityScore:60,qualityAccepted:false,rating:-1,corrected:true,routeTier:'deep',model:'gpt-5.6-sol'})
  ]);
  expect(summary).toMatchObject({sampleCount:2,acceptedCount:1,rejectedCount:1,negativeRatings:1,corrections:1,totalCostUsd:.04,averageCostUsd:.02,acceptanceRate:.5,averageQualityScore:70,deepShare:.5});
 });

 it('calcula costo adicional, recuperación y errores evitados',()=>{
  const before=[...Array(10)].map((_,index)=>sample({qualityAccepted:index<6,qualityScore:index<6?78:45,estimatedCostUsd:.01}));
  const protectedSamples=[...Array(10)].map((_,index)=>sample({qualityAccepted:index<9,qualityScore:index<9?90:60,estimatedCostUsd:.025,routeTier:'deep',model:'gpt-5.6-sol'}));
  const impact=calculateQualityProtectionImpact({before,protected:protectedSamples,firstSeenAt:'2026-07-21T00:00:00Z',resolvedAt:'2026-07-21T12:00:00Z'});
  expect(impact.costDeltaUsd).toBeCloseTo(.15,6);
  expect(impact.costDeltaPerResponseUsd).toBeCloseTo(.015,6);
  expect(impact.acceptanceRateDelta).toBe(.3);
  expect(impact.estimatedErrorsAvoided).toBe(3);
  expect(impact.recoveryObserved).toBe(true);
  expect(impact.recoveryHours).toBe(12);
  expect(impact.confidence).toBe('medium');
 });

 it('no inventa diferencias con muestras insuficientes',()=>{
  const impact=calculateQualityProtectionImpact({before:[sample()],protected:[sample({estimatedCostUsd:.02})],firstSeenAt:'2026-07-21T00:00:00Z'});
  expect(impact.confidence).toBe('insufficient');
  expect(impact.acceptanceRateDelta).toBeNull();
  expect(impact.costDeltaPerResponseUsd).toBeNull();
  expect(impact.estimatedErrorsAvoided).toBeNull();
  expect(impact.recoveryObserved).toBe(false);
 });
});
