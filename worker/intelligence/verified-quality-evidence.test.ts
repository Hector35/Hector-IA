import {describe,expect,it} from 'vitest';
import {buildSystemQualityReport,emptyQualityMetrics} from './system-quality';
import {applyVerifiedQualityEvidence} from './verified-quality-evidence';

describe('verified quality evidence refresh',()=>{
 it('credits action previews while retaining the missing revocation and execution receipt gap',()=>{
  const report=applyVerifiedQualityEvidence(buildSystemQualityReport(emptyQualityMetrics()));
  const tools=report.dimensions.find(item=>item.id==='tools-agency');
  expect(tools?.checks.find(item=>item.id==='write-preview')).toMatchObject({passed:true,points:1});
  expect(tools?.checks.find(item=>item.id==='consent-receipt')).toMatchObject({passed:false,points:1});
  expect(tools?.score).toBe(9);
  expect(report.criticalBlockers).toContain('Herramientas y agencia segura: Consentimiento revocable y recibo de acción');
 });

 it('credits the sealed private-data-free memory benchmark',()=>{
  const report=applyVerifiedQualityEvidence(buildSystemQualityReport(emptyQualityMetrics()));
  const memory=report.dimensions.find(item=>item.id==='memory-learning');
  const benchmark=memory?.checks.find(item=>item.id==='retrieval-benchmark');
  expect(benchmark?.passed).toBe(true);
  expect(benchmark?.evidence).toContain('recall@3=1.0000');
  expect(benchmark?.evidence).toContain('precision@3=0.3623');
  expect(benchmark?.evidence).toContain('MRR=1.0000');
  expect(memory?.score).toBe(5);
 });

 it('credits the mounted chat and automated accessibility but not manual WCAG review',()=>{
  const report=applyVerifiedQualityEvidence(buildSystemQualityReport(emptyQualityMetrics()));
  const ux=report.dimensions.find(item=>item.id==='ux-accessibility');
  expect(ux?.checks.find(item=>item.id==='chat-first')?.passed).toBe(true);
  expect(ux?.checks.find(item=>item.id==='automated-accessibility')?.passed).toBe(true);
  expect(ux?.checks.find(item=>item.id==='manual-accessibility')?.passed).toBe(false);
  expect(ux?.score).toBe(9);
  expect(ux?.gaps).toEqual(['Auditoría WCAG manual independiente']);
 });

 it('uses the active API security boundary as evidence without claiming external review',()=>{
  const report=applyVerifiedQualityEvidence(buildSystemQualityReport(emptyQualityMetrics()));
  const security=report.dimensions.find(item=>item.id==='security-privacy');
  expect(security?.checks.find(item=>item.id==='secure-headers')?.evidence).toContain('cross-origin=deny');
  expect(security?.checks.find(item=>item.id==='external-review')?.passed).toBe(false);
  expect(report.tenOutOfTen).toBe(false);
  expect(report.score).toBeLessThan(100);
 });
});
