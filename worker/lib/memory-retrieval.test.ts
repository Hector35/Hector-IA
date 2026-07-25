import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {memoryRetrievalManifest,memoryRetrievalMetrics,memorySearchTerms,normalizeMemoryText,rankMemoryCandidates} from './memory-retrieval';

const benchmark=JSON.parse(readFileSync(new URL('../../model/hector-asi/evals/memory-retrieval/benchmark-v1.json',import.meta.url),'utf8'));

describe('memory retrieval v1',()=>{
 it('normalizes accents, expands useful synonyms and ranks direct evidence first',()=>{
  expect(normalizeMemoryText('Médico y Síntoma')).toBe('medico y sintoma');
  expect(memorySearchTerms('presupuesto para entrenar')).toEqual(expect.arrayContaining(['presupuesto','costo','gasto','entrenar','entrenamiento']));
  const ranked=rankMemoryCandidates('modelo principal 397B',benchmark.candidates,3);
  expect(ranked[0].id).toBe('m11');
  expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
 });

 it('meets the sealed synthetic benchmark thresholds without private data',()=>{
  expect(benchmark.containsPrivateUserData).toBe(false);
  expect(benchmark.benchmarkExcludedFromTraining).toBe(true);
  const metrics=memoryRetrievalMetrics(benchmark.cases,benchmark.candidates,benchmark.k);
  expect(metrics.cases).toBeGreaterThanOrEqual(20);
  expect(metrics.recallAtK).toBeGreaterThanOrEqual(benchmark.thresholds.recallAtK);
  expect(metrics.precisionAtK).toBeGreaterThanOrEqual(benchmark.thresholds.precisionAtK);
  expect(metrics.mrr).toBeGreaterThanOrEqual(benchmark.thresholds.mrr);
 });

 it('publishes an owner-filter requirement and bounded candidate contract',()=>{
  expect(memoryRetrievalManifest()).toMatchObject({ownerFilterRequired:true,candidateLimit:80,privateDataRequired:false});
 });
});
