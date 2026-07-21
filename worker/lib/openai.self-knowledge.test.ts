import {describe,expect,it} from 'vitest';
import {classify,routeModel} from './openai';
import type {Bindings} from '../types';
const env={OPENAI_MODEL:'gpt-5.6-terra',OPENAI_MODEL_FAST:'gpt-5.6-luna',OPENAI_MODEL_BALANCED:'gpt-5.6-terra',OPENAI_MODEL_REASONING:'gpt-5.6-sol'} as Bindings;
describe('self knowledge routing',()=>{
 it.each(['¿Quién eres y cuáles son tus capacidades?','Explícame qué es ChatGPT Work','¿Qué puede hacer Codex?','Háblame de GPT-5.6','¿Qué sabes sobre mí?'])('usa GPT-5.6 Sol con inteligencia profunda para %s',(input)=>{const route=routeModel(env,input,true);expect(route.tier).toBe('deep');expect(route.reasoning).toBe('xhigh');expect(route.model).toBe('gpt-5.6-sol');expect(route.task).toBe('autoconocimiento y productos de IA');});
 it('activa web cuando la pregunta depende del estado actual',()=>{expect(routeModel(env,'¿Cuál es la disponibilidad actual de GPT-5.6?',true).needsWeb).toBe(true);expect(routeModel(env,'¿Cuál es la disponibilidad actual de GPT-5.6?',false).needsWeb).toBe(false);});
 it('no degrada consultas normales',()=>{expect(classify('hola')).toBe('consulta general');expect(routeModel(env,'hola',true)).toMatchObject({tier:'fast',model:'gpt-5.6-luna',reasoning:'low'});});
});
