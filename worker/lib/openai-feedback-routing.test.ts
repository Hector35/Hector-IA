import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {applyFeedbackRouting,routeModel} from './openai';
import type {FeedbackRoutingProfile} from './feedback-routing';

const env={OPENAI_MODEL:'gpt-fast',OPENAI_MODEL_FAST:'gpt-fast',OPENAI_MODEL_BALANCED:'gpt-balanced',OPENAI_MODEL_REASONING:'gpt-deep'} as Bindings;
const profile=(overrides:Partial<FeedbackRoutingProfile>={}):FeedbackRoutingProfile=>({sampleCount:8,negativeRate:.6,nonDeepSampleCount:6,nonDeepNegativeRate:.62,cloudflareSampleCount:0,cloudflareNegativeRate:0,preferDeep:true,avoidCloudflare:false,guidance:[],reason:'las valoraciones recientes muestran que el nivel no profundo es insuficiente',...overrides});

describe('applyFeedbackRouting',()=>{
 it('escala una consulta general al modelo profundo',()=>{const route=applyFeedbackRouting(env,routeModel(env,'Explícame este tema',false),profile());expect(route.tier).toBe('deep');expect(route.reasoning).toBe('high');expect(route.model).toBe('gpt-deep');expect(route.reason).toMatch(/libro mayor/);});
 it('mantiene la ruta original sin evidencia suficiente',()=>{const original=routeModel(env,'Explícame este tema',false);expect(applyFeedbackRouting(env,original,profile({preferDeep:false}))).toEqual(original);});
 it('preserva el autoconocimiento que ya usa inteligencia profunda',()=>{const original=routeModel(env,'¿Qué puede hacer Héctor OS?',false);expect(original.tier).toBe('deep');expect(applyFeedbackRouting(env,original,profile())).toEqual(original);});
});
