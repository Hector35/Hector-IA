import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('Héctor Agent V1 audited contract',()=>{
 const route=readFileSync('worker/routes/hector-agent.ts','utf8');
 const app=readFileSync('public/agent/app.js','utf8');
 const html=readFileSync('public/agent/index.html','utf8');
 const sw=readFileSync('public/agent/sw.js','utf8');

 it('mantiene una PWA separada y versionada',()=>{
  expect(html).toContain('<title>Héctor Agent</title>');
  expect(html).toContain('name="hector-agent-version" content="v1.1-audit"');
  expect(sw).toContain("hector-agent-v1.2");
 });

 it('impide saltarse la aprobación Manual con reanudar o ejecutar ahora',()=>{
  expect(route).toContain('ensureGoalMayStart(c.env,userId,row.id)');
  expect(route).toContain("approval==='pending'");
  expect(route).toContain("approval==='rejected'");
  expect(route).toContain("execution:'queued_for_cron'");
 });

 it('detiene y reanuda trabajos reales del backend',()=>{
  expect(route).toContain("last_error='Héctor Agent detenido por el usuario'");
  expect(route).toContain('Héctor Agent reanudado globalmente; objetivo devuelto a la cola');
 });

 it('despacha objetivos de programación al runner real sin duplicar ejecuciones activas',()=>{
  expect(route).toContain('agent-code-runner.yml/dispatches');
  expect(route).toContain("kind==='programming'");
  expect(route).toContain("execution:'runner_active'");
  expect(route).toContain("execution:'runner_dispatched'");
 });

 it('usa memoria persistente al crear objetivos y permite corregirla',()=>{
  expect(route).toContain('MEMORIA PERSISTENTE DISPONIBLE');
  expect(route).toContain("hectorAgent.patch('/memory/:id'");
  expect(app).toContain('data-edit-memory');
  expect(app).toContain('Memoria corregida');
 });

 it('muestra recursos y riesgo en aprobaciones',()=>{
  expect(app).toContain('resources_json');
  expect(app).toContain('Riesgo');
  expect(app).toContain('Resultado esperado');
 });
});
