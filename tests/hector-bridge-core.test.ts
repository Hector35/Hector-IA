import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const route=read('worker/routes/hector-bridge.ts');
const entry=read('worker/secure-entry.ts');
const context=read('worker/lib/context.ts');

describe('Héctor Bridge Core',()=>{
 it('mounts a dedicated authenticated API without changing the three PWA routes',()=>{
  expect(entry).toContain("bridgeApi.route('/api/hector-bridge',hectorBridge)");
  expect(entry).toContain("url.pathname.startsWith('/api/hector-bridge')");
  expect(route).toContain("hectorBridge.use('*',requireAuth)");
  expect(entry).toContain("url.pathname==='/agent/'");
  expect(entry).not.toContain("'/turno-rx/'");
 });

 it('exposes the five Bridge surfaces through one core',()=>{
  expect(route).toContain("hectorBridge.post('/memory/search'");
  expect(route).toContain("hectorBridge.post('/memory/write'");
  expect(route).toContain("hectorBridge.get('/tools/list'");
  expect(route).toContain("hectorBridge.post('/tools/execute'");
  expect(route).toContain("hectorBridge.post('/jobs/create'");
 });

 it('reuses semantic memory instead of creating another retrieval engine',()=>{
  expect(route).toContain('loadContextPack');
  expect(context).toContain('rankSemanticMemories');
  expect(context).toContain('memory_embeddings');
 });

 it('creates persistent jobs on the existing Agent runtime and preserves manual approval',()=>{
  expect(route).toContain("INSERT INTO work_jobs");
  expect(route).toContain("INSERT INTO hector_agent_goals");
  expect(route).toContain("cfg.autonomy_mode==='manual'");
  expect(route).toContain("INSERT INTO hector_agent_approvals");
  expect(route).toContain("queued_for_cron");
 });

 it('keeps credentials out of Bridge memory and restricts the remote inspector',()=>{
  expect(route).not.toMatch(/secretRef|api[_-]?key|authorization\s*:/i);
  expect(route).toContain("url.protocol!=='https:'");
  expect(route).toContain('url.username||url.password');
  expect(route).toContain("'Hector-Bridge-PWA-Inspector/1.0'");
 });
});