import { describe,expect,it } from 'vitest';
import { classify,relevantMemories,routeModel } from './openai';
import type { Bindings } from '../types';

const env={
  OPENAI_MODEL:'gpt-5.4-mini',
  OPENAI_MODEL_FAST:'gpt-5.4-mini',
  OPENAI_MODEL_BALANCED:'gpt-5.4-mini',
  OPENAI_MODEL_REASONING:'gpt-5.4'
} as Bindings;

describe('Héctor OS AI router',()=>{
  it('uses fast routing for brief direct messages',()=>{
    const route=routeModel(env,'hola',true);
    expect(route.tier).toBe('fast');
    expect(route.model).toBe('gpt-5.4-mini');
    expect(route.needsWeb).toBe(false);
  });

  it('uses deep routing for architecture and implementation work',()=>{
    const route=routeModel(env,'Diseña e implementa una arquitectura completa en Cloudflare Workers, D1 y R2, compara riesgos y optimiza el despliegue.',true);
    expect(route.tier).toBe('deep');
    expect(route.model).toBe('gpt-5.4');
    expect(route.task).toBe('ingeniería de software');
  });

  it('only requests web for time-sensitive prompts',()=>{
    expect(routeModel(env,'Busca el precio actual y verifica la versión disponible',true).needsWeb).toBe(true);
    expect(routeModel(env,'Explícame cómo funciona un transformador',true).needsWeb).toBe(false);
    expect(routeModel(env,'Busca noticias recientes',false).needsWeb).toBe(false);
  });

  it('classifies high-impact domains',()=>{
    expect(classify('Tengo dolor y taquicardia después de una dosis')).toBe('salud y análisis de riesgo');
    expect(classify('Calcula mi saldo, gastos y presupuesto de la quincena')).toBe('finanzas personales');
    expect(classify('Explica cómo emerge la química desde la física')).toBe('explicación técnica');
  });
});

describe('Héctor OS memory selection',()=>{
  it('returns memories related to the request and excludes unrelated ones',()=>{
    const memories=[
      'Saldo BBVA registrado: 4,396.50 MXN.',
      'El usuario trabaja como camillero en el IMSS.',
      'El usuario prefiere explicaciones técnicas como ingeniero.',
      'La lesión fue en el dedo índice y tuvo reparación de tendón.'
    ];
    const selected=relevantMemories('¿Cuánto dinero tengo en BBVA y cómo organizo mi saldo?',memories);
    expect(selected).toContain('Saldo BBVA registrado: 4,396.50 MXN.');
    expect(selected).not.toContain('La lesión fue en el dedo índice y tuvo reparación de tendón.');
  });

  it('prioritizes exact numeric matches',()=>{
    const selected=relevantMemories('Revisa el saldo de 4,396.50',[
      'Saldo anterior: 1,000 MXN.',
      'Saldo BBVA registrado: 4,396.50 MXN.'
    ]);
    expect(selected[0]).toContain('4,396.50');
  });
});
