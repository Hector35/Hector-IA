import {describe,expect,it} from 'vitest';
import {summarizeFeedbackRouting,type FeedbackRoutingRow} from './feedback-routing';

const row=(rating:number,actual_provider='openai',route_tier='balanced',correction:string|null=null):FeedbackRoutingRow=>({rating,actual_provider,route_tier,correction});

describe('summarizeFeedbackRouting',()=>{
 it('no modifica el router con pocas muestras',()=>{const profile=summarizeFeedbackRouting([row(-1),row(-1),row(1)]);expect(profile.preferDeep).toBe(false);expect(profile.avoidCloudflare).toBe(false);});
 it('escala una tarea cuando fallan respuestas no profundas de forma repetida',()=>{const profile=summarizeFeedbackRouting([row(-1),row(-1),row(-1),row(-1),row(1)]);expect(profile.nonDeepSampleCount).toBe(5);expect(profile.preferDeep).toBe(true);expect(profile.reason).toMatch(/nivel no profundo/);});
 it('evita Workers AI cuando sus respuestas acumulan baja utilidad',()=>{const profile=summarizeFeedbackRouting([row(-1,'cloudflare','fast'),row(-1,'cloudflare','fast'),row(-1,'cloudflare','fast'),row(1,'cloudflare','fast')]);expect(profile.cloudflareSampleCount).toBe(4);expect(profile.avoidCloudflare).toBe(true);});
 it('usa correcciones explícitas como guía sin duplicarlas',()=>{const profile=summarizeFeedbackRouting([row(-1,'openai','balanced','Usa mis datos reales y responde más directo.'),row(-1,'openai','balanced','Usa mis datos reales y responde más directo.'),row(-1,'openai','balanced','Incluye todos los cálculos.')]);expect(profile.guidance).toEqual(['Usa mis datos reales y responde más directo.','Incluye todos los cálculos.']);});
 it('nunca considera las respuestas profundas como candidatas para exigir más profundidad',()=>{const profile=summarizeFeedbackRouting(Array.from({length:8},()=>row(-1,'openai','deep')));expect(profile.nonDeepSampleCount).toBe(0);expect(profile.preferDeep).toBe(false);});
});
