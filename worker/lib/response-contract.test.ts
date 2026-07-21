import {describe,expect,it} from 'vitest';
import {enforceResponseContract} from './response-contract';

describe('enforceResponseContract',()=>{
 it('respeta una solicitud de ignorancia sin explicación adicional',()=>{
  const result=enforceResponseContract('Dime el número de serie exacto. No expliques dónde buscarlo; responde solo lo que realmente sabes.','No lo sé. Nunca me has proporcionado ese dato y no puedo inferirlo. Si quieres, te digo dónde buscar.');
  expect(result).toEqual({text:'No lo sé.',applied:true,reasons:['ignorancia explícita reducida al formato solicitado']});
 });

 it('normaliza respuestas binarias',()=>{
  expect(enforceResponseContract('Responde solo con sí o no','La respuesta es sí, porque cumple.').text).toBe('Sí');
  expect(enforceResponseContract('Contesta únicamente con sí o no','No, no cumple.').text).toBe('No');
 });

 it('limita a una palabra cuando se solicita',()=>{
  expect(enforceResponseContract('Responde únicamente con una palabra','**Correcto**, esa es la opción.').text).toBe('Correcto');
 });

 it('elimina explicaciones no solicitadas',()=>{
  const result=enforceResponseContract('Da el resultado sin explicar','126. Se obtiene multiplicando 18 por 7.');
  expect(result.text).toBe('126.');
  expect(result.applied).toBe(true);
 });

 it('respeta límites explícitos de líneas',()=>{
  const result=enforceResponseContract('Responde en máximo 2 líneas','uno\ndos\ntres');
  expect(result.text).toBe('uno\ndos');
 });

 it('no altera respuestas sin contrato explícito',()=>{
  const output='Una explicación completa y útil.';
  expect(enforceResponseContract('Explícame el sistema',output)).toEqual({text:output,applied:false,reasons:[]});
 });
});
