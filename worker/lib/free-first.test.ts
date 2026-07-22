import {describe,expect,it} from 'vitest';
import {classifyFreeFirstTask,compactFreeFirstContext,createExactInferenceCacheKey,createFreeFirstPolicy,freeFirstBenchmark} from './free-first';

describe('free-first runtime',()=>{
 it('mantiene razonamiento alto en una sola llamada avanzada por defecto',()=>{
  const policy=createFreeFirstPolicy({prompt:'Implementa y prueba una mejora compleja del repositorio',reasoningLevel:'high'});
  expect(policy).toMatchObject({taskKind:'reasoning',baselineAdvancedCalls:3,maxAdvancedCalls:1,estimatedAdvancedCallsAvoided:2});
 });

 it('conserva múltiples pasadas solo cuando se solicitan explícitamente',()=>{
  const policy=createFreeFirstPolicy({prompt:'Haz doble verificación con dos soluciones independientes',reasoningLevel:'high'});
  expect(policy.maxAdvancedCalls).toBe(3);
  expect(policy.estimatedAdvancedCallsAvoided).toBe(0);
 });

 it('envía clasificación y extracción no sensible a la capa gratuita',()=>{
  expect(classifyFreeFirstTask('Clasifica esta solicitud y elige la ruta')).toBe('classification');
  expect(createFreeFirstPolicy({prompt:'Extrae los campos y conviértelos a JSON'})).toMatchObject({freeProviderEligible:true,cacheable:true});
 });

 it('bloquea caché y proveedor gratuito para acciones de alto riesgo',()=>{
  const policy=createFreeFirstPolicy({prompt:'Elimina el despliegue y revoca el token'});
  expect(policy).toMatchObject({risk:'high',cacheable:false,freeProviderEligible:false});
 });

 it('deduplica y limita el contexto antes de inferencia',()=>{
  const repeated='Bloque uno\n\nBloque uno\n\n'+`contenido ${'x'.repeat(200)}`;
  const compacted=compactFreeFirstContext(repeated,120);
  expect(compacted.match(/Bloque uno/g)).toHaveLength(1);
  expect(compacted.length).toBeLessThanOrEqual(120);
 });

 it('genera claves exactas estables por usuario, prompt y contexto',async()=>{
  const first=await createExactInferenceCacheKey({userId:'u1',prompt:'  Resume   esto ',context:'A'}),second=await createExactInferenceCacheKey({userId:'u1',prompt:'resume esto',context:'A'}),other=await createExactInferenceCacheKey({userId:'u2',prompt:'resume esto',context:'A'});
  expect(first).toBe(second);
  expect(first).not.toBe(other);
 });

 it('demuestra reducción reproducible de llamadas avanzadas',()=>{
  expect(freeFirstBenchmark()).toMatchObject({scenarios:5,successRate:1,baselineAdvancedCalls:15,advancedCalls:2,freeCalls:1,cacheHits:1,advancedCallsAvoided:13});
  expect(freeFirstBenchmark().reductionRate).toBeGreaterThan(.85);
 });
});
