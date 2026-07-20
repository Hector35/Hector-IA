import {describe,expect,it} from 'vitest';
import {extractProjectTasks} from './projects';

describe('extractProjectTasks',()=>{
 it('prioriza la lista numerada principal y no convierte viñetas internas en agentes',()=>{
  expect(extractProjectTasks('Plan\n1. **Crear API**\n   - validar token\n2. Crear interfaz\n   - iPhone\n3. Añadir pruebas')).toEqual(['Crear API','Crear interfaz','Añadir pruebas']);
 });
 it('usa viñetas del mismo nivel cuando no hay lista numerada',()=>{
  expect(extractProjectTasks('- Datos\n  - índice interno\n- Backend\n- Frontend')).toEqual(['Datos','Backend','Frontend']);
 });
 it('limpia markdown, elimina duplicados y limita subtareas',()=>{
  const input=['Introducción',...Array.from({length:20},(_,i)=>`${i+1}. **Tarea verificable ${i+1}**`)].join('\n');
  const tasks=extractProjectTasks(input);
  expect(tasks).toHaveLength(16);
  expect(tasks[0]).toBe('Tarea verificable 1');
 });
});
