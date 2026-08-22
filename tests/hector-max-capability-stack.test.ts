import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {classifyCapabilityFailure,mayFallback} from '../worker/lib/capability-router';

const root=new URL('../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');

describe('Héctor maximum capability stack',()=>{
 it('persists machine auth, encrypted credential material and capability traces',()=>{
  const migration=read('migrations/0047_max_capability_stack.sql');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS external_access_tokens');
  expect(migration).toContain('token_hash TEXT NOT NULL UNIQUE');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS hector_credential_secret_blobs');
  expect(migration).toContain('ciphertext_b64');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS capability_execution_traces');
  expect(migration).toContain('owner_autonomy_nonblocking');
 });

 it('supports bearer machine auth without replacing interactive session auth',()=>{
  const auth=read('worker/lib/auth.ts');
  expect(auth).toContain("getCookie(c,'hector_session')");
  expect(auth).toContain("match(/^Bearer\\s+(.+)$/i)");
  expect(auth).toContain('external_access_tokens');
  expect(auth).toContain("authMethod','external_token'");
  expect(auth).toContain('sha256(token)');
 });

 it('encrypts secret material and supports provider-approved OAuth refresh',()=>{
  const broker=read('worker/lib/credential-broker.ts');
  expect(broker).toContain("name:'AES-GCM'");
  expect(broker).toContain('additionalData:aad');
  expect(broker).toContain('tokenEndpoint');
  expect(broker).toContain('allowedHosts');
  expect(broker).toContain("grant_type:'refresh_token'");
  expect(broker).not.toContain('console.log');
 });

 it('classifies fallbacks and refuses to route around policy/permanent failures',()=>{
  expect(classifyCapabilityFailure({status:429,error:'rate limit'})).toBe('rate_limit');
  expect(classifyCapabilityFailure({status:503,error:'unavailable'})).toBe('temporary');
  expect(classifyCapabilityFailure({status:401,error:'token expired'})).toBe('credential');
  expect(classifyCapabilityFailure({status:404,error:'missing tool'})).toBe('capability_missing');
  expect(classifyCapabilityFailure({status:403,error:'policy prohibited'})).toBe('policy');
  expect(classifyCapabilityFailure({error:'blocked by provider policy'})).toBe('policy');
  expect(mayFallback('temporary')).toBe(true);
  expect(mayFallback('rate_limit')).toBe(true);
  expect(mayFallback('credential')).toBe(true);
  expect(mayFallback('capability_missing')).toBe(true);
  expect(mayFallback('policy')).toBe(false);
  expect(mayFallback('permanent')).toBe(false);
 });

 it('exposes one authenticated MCP surface over the shared Bridge stack',()=>{
  const mcp=read('worker/routes/hector-mcp.ts'),secure=read('worker/secure-entry.ts');
  expect(mcp).toContain("method==='initialize'");
  expect(mcp).toContain("method==='tools/list'");
  expect(mcp).toContain("method==='tools/call'");
  for(const tool of ['context_search','context_upsert','context_sync_bootstrap','capability_execute','job_create','pwa_inspect'])expect(mcp).toContain(`name:'${tool}'`);
  expect(secure).toContain("mcpApi.route('/mcp',hectorMcp)");
  expect(secure).toContain("url.pathname.startsWith('/mcp')");
  expect(secure).toContain("url.pathname.startsWith('/api/hector-bridge/capabilities')");
  expect(secure).toContain("url.pathname.startsWith('/api/hector-bridge/access')");
 });

 it('makes memory self-correcting while preserving historical records',()=>{
  const memory=read('worker/routes/hector-memory.ts'),context=read('worker/lib/context.ts');
  expect(memory).toContain("status='superseded'");
  expect(memory).toContain('supersedes_id');
  expect(memory).toContain("AND id<>?");
  expect(memory).toContain('context_reconcile');
  expect(context).toContain("chr.id IS NULL OR chr.status='active'");
 });

 it('provides unified capability execution and observability',()=>{
  const route=read('worker/routes/hector-capabilities.ts'),router=read('worker/lib/capability-router.ts');
  expect(route).toContain("hectorCapabilities.post('/execute'");
  expect(route).toContain("hectorCapabilities.get('/traces'");
  expect(route).toContain('allowedHosts');
  expect(router).toContain('capability_execution_traces');
  expect(router).toContain('markCapabilityRouteResult');
  expect(router).toContain('mayFallback(failureClass)');
 });

 it('keeps persistent execution and verification as existing shared capabilities',()=>{
  const bridge=read('worker/routes/hector-bridge.ts'),worker=read('worker/index.ts');
  expect(bridge).toContain("execution:manual?'waiting_approval':'queued_for_cron'");
  expect(worker).toContain('saveResumeCheckpoint');
  expect(worker).toContain('planVerification');
  expect(worker).toContain("status='completed'");
 });

 it('keeps PWA coordination intelligent and nonblocking',()=>{
  const factory=read('worker/routes/pwa-factory.ts'),registry=read('config/pwa-registry.json'),agents=read('AGENTS.md');
  expect(factory).not.toContain('approvedNewPwa');
  expect(factory).not.toContain('approvalReason');
  expect(factory).not.toContain('pwa_registry_reuse_required');
  expect(factory).toContain('coordinationHint');
  expect(factory).toContain('architectureDecision');
  expect(registry).toContain('not a hard maximum');
  expect(registry).toContain('Do not require approvedNewPwa');
  expect(agents).toContain('not a permission system');
 });
});
