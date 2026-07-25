import {describe,expect,it} from 'vitest';
import {buildSystemQualityReport,emptyQualityMetrics} from './system-quality';

describe('system quality contract',()=>{
 it('never claims 10/10 without live evidence and critical gates',()=>{
  const report=buildSystemQualityReport(emptyQualityMetrics());
  expect(report.tenOutOfTen).toBe(false);
  expect(report.score).toBeLessThan(100);
  expect(report.dimensions).toHaveLength(10);
  expect(report.criticalBlockers).toEqual(expect.arrayContaining([
   expect.stringContaining('Atribución viva exacta'),
   expect.stringContaining('Pesos propios habilitados'),
   expect.stringContaining('Clúster distribuido')
  ]));
 });

 it('uses measured production quality but keeps static missing evidence closed',()=>{
  const report=buildSystemQualityReport({
   responseSamples:200,averageQuality:95,acceptedRate:.96,fallbackRate:.02,
   workSamples:100,workSuccessRate:.98,memoryCount:150,correctionCount:20,
   budgetMode:'protect',recentCostUsd:2.5,liveExactModelAttested:true
  });
  expect(report.dimensions.find(item=>item.id==='reasoning-verification')?.score).toBe(10);
  expect(report.dimensions.find(item=>item.id==='reliability')?.score).toBe(10);
  expect(report.tenOutOfTen).toBe(false);
  expect(report.topPriorities).toEqual(expect.arrayContaining([expect.stringContaining('Pesos neuronales propios')]));
 });

 it('reports corpus progress from the canonical 3800-example state',()=>{
  const report=buildSystemQualityReport(emptyQualityMetrics());
  const training=report.dimensions.find(item=>item.id==='training-readiness');
  expect(training?.checks.find(item=>item.id==='corpus')?.evidence).toBe('3800/10000');
  expect(training?.score).toBeGreaterThan(3);
  expect(training?.score).toBeLessThan(4);
 });

 it('awards verified automated UX evidence while preserving the manual audit gap',()=>{
  const report=buildSystemQualityReport(emptyQualityMetrics());
  const ux=report.dimensions.find(item=>item.id==='ux-accessibility');
  expect(ux?.score).toBe(9);
  expect(ux?.checks.find(item=>item.id==='chat-first')?.passed).toBe(true);
  expect(ux?.checks.find(item=>item.id==='automated-accessibility')?.passed).toBe(true);
  expect(ux?.checks.find(item=>item.id==='manual-accessibility')?.passed).toBe(false);
  expect(ux?.gaps).toContain('Auditoría WCAG manual');
 });
});
