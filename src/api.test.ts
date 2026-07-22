import {describe,expect,it} from 'vitest';
import {chatOptionsForRuntime} from './api';

describe('Hector Base chat routing',()=>{
 it('routes ordinary conversation to the operational open base',()=>{
  expect(chatOptionsForRuntime('Hola, explícame una idea sencilla',{reasoning:'high',deliberation:'auto'})).toEqual({reasoning:'auto',deliberation:'off'});
 });

 it('preserves advanced reasoning for complex or sensitive tasks',()=>{
  expect(chatOptionsForRuntime('Implementa una arquitectura completa en Cloudflare',{reasoning:'high',deliberation:'auto'})).toEqual({reasoning:'high',deliberation:'auto'});
  expect(chatOptionsForRuntime('Revisa mi saldo bancario',{reasoning:'high',deliberation:'auto'})).toEqual({reasoning:'high',deliberation:'auto'});
 });

 it('does not override a forced deliberation request',()=>{
  expect(chatOptionsForRuntime('Hola',{reasoning:'high',deliberation:'force'})).toEqual({reasoning:'high',deliberation:'force'});
 });
});
