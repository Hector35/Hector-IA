import {describe,expect,it} from 'vitest';
import {applyBudgetQualityProtection,applyDriftContainmentProtection,evaluateContainmentProbe,summarizeBenchmarkPolicy,type BenchmarkAggregateRow} from './benchmark-promotion';
import type {BudgetQualityPolicy} from './budget-quality-breaker';
import type {DriftContainmentGroup} from './plan-drift-containment';
const row=(winner:'baseline'|'adaptive'|'tie',baseline=10,adaptive=14,baselineCost=.01,adaptiveCost=.03,created_at='2026-07-22T05:00:00.000Z'):BenchmarkAggregateRow=>({winner,baseline_score:baseline,adaptive_score:adaptive,baseline_cost_usd:baselineCost,adaptive_cost_usd:adaptiveCost,created_at});
const quality=(state:BudgetQualityPolicy['state']):BudgetQualityPolicy=>({state,sampleCount:6,acceptedCount:3,negativeCount:3,correctionCount:1,acceptanceRate:.5,negativeRate:.5,correctionRate:1/6,lastDegradedAt:'2026-07-21T22:00:00.000Z',nextProbeAt:state==='suspended'?'2026-07-22T22:00:00.000Z':null,triggeredBy:['acceptance','negative'],reason:'calidad fuera de umbral'});
const containment=(status:DriftContainmentGroup['status'],cause:DriftContainmentGroup['cause']='router'):DriftContainmentGroup=>({cause,status,incidents:3,active:2,recovered:0,retryFailed:1,firstSeenAt:'2026-07-21T20:00:00.000Z',lastSeenAt:'2026-07-21T22:00:00.000Z',nextProbeAt:status==='contained'?'2026-07-22T04:00:00.000Z':status==='probe-ready'?'2026-07-22T04:00:00.000Z':null,reason:'señal de prueba'});
const PROBE_NOW=new Date('2026-07-22T06:00:00.000Z').getTime();

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

describe('evaluateContainmentProbe',()=>{
 it('mantiene la prueba acotada mientras reúne evidencia',()=>{const probe=evaluateContainmentProbe([row('baseline',13,14,.01,.02),row('tie',14,14,.01,.02)],[containment('probe-ready')],PROBE_NOW);expect(probe.state).toBe('running');expect(probe.sampleCount).toBe(2);expect(probe.maxSamples).toBe(8);});
 it('hace rollback temprano ante pérdida severa',()=>{const probe=evaluateContainmentProbe([row('adaptive',8,14,.01,.02),row('adaptive',8,14,.01,.02)],[containment('probe-ready')],PROBE_NOW);expect(probe.state).toBe('failed');expect(probe.reason).toContain('rollback inmediato');});
 it('aprueba baseline cuando ahorra al menos 20% sin pérdida material',()=>{const rows=Array.from({length:5},(_,index)=>row(index<3?'baseline':'tie',13.5,14,.01,.02,`2026-07-22T0${5+index}:00:00.000Z`));const probe=evaluateContainmentProbe(rows,[containment('probe-ready')],PROBE_NOW);expect(probe.state).toBe('passed');expect(probe.baselineWinRate).toBeGreaterThanOrEqual(.6);expect(probe.averageCostRatio).toBeLessThanOrEqual(.8);});
 it('rechaza la prueba al expirar sin evidencia suficiente',()=>{const probe=evaluateContainmentProbe([row('tie',14,14,.01,.02)],[containment('probe-ready')],new Date('2026-07-23T05:00:00Z').getTime());expect(probe.state).toBe('failed');expect(probe.reason).toContain('no demostró');});
 it('ignora muestras anteriores al inicio de la prueba',()=>{const probe=evaluateContainmentProbe([row('baseline',15,14,.01,.02,'2026-07-22T03:00:00.000Z'),row('tie',14,14,.01,.02,'2026-07-22T05:00:00.000Z')],[containment('probe-ready')],PROBE_NOW);expect(probe.sampleCount).toBe(1);});
});

describe('applyDriftContainmentProtection',()=>{
 const base=summarizeBenchmarkPolicy([]);
 it('fuerza la ruta adaptativa mientras una causa está contenida',()=>{const policy=applyDriftContainmentProtection(base,[containment('contained','provider')],undefined,[],PROBE_NOW);expect(policy.strategy).toBe('adaptive');expect(policy.status).toBe('promoted');expect(policy.reason).toContain('contención cognitiva automática');expect(policy.reason).toContain('provider');});
 it('abre una prueba controlada al terminar el enfriamiento',()=>{const policy=applyDriftContainmentProtection({...base,strategy:'adaptive',status:'promoted'},[containment('probe-ready','router')],undefined,[],PROBE_NOW);expect(policy.strategy).toBe('baseline');expect(policy.status).toBe('containment_probe');expect(policy.containmentProbe?.state).toBe('running');});
 it('reactiva protección cuando existe cualquier causa todavía contenida',()=>{const policy=applyDriftContainmentProtection(base,[containment('probe-ready','router'),containment('contained','cognition')],undefined,[],PROBE_NOW);expect(policy.strategy).toBe('adaptive');expect(policy.reason).toContain('cognition');});
 it('reactiva protección cuando la prueba pierde calidad',()=>{const rows=[row('adaptive',8,14,.01,.02),row('adaptive',8,14,.01,.02)];const policy=applyDriftContainmentProtection(base,[containment('probe-ready')],'auto',rows,PROBE_NOW);expect(policy.strategy).toBe('adaptive');expect(policy.containmentProbe?.state).toBe('failed');});
 it('mantiene baseline tras una prueba aprobada',()=>{const rows=Array.from({length:5},(_,index)=>row(index<3?'baseline':'tie',13.5,14,.01,.02,`2026-07-22T0${5+index}:00:00.000Z`));const policy=applyDriftContainmentProtection(base,[containment('probe-ready')],'auto',rows,PROBE_NOW);expect(policy.strategy).toBe('baseline');expect(policy.status).toBe('containment_probe_passed');});
 it('aplaza la prueba si la protección de calidad presupuestaria sigue activa',()=>{const protectedPolicy=applyBudgetQualityProtection(base,quality('suspended'));const policy=applyDriftContainmentProtection(protectedPolicy,[containment('probe-ready')],undefined,[],PROBE_NOW);expect(policy.strategy).toBe('adaptive');expect(policy.status).toBe('promoted');expect(policy.reason).toContain('se aplaza');});
 it('respeta gobierno humano congelado o excluido',()=>{expect(applyDriftContainmentProtection(base,[containment('contained')],'frozen',[],PROBE_NOW).strategy).toBe('baseline');expect(applyDriftContainmentProtection(base,[containment('contained')],'excluded',[],PROBE_NOW).strategy).toBe('baseline');});
});
