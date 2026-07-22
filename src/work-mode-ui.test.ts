import {describe,expect,it} from 'vitest';
import {workProgressText} from './work-mode-ui';

describe('workProgressText',()=>{
 it('prioriza el último avance útil sobre el error',()=>{
  expect(workProgressText({result:'Avance verificado',last_error:'Fallo transitorio'})).toBe('Avance verificado');
 });
 it('usa el error cuando todavía no existe un avance',()=>{
  expect(workProgressText({result:null,last_error:'Esperando credenciales'})).toBe('Esperando credenciales');
 });
 it('explica que el primer ciclo aún no termina',()=>{
  expect(workProgressText({result:null,last_error:null})).toBe('El primer ciclo todavía no termina.');
 });
});
