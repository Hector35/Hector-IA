import {describe,expect,it} from 'vitest';
import {requiresPaidFallback,selectFreeResource} from './free-resource-policy';

describe('free resource policy',()=>{
 it('prefiere reglas deterministas para clasificación',()=>{
  expect(selectFreeResource({capability:'classification'})?.id).toBe('typescript-rules');
  expect(requiresPaidFallback({capability:'classification'})).toBe(false);
 });

 it('usa D1 para recuperación sin inferencia',()=>{
  expect(selectFreeResource({capability:'retrieval'})?.id).toBe('d1-hybrid-retrieval');
 });

 it('no activa inferencia gratuita opcional sin permiso explícito',()=>{
  expect(selectFreeResource({capability:'embedding'})).toBeNull();
  expect(selectFreeResource({capability:'embedding',allowCloudflareAi:true})?.id).toBe('workers-ai-free');
 });

 it('respeta ejecución local privada',()=>{
  expect(selectFreeResource({capability:'classification',requiresPrivateLocalExecution:true})?.id).toBe('typescript-rules');
  expect(selectFreeResource({capability:'embedding',allowBrowserLocal:true,requiresPrivateLocalExecution:true})?.id).toBe('transformers-js-browser');
 });
});
