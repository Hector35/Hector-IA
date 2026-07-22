import {describe,expect,it} from 'vitest';
import {workResponseOptions} from './planned-work';

describe('workResponseOptions',()=>{
 it('conserva razonamiento alto pero deja al gobernador decidir el número de pasadas',()=>{
  expect(workResponseOptions({userId:'user-1',reasoningLevel:'high'})).toEqual({reasoning:'high',deliberation:'auto',userId:'user-1'});
 });
 it('mantiene selección automática para trabajos ordinarios',()=>{
  expect(workResponseOptions({userId:'user-2',reasoningLevel:'auto'})).toEqual({reasoning:'auto',deliberation:'auto',userId:'user-2'});
 });
});
