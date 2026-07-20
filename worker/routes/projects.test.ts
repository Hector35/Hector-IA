import {describe,expect,it} from 'vitest';
import {extractProjectTasks} from './projects';

describe('extractProjectTasks',()=>{
 it('extrae listas numeradas y viñetas sin duplicados',()=>{
  expect(extractProjectTasks('Plan\n1. Crear API\n2. Crear interfaz\n- Añadir pruebas\n- crear api')).toEqual(['Crear API','Crear interfaz','Añadir pruebas']);
 });
 it('ignora texto normal y limita subtareas',()=>{
  const input=['Introducción',...Array.from({length:30},(_,i)=>`${i+1}. Tarea verificable ${i+1}`)].join('\n');
  const tasks=extractProjectTasks(input);
  expect(tasks).toHaveLength(24);
  expect(tasks[0]).toBe('Tarea verificable 1');
 });
});
