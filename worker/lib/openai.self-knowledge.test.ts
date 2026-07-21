import {describe,expect,it} from 'vitest';
import {classify,routeModel} from './openai';
import type {Bindings} from '../types';

const env={OPENAI_MODEL:'balanced',OPENAI_MODEL_FAST:'fast',OPENAI_MODEL_BALANCED:'balanced',OPENAI_MODEL_REASONING:'deep'} as Bindings;

describe('self knowledge routing',()=>{
 it.each([
  '¿Quién eres y cuáles son tus capacidades?',
  'Explícame qué es ChatGPT Work',
  '¿Qué puede hacer Codex?',
  'Háblame de GPT-5.6',
  '¿Qué sabes sobre mí?'
 ])('usa inteligencia profunda para %s',(input)=>{
  const route=routeModel(env,input,true);
  expect(route.tier).toBe('deep');
  expect(route.reasoning).toBe('high');
  expect(route.model).toBe('deep');
  expect(route.task).toBe('autoconocimiento y productos de IA');
 });

 it('activa web cuando la pregunta de producto depende del estado actual',()=>{
  expect(routeModel(env,'¿Cuál es la disponibilidad actual de GPT-5.6?',true).needsWeb).toBe(true);
  expect(routeModel(env,'¿Cuál es la disponibilidad actual de GPT-5.6?',false).needsWeb).toBe(false);
 });

 it('no degrada consultas normales al modelo profundo',()=>{
  expect(classify('hola')).toBe('consulta general');
  expect(routeModel(env,'hola',true).tier).toBe('fast');
 });
});
