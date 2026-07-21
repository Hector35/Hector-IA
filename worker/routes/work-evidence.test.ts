import {describe,expect,it} from 'vitest';
import {parseEvidenceErrors} from './work-evidence';

describe('parseEvidenceErrors',()=>{
 it('acepta únicamente listas de cadenas',()=>{
  expect(parseEvidenceErrors('["console error","page error"]')).toEqual(['console error','page error']);
  expect(parseEvidenceErrors('["válido",42,null]')).toEqual(['válido']);
 });

 it('tolera contenido vacío o corrupto sin romper Trabajo',()=>{
  expect(parseEvidenceErrors(null)).toEqual([]);
  expect(parseEvidenceErrors('no-json')).toEqual([]);
  expect(parseEvidenceErrors('{"error":"x"}')).toEqual([]);
 });

 it('limita el volumen entregado a la interfaz',()=>{
  expect(parseEvidenceErrors(JSON.stringify(Array.from({length:150},(_,i)=>`e${i}`)))).toHaveLength(100);
 });
});
