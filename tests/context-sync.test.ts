import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0044_cross_chat_sync.sql');
const route=read('worker/routes/context-sync.ts');
const secure=read('worker/secure-entry.ts');
const agents=read('AGENTS.md');

describe('cross-chat context synchronization',()=>{
 it('persists sessions, commits and exclusive active claims',()=>{
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS chat_sync_sessions');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS chat_sync_commits');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS coordination_claims');
  expect(migration).toContain("WHERE status='active'");
  expect(migration).toContain('cross_chat_sync_protocol');
 });

 it('requires authentication and exposes the full sync lifecycle',()=>{
  expect(route).toContain("contextSync.use('*',requireAuth)");
  for(const endpoint of ["'/bootstrap'","'/commit'","'/claim'","'/release'","'/status'"])expect(route).toContain(endpoint);
  expect(route).toContain('loadContextPack');
  expect(route).toContain('coordination_scope_claimed');
 });

 it('publishes summaries and decisions back into shared Context Hub memory',()=>{
  expect(route).toContain("'cross-chat-sync'");
  expect(route).toContain("'decision'");
  expect(route).toContain('context_hub_records');
  expect(route).toContain('visibleToFutureSessions:true');
 });

 it('mounts sync behind the existing security boundary without bypassing worker fallback',()=>{
  expect(secure).toContain("contextSyncApi.route('/api/context-sync',contextSync)");
  expect(secure).toContain("url.pathname.startsWith('/api/context-sync')");
  expect(secure).toContain('worker.fetch(new Request(request,{headers}),env,ctx)');
  expect(secure).toContain('cross_site_mutation_denied');
 });

 it('tells repository agents to bootstrap, claim, commit and release shared context',()=>{
  expect(agents).toContain('Shared context / cross-chat coordination');
  expect(agents).toContain('POST /bootstrap');
  expect(agents).toContain('POST /claim');
  expect(agents).toContain('POST /commit');
  expect(agents).toContain('POST /release');
 });
});
