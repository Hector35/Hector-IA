import {describe,expect,it} from 'vitest';
import {summarizeBenchmarkPolicy,type BenchmarkAggregateRow} from './benchmark-promotion';
const row=(winner:'baseline'|'adaptive'|'tie',baseline=10,adaptive=14,baselineCost=.01,adaptiveCost=.03):BenchmarkAggregateRow=>({winner,baseline_score:baseline,adaptive_score:adaptive,baseline_cost_usd:baselineCost,adaptive_cost_usd:adaptiveCost});

describe('summarizeBenchmarkPolicy',()=>{
 it('permanece observando con muestras insuficientes',()=>{const policy=summarizeBenchmarkPolicy([row('adaptive'),row('adaptive')]);expect(policy.status).toBe('observing');expect(policy.strategy).toBe('baseline');});
 it('promueve adaptive con ventaja repetida y costo acotado',()=>{const policy=summarizeBenchmarkPolicy([row('adaptive'),row('adaptive'),row('adaptive'),row('tie'),row('baseline',10,12)]);expect(policy.status).toBe('promoted');expect(policy.strategy).toBe('adaptive');expect(policy.averageCostMultiplier).toBeLessThanOrEqual(4);});
 it('no promueve si el costo excede el límite',()=>{const policy=summarizeBenchmarkPolicy(Array.from({length:6},()=>row('adaptive',10,16,.01,.08)));expect(policy.status).toBe('observing');expect(policy.strategy).toBe('baseline');});
 it('no promueve una ventaja de puntaje marginal',()=>{const policy=summarizeBenchmarkPolicy(Array.from({length:6},()=>row('adaptive',10,11)));expect(policy.status).toBe('observing');});
 it('revierte una promoción cuando las tres muestras recientes favorecen baseline',()=>{const rows=[row('baseline',15,10),row('baseline',14,10),row('tie',12,12),row('adaptive'),row('adaptive'),row('adaptive')];const policy=summarizeBenchmarkPolicy(rows,{strategy:'adaptive',status:'promoted'});expect(policy.status).toBe('rolled_back');expect(policy.strategy).toBe('baseline');});
});
