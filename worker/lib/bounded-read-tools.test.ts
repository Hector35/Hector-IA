import {describe,expect,it} from 'vitest';
import {calculateExpression,parseReadOnlyToolCall,readOnlyToolManifest,renderReadOnlyToolProtocol} from './bounded-read-tools';

describe('bounded read-only tools',()=>{
 it('parses only exact tagged calls with allowlisted arguments',()=>{
  expect(parseReadOnlyToolCall('<tool_call>{"name":"calculator","arguments":{"expression":"17*6"}}</tool_call>')).toEqual({name:'calculator',arguments:{expression:'17*6'}});
  expect(parseReadOnlyToolCall('<tool_call>{"name":"memory_search","arguments":{"query":"modelo propio","limit":99}}</tool_call>')).toEqual({name:'memory_search',arguments:{query:'modelo propio',limit:8}});
  expect(parseReadOnlyToolCall('Voy a usar una herramienta <tool_call>{"name":"system_state","arguments":{}}</tool_call>')).toBeNull();
  expect(parseReadOnlyToolCall('<tool_call>{"name":"delete_memory","arguments":{}}</tool_call>')).toBeNull();
  expect(parseReadOnlyToolCall('<tool_call>{"name":"system_state","arguments":{"write":true}}</tool_call>')).toBeNull();
 });

 it('calculates arithmetic without eval and respects precedence',()=>{
  expect(calculateExpression('17*6').value).toBe(102);
  expect(calculateExpression('(17*6)+4').value).toBe(106);
  expect(calculateExpression('2^3^2').value).toBe(512);
  expect(calculateExpression('-4 + 2 * 5').value).toBe(6);
  expect(calculateExpression('1,5 × 2').value).toBe(3);
 });

 it('rejects unsafe, malformed and unbounded arithmetic',()=>{
  expect(()=>calculateExpression('process.exit()')).toThrow(/caracteres no permitidos/);
  expect(()=>calculateExpression('1/0')).toThrow(/división entre cero/);
  expect(()=>calculateExpression('2^99')).toThrow(/exponente fuera/);
  expect(()=>calculateExpression('(2+3')).toThrow(/paréntesis/);
 });

 it('documents a read-only bounded protocol',()=>{
  const protocol=renderReadOnlyToolProtocol(),manifest=readOnlyToolManifest();
  expect(protocol).toContain('<tool_call>');
  expect(protocol).toContain('SOLO LECTURA');
  expect(manifest).toMatchObject({sideEffects:'none',maximumCallsPerResponse:2,ownershipEnforced:true});
  expect(manifest.tools).toEqual(['calculator','system_state','memory_search','recent_work']);
 });
});
