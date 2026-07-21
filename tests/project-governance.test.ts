import {describe,expect,it} from 'vitest';
import {cleanProjectText,compactProjectTasks,normalizeProjectText,projectObjectiveHash} from '../worker/routes/project-governance';

describe('project governance',()=>{
 it('normaliza formato, acentos y puntuación',()=>{
  expect(cleanProjectText(' **Definir   objetivo**, ')).toBe('Definir objetivo');
  expect(normalizeProjectText('Árboles, PRUEBAS')).toBe('arboles pruebas');
 });

 it('elimina subtareas duplicadas aunque cambie formato o acentos',()=>{
  const result=compactProjectTasks(['**Probar módulo**','probar   modulo','Integrar resultados']);
  expect(result).toEqual(['Probar módulo','Integrar resultados']);
 });

 it('conserva tareas pequeñas sin compactarlas',()=>{
  const input=['Arquitectura','Implementación','Pruebas'];
  expect(compactProjectTasks(input)).toEqual(input);
 });

 it('compacta listas largas y nunca crea más de cinco agentes',()=>{
  const input=Array.from({length:16},(_,i)=>`Subtarea ${i+1}`);
  const result=compactProjectTasks(input);
  expect(result.length).toBeLessThanOrEqual(5);
  expect(result).toHaveLength(3);
  expect(result[0]).toContain('Arquitectura y alcance');
  expect(result[1]).toContain('Implementación');
  expect(result[2]).toContain('Pruebas e integración');
  for(const task of input)expect(result.join(' | ')).toContain(task);
 });

 it('produce el mismo hash para objetivos equivalentes',async()=>{
  const first=await projectObjectiveHash('Crear PWA','Diseñar, implementar y probar la aplicación.');
  const second=await projectObjectiveHash(' **Crear   PWA** ','diseñar implementar y probar la aplicacion');
  expect(first).toBe(second);
  expect(first).toMatch(/^[a-f0-9]{64}$/);
 });

 it('produce hashes distintos para objetivos realmente diferentes',async()=>{
  const first=await projectObjectiveHash('Crear PWA','Aplicación de tareas');
  const second=await projectObjectiveHash('Crear PWA','Aplicación financiera');
  expect(first).not.toBe(second);
 });
});
