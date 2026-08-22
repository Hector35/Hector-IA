import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {credentialState,orderCapabilityRoutes,routeFailureCooldownSeconds,type HectorAgentCapabilityRoute,type HectorAgentCredential} from '../worker/lib/hector-agent-resilience';

function route(overrides:Partial<HectorAgentCapabilityRoute>):HectorAgentCapabilityRoute{
 return{
  id:'r',user_id:'u',capability:'http',provider:'worker',route_kind:'worker',endpoint_ref:null,credential_id:null,
  priority:100,enabled:1,requires_approval:0,risk:'low',failure_count:0,cooldown_until:null,last_error:null,last_success_at:null,
  ...overrides
 };
}

describe('Héctor Agent resilience broker',()=>{
 it('orders healthy fallbacks and skips routes still cooling down',()=>{
  const now=Date.parse('2026-08-22T12:00:00Z');
  const routes=orderCapabilityRoutes([
   route({id:'slow',provider:'api',priority:50,failure_count:3}),
   route({id:'best',provider:'worker',priority:10}),
   route({id:'cooling',provider:'github',priority:1,cooldown_until:'2026-08-22T12:05:00Z'}),
   route({id:'disabled',priority:0,enabled:0})
  ],now);
  expect(routes.map(x=>x.id)).toEqual(['best','slow']);
 });

 it('uses bounded exponential backoff instead of hammering a failed route',()=>{
  expect(routeFailureCooldownSeconds(1)).toBe(15);
  expect(routeFailureCooldownSeconds(2)).toBe(30);
  expect(routeFailureCooldownSeconds(20)).toBe(900);
 });

 it('can refresh an expired renewable credential but blocks a dead static credential',()=>{
  const base:HectorAgentCredential={id:'c',user_id:'u',provider:'google',auth_type:'oauth',secret_ref:'oauth:google/main',scopes_json:'[]',status:'ready',refreshable:1,expires_at:'2026-08-22T11:00:00Z',last_verified_at:null,metadata_json:'{}'};
  expect(credentialState(base,Date.parse('2026-08-22T12:00:00Z'))).toEqual({usable:true,state:'refresh_required'});
  expect(credentialState({...base,refreshable:0},Date.parse('2026-08-22T12:00:00Z'))).toEqual({usable:false,state:'expired'});
 });

 it('never stores raw credentials in the resilience API contract',()=>{
  const routeSource=readFileSync('worker/routes/hector-agent-resilience.ts','utf8');
  expect(routeSource).toContain("/^(env|oauth|vault|connector):");
  expect(routeSource).toContain('secretStored:false');
  expect(routeSource).not.toContain('passwordSchema');
 });

 it('wires approval checkpoints and runtime resume persistence',()=>{
  const migration=readFileSync('migrations/0041_hector_agent_resilience.sql','utf8');
  const index=readFileSync('worker/index.ts','utf8');
  const agent=readFileSync('worker/routes/hector-agent.ts','utf8');
  expect(migration).toContain('trg_hector_agent_approval_resume');
  expect(migration).toContain("status='resumed'");
  expect(index).toContain('saveResumeCheckpoint');
  expect(index).toContain('completeResumeCheckpoints');
  expect(agent).toContain("hectorAgent.route('/resilience',hectorAgentResilience)");
 });
});
