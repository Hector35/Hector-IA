import {describe,expect,it} from 'vitest';
import benchmark from '../../model/hector-asi/evals/memory-retrieval/benchmark-v1.json';
import {memoryRetrievalManifest,memoryRetrievalMetrics,memorySearchTerms,normalizeMemoryText,rankMemoryCandidates} from './memory-retrieval';

const measured=memoryRetrievalMetrics(benchmark.cases,benchmark.candidates,benchmark.k);
const report={schemaVersion:1,benchmark:benchmark.name,containsPrivateUserData:benchmark.containsPrivateUserData,benchmarkExcludedFromTraining:benchmark.benchmarkExcludedFromTraining,thresholds:benchmark.thresholds,metrics:{cases:measured.cases,k:measured.k,recallAtK:measured.recallAtK,precisionAtK:measured.precisionAtK,mrr:measured.mrr},passed:measured.recallAtK>=benchmark.thresholds.recallAtK&&measured.precisionAtK>=benchmark.thresholds.precisionAtK&&measured.mrr>=benchmark.thresholds.mrr,manifest:memoryRetrievalManifest(),results:measured.results};
console.log(`MEMORY_RETRIEVAL_REPORT=${JSON.stringify(report)}`);

describe('memory retrieval v1',()=>{
 it('normalizes accents, expands useful synonyms and ranks direct evidence first',()=>{
  expect(normalizeMemoryText('Médico y Síntoma')).toBe('medico y sintoma');
  expect(memorySearchTerms('presupuesto para entrenar')).toEqual(expect.arrayContaining(['presupuesto','costo','gasto','entrenar','entrenamiento']));
  const ranked=rankMemoryCandidates('modelo principal 397B',benchmark.candidates,3);
  expect(ranked[0].id).toBe('m11');
  expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
 });
 it('meets the sealed synthetic benchmark thresholds without private data',()=>{
  expect(benchmark.containsPrivateUserData).toBe(false);expect(benchmark.benchmarkExcludedFromTraining).toBe(true);expect(measured.cases).toBeGreaterThanOrEqual(20);expect(measured.recallAtK).toBeGreaterThanOrEqual(benchmark.thresholds.recallAtK);expect(measured.precisionAtK).toBeGreaterThanOrEqual(benchmark.thresholds.precisionAtK);expect(measured.mrr).toBeGreaterThanOrEqual(benchmark.thresholds.mrr);expect(report.passed).toBe(true);
 });
 it('publishes an owner-filter requirement and bounded candidate contract',()=>{expect(memoryRetrievalManifest()).toMatchObject({ownerFilterRequired:true,candidateLimit:80,privateDataRequired:false})});
});
