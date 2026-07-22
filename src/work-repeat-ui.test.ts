import {describe,expect,it} from 'vitest';
import {repeatWorkPayload} from './work-repeat-ui';

describe('repeatWorkPayload',()=>{
 it('conserva la meta y elimina espacios externos',()=>{
  expect(repeatWorkPayload('  Termina la aplicación y valida el despliegue.  ')).toEqual({goal:'Termina la aplicación y valida el despliegue.'});
 });
 it('rechaza metas incompletas',()=>{
  expect(()=>repeatWorkPayload('  corto  ')).toThrow(/suficiente información/);
 });
});
