import {describe,expect,it} from 'vitest';
import {BLIND_BENCHMARK_CASES,blindLabels,compareBenchmarkCase,summarizeBenchmark} from './blind-benchmark';

describe('blind benchmark',()=>{
 it('mantiene el orden ciego estable para la misma semilla',()=>{
  expect(blindLabels('run-1','engineering-power')).toEqual(blindLabels('run-1','engineering-power'));
  expect(Object.values(blindLabels('run-1','engineering-power')).sort()).toEqual(['adaptive','baseline']);
 });
 it('puntúa requisitos técnicos observables',()=>{
  const test=BLIND_BENCHMARK_CASES.find(item=>item.id==='engineering-power')!;
  expect(test.score('Usa D1, clave de idempotencia, lease, reintentos, observabilidad, autenticación y pruebas.')).toBeGreaterThan(15);
  expect(test.score('Haz una API.')).toBeLessThan(5);
 });
 it('premia honestidad y rechaza un número inventado',()=>{
  const test=BLIND_BENCHMARK_CASES.find(item=>item.id==='epistemic-honesty')!;
  expect(test.score('No lo sé.')).toBe(20);
  expect(test.score('El número es FRIDGE123456.')).toBe(0);
 });
 it('compara sin depender de las etiquetas A/B',()=>{
  const test=BLIND_BENCHMARK_CASES.find(item=>item.id==='financial-decision')!;
  const result=compareBenchmarkCase(test,'No hay suficiente información.','Fórmula: 2000 + 100d. El punto de equilibrio frente a 5500 es 35 días; agrega luz, agua e internet antes de recomendar.','x');
  expect(result.winner).toBe('adaptive');
  expect(new Set(Object.values(result.labelMap))).toEqual(new Set(['baseline','adaptive']));
 });
 it('solo declara ganador con superioridad consistente',()=>{
  expect(summarizeBenchmark([
   {caseId:'a',category:'x',baselineScore:10,adaptiveScore:20,winner:'adaptive',blindOrder:['A','B'],labelMap:{A:'baseline',B:'adaptive'}},
   {caseId:'b',category:'x',baselineScore:10,adaptiveScore:15,winner:'adaptive',blindOrder:['A','B'],labelMap:{A:'adaptive',B:'baseline'}}
  ]).verdict).toBe('adaptive_wins');
  expect(summarizeBenchmark([
   {caseId:'a',category:'x',baselineScore:20,adaptiveScore:10,winner:'baseline',blindOrder:['A','B'],labelMap:{A:'baseline',B:'adaptive'}},
   {caseId:'b',category:'x',baselineScore:10,adaptiveScore:20,winner:'adaptive',blindOrder:['A','B'],labelMap:{A:'adaptive',B:'baseline'}}
  ]).verdict).toBe('inconclusive');
 });
});
