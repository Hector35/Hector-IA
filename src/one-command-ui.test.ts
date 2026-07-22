import {describe,expect,it} from 'vitest';
import {classifyOneCommand} from './one-command-ui';

describe('classifyOneCommand',()=>{
 it('crea un programado desde una orden con frecuencia',()=>{
  expect(classifyOneCommand('Cada 15 minutos revisa el estado del proyecto y reporta avances.')).toBe('programmed');
  expect(classifyOneCommand('Recuérdame en 20 minutos pagar la luz.')).toBe('programmed');
 });
 it('activa Trabajo solo con intención persistente explícita',()=>{
  expect(classifyOneCommand('Termina la aplicación y no te detengas hasta dejarla funcionando.')).toBe('work');
  expect(classifyOneCommand('Modo Trabajo: corrige todos los errores del proyecto.')).toBe('work');
 });
 it('conserva preguntas normales como chat',()=>{
  expect(classifyOneCommand('¿Cada cuánto se ejecuta una tarea programada?')).toBe('chat');
  expect(classifyOneCommand('Explícame cómo funciona el modo Trabajo.')).toBe('chat');
  expect(classifyOneCommand('Analiza este problema y dame opciones.')).toBe('chat');
 });
});
