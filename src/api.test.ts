import {describe,expect,it} from 'vitest';
import {chatOptionsForRuntime,stageSixChatOptions,STAGE_SIX_CHAT_OPTIONS,usesSelectedModelChat} from './api';

describe('Hector Base chat routing',()=>{
 it('routes ordinary conversation to the operational open base outside Stage 6',()=>{
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

describe('Stage 6 maximum-intelligence mode',()=>{
 it('forces high reasoning and double deliberation for normal PWA chat',()=>{
  expect(STAGE_SIX_CHAT_OPTIONS).toEqual({reasoning:'high',deliberation:'force'});
  expect(stageSixChatOptions()).toEqual({reasoning:'high',deliberation:'force'});
  expect(stageSixChatOptions({reasoning:'auto',deliberation:'off'})).toEqual({reasoning:'high',deliberation:'force'});
 });

 it('preserves an explicitly selected runtime while raising cognition',()=>{
  expect(stageSixChatOptions({runtime:'hector-qwen397'})).toEqual({runtime:'hector-qwen397',reasoning:'high',deliberation:'force'});
 });

 it('recognizes Qwen 397B and Kimi K2.5 as explicit model selections',()=>{
  expect(usesSelectedModelChat('usa Qwen 397B')).toBe(true);
  expect(usesSelectedModelChat('habla con Qwen3.5-397B')).toBe(true);
  expect(usesSelectedModelChat('usa Kimi K2.5')).toBe(true);
  expect(usesSelectedModelChat('hola')).toBe(false);
 });
});
