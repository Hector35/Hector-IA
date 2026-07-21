import {describe,expect,it} from 'vitest';
import {compactProjectTasks,normalizeProjectText,projectObjectiveHash} from '../worker/routes/project-governance';

describe('production resilience',()=>{
 it('mantiene determinismo bajo 500 normalizaciones',()=>{
  for(let i=0;i<500;i++){
   const source=`  **Proyecto Ágil ${i}**,   `;
   expect(normalizeProjectText(source)).toBe(`proyecto agil ${i}`);
  }
 });

 it('compacta cargas máximas sin perder subtareas',()=>{
  for(let round=0;round<100;round++){
   const input=Array.from({length:16},(_,i)=>`R${round} tarea ${i+1}`);
   const result=compactProjectTasks(input);
   expect(result.length).toBeLessThanOrEqual(5);
   const joined=result.join(' | ');
   for(const task of input)expect(joined).toContain(task);
  }
 });

 it('deduplica variantes equivalentes de forma estable',async()=>{
  const variants=[
   ['Crear PWA','Diseñar, implementar y probar la aplicación.'],
   [' **Crear   PWA** ','diseñar implementar y probar la aplicacion'],
   ['CREAR PWA','Diseñar implementar y probar la aplicación'],
  ] as const;
  const hashes=await Promise.all(variants.map(([title,objective])=>projectObjectiveHash(title,objective)));
  expect(new Set(hashes).size).toBe(1);
 });

 it('evita colisiones obvias en 300 objetivos distintos',async()=>{
  const hashes=await Promise.all(Array.from({length:300},(_,i)=>projectObjectiveHash('Proyecto',`Objetivo distinto ${i}`)));
  expect(new Set(hashes).size).toBe(300);
 });
});
