import {describe,expect,it} from 'vitest';
import {decideFreeFirst,detectFreeFirstCapability,runDeterministicFreeInference} from './free-first-inference';

describe('free-first inference',()=>{
 it('clasifica y enruta sin llamadas avanzadas',()=>{
  const classification=runDeterministicFreeInference('Clasifica este texto: corrige el build de TypeScript en GitHub');
  const routing=runDeterministicFreeInference('¿Qué módulo debe resolver: agenda una reunión mañana?');
  expect(classification).toMatchObject({capability:'classify'});
  expect(JSON.parse(classification!.text)).toMatchObject({category:'github-code',advancedCalls:0});
  expect(routing).toMatchObject({capability:'route'});
  expect(JSON.parse(routing!.text)).toMatchObject({taskType:'calendar',advancedCalls:0});
 });

 it('extrae campos verificables sin modelo',()=>{
  const result=runDeterministicFreeInference('Extrae campos: escribe a prueba@example.com, revisa https://example.com y registra $1,250.50');
  expect(result).toMatchObject({capability:'extract',confidence:.95});
  expect(JSON.parse(result!.text)).toEqual({emails:['prueba@example.com'],urls:['https://example.com'],amounts:['$1,250.50'],source:'deterministic',advancedCalls:0});
 });

 it('reserva el modelo avanzado para web, riesgo o complejidad',()=>{
  expect(decideFreeFirst('Clasifica esta solicitud sencilla').tier).toBe('deterministic');
  expect(decideFreeFirst('Busca noticias actuales en internet',{allowWeb:true}).tier).toBe('advanced');
  expect(decideFreeFirst('Implementa una arquitectura completa',{reasoningHigh:true}).tier).toBe('advanced');
  expect(decideFreeFirst('Resume este texto',{freeProviderHealthy:true}).tier).toBe('free-model');
  expect(decideFreeFirst('Resume este texto',{freeProviderHealthy:false}).tier).toBe('economical');
 });

 it('detecta capacidades comunes sin inferencia',()=>{
  expect(detectFreeFirstCapability('Extrae correos')).toBe('extract');
  expect(detectFreeFirstCapability('Resume el documento')).toBe('summarize');
  expect(detectFreeFirstCapability('Genera una explicación')).toBe('generate');
 });
});
