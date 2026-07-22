import {describe,expect,it} from 'vitest';
import {callCloudflare,chooseProvider} from './providers';
import type {ProviderHealth} from './provider-quality';
import type {FeedbackRoutingProfile} from './feedback-routing';
const health=(overrides:Partial<ProviderHealth>={}):ProviderHealth=>({sampleCount:12,acceptedRate:.95,fallbackRate:.05,averageLatencyMs:400,healthy:true,circuitOpen:false,reason:'calidad reciente dentro de umbrales',mostRecentAt:'2026-07-21 15:00:00',...overrides});
const feedback=(overrides:Partial<FeedbackRoutingProfile>={}):FeedbackRoutingProfile=>({sampleCount:8,negativeRate:.2,nonDeepSampleCount:6,nonDeepNegativeRate:.2,cloudflareSampleCount:4,cloudflareNegativeRate:.2,preferDeep:false,avoidCloudflare:false,guidance:[],reason:'aún no existe evidencia suficiente para cambiar el enrutamiento',...overrides});
describe('chooseProvider',()=>{
 it('usa Cloudflare para consultas breves, no sensibles y saludables',()=>{expect(chooseProvider('hola, resume esto','fast',false,true,health(),feedback()).provider).toBe('cloudflare')});
 it('mantiene OpenAI para web, complejidad y datos sensibles',()=>{expect(chooseProvider('busca noticias de hoy','fast',true,true,health()).provider).toBe('openai');expect(chooseProvider('diseña la arquitectura completa','deep',false,true,health()).provider).toBe('openai');expect(chooseProvider('revisa mi saldo bancario','fast',false,true,health()).provider).toBe('openai')});
 it('permite apagar Workers AI sin cambiar código',()=>{expect(chooseProvider('hola','fast',false,false)).toEqual({provider:'openai',reason:'Workers AI desactivado'})});
 it('resuelve utilidades deterministas aunque Workers AI esté apagado',()=>{expect(chooseProvider('Clasifica: corrige un error de TypeScript','balanced',false,false).reason).toMatch(/reglas locales/)});
 it('abre paso a OpenAI cuando el circuito está abierto',()=>{expect(chooseProvider('hola','fast',false,true,health({healthy:false,circuitOpen:true,acceptedRate:.3,fallbackRate:.7,reason:'circuito abierto por calidad o fallback'})).provider).toBe('openai')});
 it('evita Cloudflare por feedback negativo',()=>{expect(chooseProvider('hola','fast',false,true,health(),feedback({avoidCloudflare:true,reason:'baja utilidad'})).provider).toBe('openai')});
 it('ejecuta clasificación local sin binding AI',async()=>{const out=await callCloudflare({} as any,'instrucciones','Clasifica: crea una API en TypeScript');expect(out).toMatchObject({model:'hector-rules-v1',usage:{input_tokens:0,output_tokens:0},capability:'classify'})});
});
