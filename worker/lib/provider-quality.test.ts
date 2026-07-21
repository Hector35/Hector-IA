import {describe,expect,it} from 'vitest';
import {assessProviderResponse,PROVIDER_HEALTH_POLICY,summarizeProviderHealth,type ProviderQualityRow} from './provider-quality';

describe('assessProviderResponse',()=>{
 it('acepta respuestas breves pero útiles',()=>{
  expect(assessProviderResponse('hola','Hola, Héctor. ¿En qué trabajamos hoy?')).toMatchObject({accepted:true,score:100});
 });

 it('rechaza respuestas vacías y páginas de error',()=>{
  expect(assessProviderResponse('hola','')).toMatchObject({accepted:false,score:0});
  expect(assessProviderResponse('resume esto','<!doctype html><html>Internal Server Error</html>').accepted).toBe(false);
 });

 it('exige resultado numérico cuando la solicitud contiene una operación explícita',()=>{
  expect(assessProviderResponse('cuánto es 18 * 7','El cálculo se puede realizar fácilmente.').accepted).toBe(false);
  expect(assessProviderResponse('cuánto es 18 * 7','El resultado es 126.').accepted).toBe(true);
 });

 it('detecta repetición excesiva',()=>{
  const repeated=Array.from({length:20},()=> 'La respuesta es la misma').join('. ');
  expect(assessProviderResponse('explica el proceso',repeated).accepted).toBe(false);
 });
});

describe('summarizeProviderHealth',()=>{
 const now=Date.parse('2026-07-21T15:00:00Z');
 const rows=(accepted:number,fallback:number,created_at='2026-07-21 14:55:00'):ProviderQualityRow[]=>Array.from({length:PROVIDER_HEALTH_POLICY.minSamples},()=>({accepted,fallback,latency_ms:500,created_at}));

 it('mantiene exploración controlada con pocas muestras',()=>{
  const health=summarizeProviderHealth(rows(0,1).slice(0,3),now);
  expect(health.healthy).toBe(true);
  expect(health.reason).toMatch(/muestras insuficientes/);
 });

 it('abre el circuito cuando la calidad reciente cae',()=>{
  const health=summarizeProviderHealth(rows(0,1),now);
  expect(health.healthy).toBe(false);
  expect(health.circuitOpen).toBe(true);
  expect(health.acceptedRate).toBe(0);
 });

 it('permite una prueba después del enfriamiento',()=>{
  const health=summarizeProviderHealth(rows(0,1,'2026-07-21 13:00:00'),now);
  expect(health.healthy).toBe(true);
  expect(health.circuitOpen).toBe(false);
  expect(health.reason).toMatch(/prueba controlada/);
 });

 it('calcula tasas y latencia promedio',()=>{
  const health=summarizeProviderHealth([
   {accepted:1,fallback:0,latency_ms:100,created_at:'2026-07-21 14:55:00'},
   {accepted:0,fallback:1,latency_ms:300,created_at:'2026-07-21 14:54:00'}
  ],now);
  expect(health.acceptedRate).toBe(.5);
  expect(health.fallbackRate).toBe(.5);
  expect(health.averageLatencyMs).toBe(200);
 });
});
