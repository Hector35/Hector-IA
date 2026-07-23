import {describe,expect,it} from 'vitest';
import {chatOptionsForRuntime,usesSelectedModelChat} from './api';

describe('selected model chat routing',()=>{
 it('routes explicit model commands through the selected-model endpoint',()=>{
  expect(usesSelectedModelChat('/modelos')).toBe(true);
  expect(usesSelectedModelChat('/modelo base hola')).toBe(true);
  expect(usesSelectedModelChat('/modelo qwen hola')).toBe(true);
  expect(usesSelectedModelChat('/modelo propio hola')).toBe(true);
  expect(usesSelectedModelChat('Habla con mi modelo: hola')).toBe(true);
 });

 it('keeps ordinary chat on the adaptive route',()=>{
  expect(usesSelectedModelChat('Explícame este problema')).toBe(false);
 });

 it('preserves an explicit runtime instead of simplifying reasoning options',()=>{
  expect(chatOptionsForRuntime('hola',{runtime:'hector-base',reasoning:'high',deliberation:'auto'})).toEqual({runtime:'hector-base',reasoning:'high',deliberation:'auto'});
 });
});
