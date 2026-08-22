import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0044_cross_chat_sync.sql');
const advisoryMigration=read('migrations/0045_shared_context_intelligent_coordination.sql');
const route=read('worker/routes/context-sync.ts');
const secure=read('worker/secure-entry.ts');
const agents=read('AGENTS.md');

describe('cross-chat context synchronization',()=>{
 it('persists sessions and commits while replacing exclusive claims with advisory overlap',()=>{
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS chat_sync_sessions');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS chat_sync_commits');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS coordination_claims');
  expect(advisoryMigration).toContain('DROP INDEX IF EXISTS idx_coordination_claim_active_scope');
  expect(advisoryMigration).toContain('idx_coordination_claim_scope_active');
  expect(advisoryMigration).toContain('Claims are not locks');
 });

 it('requires authentication and exposes the full sync lifecycle without a scope lock',()=>{
  expect(route).toContain("contextSync.use('*',requireAuth)");
  for(const endpoint of ["'/bootstrap'","'/commit'","'/claim'","'/release'","'/status'"])expect(route).toContain(endpoint);
  expect(route).toContain('loadContextPack');
  expect(route).toContain('advisory:true');
  expect(route).toContain('overlaps');
  expect(route).not.toContain('coordination_scope_claimed');
 });

 it('publishes summaries and decisions back into shared Context Hub memory',()=>{
  expect(route).toContain("'cross-chat-sync'");
  expect(route).toContain("'decision'");
  expect(route).toContain('context_hub_records');
  expect(route).toContain('visibleToFutureSessions:true');
 });

 it('returns cross-conversation context and marks coordination as advisory',()=>{
  expect(route).toContain('crossConversationMessages');
  expect(route).toContain("mode:'advisory'");
  expect(route).toContain("coordinationMode:'advisory'");
  expect(route).toContain('Claims y registros informan decisiones; no bloquean trabajo paralelo');
 });

 it('mounts sync behind the existing security boundary without bypassing worker fallback',()=>{
  expect(secure).toContain("contextSyncApi.route('/api/context-sync',contextSync)");
  expect(secure).toContain("url.pathname.startsWith('/api/context-sync')");
  expect(secure).toContain('worker.fetch(new Request(request,{headers}),env,ctx)');
  expect(secure).toContain('cross_site_mutation_denied');
 });

 it('tells repository agents to bootstrap, announce, commit and release shared context without locking others',()=>{
  expect(agents).toContain('Shared context / cross-chat coordination');
  expect(agents).toContain('POST /bootstrap');
  expect(agents).toContain('POST /claim');
  expect(agents).toContain('presence signals, not locks');
  expect(agents).toContain('POST /commit');
  expect(agents).toContain('POST /release');
  expect(agents).toContain('not a permission system');
 });
});
