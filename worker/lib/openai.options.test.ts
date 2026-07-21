import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {applyResponseOptions,routeModel} from './openai';

const env={
 OPENAI_MODEL:'gpt-5.4-mini',
 OPENAI_MODEL_FAST:'gpt-5.4-mini',
 OPENAI_MODEL_BALANCED:'gpt-5.4-mini',
 OPENAI_MODEL_REASONING:'gpt-5.4'
} as Bindings;

describe('explicit response reasoning',()=>{
 it('fuerza modelo profundo incluso para una instrucción breve',()=>{
  const normal=routeModel(env,'Revisa esto',false);
  const high=applyResponseOptions(env,normal,{reasoning:'high'});
  expect(normal.tier).toBe('balanced');
  expect(high).toMatchObject({tier:'deep',reasoning:'high',model:'gpt-5.4'});
  expect(high.reason).toContain('solicitado explícitamente');
 });

 it('conserva el enrutamiento normal cuando no se fuerza',()=>{
  const normal=routeModel(env,'hola',false);
  expect(applyResponseOptions(env,normal,{reasoning:'auto'})).toBe(normal);
 });
});