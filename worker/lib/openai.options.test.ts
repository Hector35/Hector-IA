import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {applyResponseOptions,routeModel} from './openai';

const env={OPENAI_MODEL:'gpt-5.6-terra',OPENAI_MODEL_FAST:'gpt-5.6-luna',OPENAI_MODEL_BALANCED:'gpt-5.6-terra',OPENAI_MODEL_REASONING:'gpt-5.6-sol'} as Bindings;

describe('explicit response reasoning',()=>{
 it('fuerza GPT-5.6 Sol con esfuerzo máximo incluso para una instrucción breve',()=>{
  const normal=routeModel(env,'Revisa esto',false),high=applyResponseOptions(env,normal,{reasoning:'high'});
  expect(normal.tier).toBe('balanced');
  expect(high).toMatchObject({tier:'deep',reasoning:'max',model:'gpt-5.6-sol'});
  expect(high.reason).toContain('GPT-5.6 Sol');
 });
 it('acepta una solicitud explícita de razonamiento máximo',()=>{
  const max=applyResponseOptions(env,routeModel(env,'hola',false),{reasoning:'max'});
  expect(max).toMatchObject({tier:'deep',reasoning:'max',model:'gpt-5.6-sol'});
 });
 it('conserva el enrutamiento normal cuando no se fuerza',()=>{
  const normal=routeModel(env,'hola',false);
  expect(applyResponseOptions(env,normal,{reasoning:'auto'})).toBe(normal);
 });
});
