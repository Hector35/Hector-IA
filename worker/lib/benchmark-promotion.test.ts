import {describe,expect,it} from 'vitest';
import {applyBudgetQualityProtection,applyDriftContainmentProtection,summarizeBenchmarkPolicy,type BenchmarkAggregateRow} from './benchmark-promotion';
import type {BudgetQualityPolicy} from './budget-quality-breaker';
import type {DriftContainmentGroup} from './plan-drift-containment';
const row=(winner:'baseline'|'adaptive'|'tie',baseline=10,adaptive=14,baselineCost=.01,adaptiveCost=.03):BenchmarkAggregateRow=>({winner,baseline_score:baseline,adaptive_score:adaptive,baseline_cost_usd:baselineCost,adaptive_cost_usd:adaptiveCost});
const quality=(state:BudgetQualityPolicy['state']):BudgetQualityPolicy=>({state,sampleCount:6,acceptedCount:3,negativeCount:3,correctionCount:1,acceptanceRate:.5,negativeRate:.5,correctionRate:1/6,lastDegradedAt:'2026-07-21T22:00:00.000Z',nextProbeAt:state==='suspended'?'2026-07-22T22:00:00.000Z':null,triggeredBy:['acceptance','negative'],reason:'calidad fuera de umbral'});
const containment=(status:DriftContainmentGroup['status'],cause:DriftContainmentGroup['cause']='router'):DriftContainmentGroup=>({cause,status,incidents:3,active:2,recovered:0,retryFailed:1,firstSeenAt:'2026-07-21T20:00:00.000Z',lastSeenAt:'2026-07-21T22:00:00.000Z',nextProbeAt:status==='contained'?'2026-07-22T04:00:00.000Z':status==='probe-ready'?'2026-07-22T04:00:00.000Z':null,reason:'señal de prueba'});

describe('summarizeBenchmarkPolicy',()=>{
 it('permanece observando con muestras insuficientes',()=>{const policy=summarizeBenchmarkPolicy([row('adaptive'),row('adaptive')]);expect(policy.status).toBe('observing');expect(policy.strategy).toBe('baseline');});
 it('promueve adaptive con ventaja repetida y costo acotado',()=>{const policy=summarizeBenchmarkPolicy([row('adaptive'),row('adaptive'),row('adaptive'),row('tie'),row('baseline',10,12)]);expect(policy.status).toBe('promoted');expect(policy.strategy).toBe('adaptive');expect(policy.averageCostMultiplier).toBeLessThanOrEqual(4);});
 it('no promueve si el costo excede el límite',()=>{const policy=summarizeBenchmarkPolicy(Array.from({length:6},()=>row('adaptive',10,16,.01,.08)));expect(policy.status).toBe('observing');expect(policy.strategy).toBe('baseline');});
 it('no promueve una ventaja de puntaje marginal',()=>{const policy=summarizeBenchmarkPolicy(Array.from({length:6},()=>row('adaptive',10,11)));expect(policy.status).toBe('observing');});
 it('revierte una promoción cuando las tres muestras recientes favorecen baseline',()=>{const rows=[row('baseline',15,10),row('baseline',14,10),row('tie',12,12),row('adaptive'),row('adaptive'),row('adaptive')];const policy=summarizeBenchmarkPolicy(rows,{strategy:'adaptive',status:'promoted'});expect(policy.status).toBe('rolled_back');expect(policy.strategy).toBe('baseline');});
});

describe('applyBudgetQualityProtection',()=>{
 const base=summarizeBenchmarkPolicy([]);
 it('fuerza inteligencia protegida cuando el ahorro pierde calidad',()=>{const policy=applyBudgetQualityProtection(base,quality('suspended'));expect(policy.strategy).toBe('adaptive');expect(policy.status).toBe('promoted');expect(policy.reason).toContain('protección temporal');});
 it('permite una prueba controlada sin forzar la ruta alta',()=>{const policy=applyBudgetQualityProtection(base,quality('probe'));expect(policy.strategy).toBe('baseline');expect(policy.budgetQuality?.state).toBe('probe');});
 it('respeta gobierno humano congelado o excluido',()=>{expect(applyBudgetQualityProtection(base,quality('suspended'),'excluded').strategy).toBe('baseline');expect(applyBudgetQualityProtection(base,quality('suspended'),'frozen').strategy).toBe('baseline');});
});

describe('applyDriftContainmentProtection',()=>{
 const base=summarizeBenchmarkPolicy([]);
 it('fuerza la ruta adaptativa mientras una causa está contenida',()=>{const policy=applyDriftContainmentProtection(base,[containment('contained','provider')]);expect(policy.strategy).toBe('adaptive');expect(policy.status).toBe('promoted');expect(policy.reason).toContain('contención cognitiva automática');expect(policy.reason).toContain('provider');});
 it('abre una prueba controlada al terminar el enfriamiento',()=>{const policy=applyDriftContainmentProtection({...base,strategy:'adaptive',status:'promoted'},[containment('probe-ready','router')]);expect(policy.strategy).toBe('baseline');expect(policy.status).toBe('containment_probe');expect(policy.reason).toContain('prueba controlada automática');});
 it('reactiva protección cuando existe cualquier causa todavía contenida',()=>{const policy=applyDriftContainmentProtection(base,[containment('probe-ready','router'),containment('contained','cognition')]);expect(policy.strategy).toBe('adaptive');expect(policy.reason).toContain('cognition');});
 it('aplaza la prueba si la protección de calidad presupuestaria sigue activa',()=>{const protectedPolicy=applyBudgetQualityProtection(base,quality('suspended'));const policy=applyDriftContainmentProtection(protectedPolicy,[containment('probe-ready')]);expect(policy.strategy).toBe('adaptive');expect(policy.status).toBe('promoted');expect(policy.reason).toContain('se aplaza');});
 it('respeta gobierno humano congelado o excluido',()=>{expect(applyDriftContainmentProtection(base,[containment('contained')],'frozen').strategy).toBe('baseline');expect(applyDriftContainmentProtection(base,[containment('contained')],'excluded').strategy).toBe('baseline');});
});
