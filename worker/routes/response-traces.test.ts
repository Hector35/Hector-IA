import {describe,expect,it} from 'vitest';
import {normalizeTraceRow,reasoningForTier,recommendNextAction} from './response-traces';

describe('reasoningForTier',()=>{
 it('mapea niveles de ruta a esfuerzo observable',()=>{
  expect(reasoningForTier('fast')).toBe('low');
  expect(reasoningForTier('balanced')).toBe('medium');
  expect(reasoningForTier('deep')).toBe('high');
 });
});

describe('recommendNextAction',()=>{
 it('prioriza corregir respuestas rechazadas por calidad',()=>{
  expect(recommendNextAction({task:'consulta general',qualityAccepted:false,fallback:false,searchedWeb:false,memories:[]})).toMatch(/Reintentar/);
 });
 it('señala rescates por fallback antes de continuar',()=>{
  expect(recommendNextAction({task:'consulta general',qualityAccepted:true,fallback:true,searchedWeb:false,memories:['x']})).toMatch(/proveedor original/);
 });
 it('convierte software en trabajo verificable',()=>{
  expect(recommendNextAction({task:'ingeniería de software',qualityAccepted:true,fallback:false,searchedWeb:false,memories:['x']})).toMatch(/proyecto verificable/);
 });
});

describe('normalizeTraceRow',()=>{
 it('parsea memoria y contexto sin romper ante JSON inválido',()=>{
  expect(normalizeTraceRow({id:'a',searched_web:1,fallback:0,quality_accepted:1,memories_json:'["uno",42,"dos"]',context_json:'{"recentMessages":4}'})).toMatchObject({id:'a',searched_web:true,fallback:false,quality_accepted:true,memories:['uno','dos'],context:{recentMessages:4}});
  expect(normalizeTraceRow({id:'b',searched_web:0,fallback:0,quality_accepted:0,memories_json:'mal',context_json:'[]'})).toMatchObject({memories:[],context:{}});
 });
});
