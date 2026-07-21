import {describe,expect,it} from 'vitest';
import {selectSkills} from './skills';
import {buildPlan,renderAgentContext} from './planner';

describe('agent skills',()=>{
 it('selecciona código y navegador según intención',()=>{
  const ids=selectSkills('Corrige el código en GitHub y verifica la interfaz de producción').map(skill=>skill.id);
  expect(ids).toContain('github-code');
  expect(ids).toContain('browser-verify');
 });

 it('crea fases verificables y limita reintentos',()=>{
  const plan=buildPlan('Investiga el problema actual');
  expect(plan.phases.map(phase=>phase.name)).toEqual(['inspect','plan','execute','test','verify']);
  expect(plan.maxAttempts).toBe(3);
  expect(plan.skills).toContain('research-web');
 });

 it('reconoce una solicitud de PWA aunque use acentos',()=>{
  const ids=selectSkills('Crea una aplicación web progresiva instalable en iPhone y que funcione offline first').map(skill=>skill.id);
  expect(ids).toContain('pwa-builder');
 });

 it('inyecta el contrato técnico cuando construye una PWA',()=>{
  const context=renderAgentContext('Construye una PWA para iPhone con service worker');
  expect(context).toContain('CONTRATO DE INGENIERÍA PWA');
  expect(context).toContain('manifest.webmanifest');
  expect(context).toContain('viewport 390x844');
  expect(context).toContain('rollback');
 });

 it('no activa PWA para una tarea analítica sin relación',()=>{
  expect(selectSkills('Analiza mis gastos del mes').map(skill=>skill.id)).not.toContain('pwa-builder');
 });
});
