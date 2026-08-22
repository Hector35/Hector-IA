import {describe,expect,it} from 'vitest';
import {selectSkills} from './skills';
import {buildPlan,renderAgentContext} from './planner';

describe('agent skills',()=>{
 it('selecciona código y navegador según intención',()=>{
  const ids=selectSkills('Corrige el código en GitHub y verifica la interfaz de producción').map(skill=>skill.id);
  expect(ids).toContain('github-code');
  expect(ids).toContain('browser-verify');
 });

 it('crea fases verificables y reconsidera estrategia tras intentos fallidos',()=>{
  const plan=buildPlan('Investiga el problema actual');
  expect(plan.phases.map(phase=>phase.name)).toEqual(['inspect','plan','execute','test','verify']);
  expect(plan.maxAttempts).toBe(3);
  expect(plan.skills).toContain('research-web');
  expect(plan.phases[0].goal).toContain('contexto compartido');
  expect(plan.phases[2].goal).toContain('alternativa legítima');
 });

 it('reconoce una solicitud de PWA aunque use acentos',()=>{
  const ids=selectSkills('Crea una aplicación web progresiva instalable en iPhone y que funcione offline first').map(skill=>skill.id);
  expect(ids).toContain('pwa-builder');
 });

 it('inyecta contexto compartido y el stack de capacidades sin convertirlos en locks',()=>{
  const context=renderAgentContext('Agrega una consola nueva para herramientas y usa fallback si una API falla');
  expect(context).toContain('COORDINACIÓN CANÓNICA DE SUPERFICIES');
  expect(context).toContain('STACK DE CAPACIDADES COMPARTIDAS');
  expect(context).toContain('/mcp');
  expect(context).toContain('Credential Broker');
  expect(context).toContain('señales consultivas, no locks ni permisos');
  expect(context).toContain('no son locks ni permisos');
 });

 it('selecciona capability routing para MCP, OAuth y fallback',()=>{
  const ids=selectSkills('Conecta MCP con OAuth y usa fallback del tool broker si falla').map(skill=>skill.id);
  expect(ids).toContain('capability-routing');
 });

 it('trata la arquitectura PWA como decisión informada, no como permiso interno',()=>{
  const context=renderAgentContext('Construye una PWA para iPhone con service worker');
  expect(context).toContain('CONTRATO DE INGENIERÍA PWA');
  expect(context).toContain('config/pwa-registry.json');
  expect(context).toContain('no un máximo rígido ni un permiso interno');
  expect(context).toContain('No inventes approvedNewPwa');
  expect(context).toContain('manifest.webmanifest');
  expect(context).toContain('viewport 390x844');
  expect(context).toContain('rollback');
  expect(context).toContain('decisión arquitectónica por evidencia');
 });

 it('no activa PWA para una tarea analítica sin relación',()=>{
  expect(selectSkills('Analiza mis gastos del mes').map(skill=>skill.id)).not.toContain('pwa-builder');
 });
});
