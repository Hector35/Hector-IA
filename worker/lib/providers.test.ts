import {describe,expect,it} from 'vitest';
import {chooseProvider} from './providers';
import type {ProviderHealth} from './provider-quality';

const health=(overrides:Partial<ProviderHealth>={}):ProviderHealth=>({sampleCount:12,acceptedRate:.95,fallbackRate:.05,averageLatencyMs:400,healthy:true,circuitOpen:false,reason:'calidad reciente dentro de umbrales',mostRecentAt:'2026-07-21 15:00:00',...overrides});

describe('chooseProvider',()=>{
  it('usa Cloudflare para consultas breves, no sensibles y saludables',()=>{
    expect(chooseProvider('hola, resume esto','fast',false,true,health()).provider).toBe('cloudflare');
  });
  it('mantiene OpenAI para web, complejidad y datos sensibles',()=>{
    expect(chooseProvider('busca noticias de hoy','fast',true,true,health()).provider).toBe('openai');
    expect(chooseProvider('diseña la arquitectura completa','deep',false,true,health()).provider).toBe('openai');
    expect(chooseProvider('revisa mi saldo bancario','fast',false,true,health()).provider).toBe('openai');
  });
  it('permite apagar Workers AI sin cambiar código',()=>{
    expect(chooseProvider('hola','fast',false,false)).toEqual({provider:'openai',reason:'Workers AI desactivado'});
  });
  it('abre paso a OpenAI cuando el circuito de calidad está abierto',()=>{
    const decision=chooseProvider('hola','fast',false,true,health({healthy:false,circuitOpen:true,acceptedRate:.3,fallbackRate:.7,reason:'circuito abierto por calidad o fallback'}));
    expect(decision.provider).toBe('openai');
    expect(decision.reason).toMatch(/pausado/);
  });
  it('permite una prueba controlada después del enfriamiento',()=>{
    const decision=chooseProvider('hola','fast',false,true,health({reason:'enfriamiento completado; se permite una prueba controlada'}));
    expect(decision).toEqual({provider:'cloudflare',reason:'prueba controlada tras enfriamiento'});
  });
});
