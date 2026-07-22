import {describe,expect,it} from 'vitest';
import {isZeroCallModel,workResponseOptions} from './planned-work';

describe('workResponseOptions',()=>{
 it('fuerza deliberación para trabajos de razonamiento alto',()=>{expect(workResponseOptions({userId:'user-1',reasoningLevel:'high'})).toEqual({reasoning:'high',deliberation:'force',userId:'user-1'});});
 it('mantiene selección automática para trabajos ordinarios',()=>{expect(workResponseOptions({userId:'user-2',reasoningLevel:'auto'})).toEqual({reasoning:'auto',deliberation:'auto',userId:'user-2'});});
 it('distingue reglas y reutilización local de inferencias reales',()=>{expect(isZeroCallModel('hector-rules-v1')).toBe(true);expect(isZeroCallModel('hector-runtime-reuse')).toBe(true);expect(isZeroCallModel('@cf/ibm-granite/granite-4.0-h-micro')).toBe(false);expect(isZeroCallModel('gpt-5.6-sol')).toBe(false);});
});
