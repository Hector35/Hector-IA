import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {applyUserFeedback,routeModel} from './openai';
import type {UserFeedbackProfile} from './response-feedback';

const env={OPENAI_MODEL:'gpt-fast',OPENAI_MODEL_FAST:'gpt-fast',OPENAI_MODEL_BALANCED:'gpt-balanced',OPENAI_MODEL_REASONING:'gpt-deep'} as Bindings;
const profile=(overrides:Partial<UserFeedbackProfile>={}):UserFeedbackProfile=>({sampleCount:8,downRate:.6,nonDeepSampleCount:6,nonDeepDownRate:.62,cloudflareSampleCount:0,cloudflareDownRate:0,preferDeep:true,avoidCloudflare:false,guidance:[],reason:'feedback reciente indica que el razonamiento no profundo es insuficiente',...overrides});

describe('applyUserFeedback',()=>{
 it('escala una consulta general al modelo profundo cuando existe evidencia suficiente',()=>{const route=applyUserFeedback(env,routeModel(env,'Explícame este tema',false),profile());expect(route.tier).toBe('deep');expect(route.reasoning).toBe('high');expect(route.model).toBe('gpt-deep');expect(route.reason).toMatch(/aprendizaje controlado/);});
 it('no cambia el nivel sin evidencia suficiente',()=>{const original=routeModel(env,'Explícame este tema',false);expect(applyUserFeedback(env,original,profile({preferDeep:false}))).toEqual(original);});
 it('no degrada ni reemplaza una ruta que ya es profunda',()=>{const original=routeModel(env,'Diseña e implementa una arquitectura completa',false);expect(original.tier).toBe('deep');expect(applyUserFeedback(env,original,profile())).toEqual(original);});
});
