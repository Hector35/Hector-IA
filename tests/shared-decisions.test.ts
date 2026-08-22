import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const root=new URL('../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');
const decisions=JSON.parse(read('config/shared-decisions.json'));
const registry=JSON.parse(read('config/pwa-registry.json'));

function active(id:string){return decisions.decisions.find((item:any)=>item.id===id&&item.status==='active');}

describe('machine-readable shared decisions',()=>{
 it('declares a monotonic authoritative decision source for cross-chat reconciliation',()=>{
  expect(decisions.schemaVersion).toBe(1);
  expect(decisions.revision).toBeGreaterThanOrEqual(2026082201);
  expect(decisions.authority).toBe('latest-explicit-user-instruction');
  expect(active('cross-chat-protocol').decision).toContain('reconstruct context');
  expect(active('cross-chat-protocol').rules.join(' ')).toContain('latest explicit user instruction');
 });

 it('makes shared context advisory rather than an internal permission system',()=>{
  const decision=active('shared-context-is-intelligence-not-permission');
  expect(decision.decision).toContain('not internal permission gates or locks');
  expect(decision.supersedes).toContain('explicit-pwa-approval-gate');
 });

 it('records current PWAs as architecture, not a hard maximum',()=>{
  const pwa=active('current-pwa-architecture');
  expect(pwa.decision).toContain('not a hard maximum');
  expect(pwa.rules.join(' ')).toContain('Do not require approvedNewPwa');
  expect(registry.installablePwas.map((x:any)=>x.canonicalPath)).toEqual(['/','/agent/','/turno-rx/']);
  expect(registry.creationRules.join(' ')).toContain('not a hard maximum');
 });

 it('prevents stale internal PWA gates from being reintroduced across key runtime contracts',()=>{
  const agents=read('AGENTS.md');
  const skills=read('worker/agent/skills.ts');
  const factory=read('worker/routes/pwa-factory.ts');
  const migration=read('migrations/0047_max_capability_stack.sql');
  expect(agents).toContain('not a permission system');
  expect(agents).toContain('Do not require `approvedNewPwa`');
  expect(skills).toContain('No inventes approvedNewPwa');
  expect(factory).not.toContain('approvedNewPwa');
  expect(factory).not.toContain('approvalReason');
  expect(migration).toContain('temporary hard PWA gate');
  expect(migration).toContain('Do not require approvedNewPwa');
 });

 it('keeps external security boundaries distinct from internal coordination',()=>{
  const stack=active('maximum-capability-stack');
  expect(stack.rules.join(' ')).toContain('Do not use fallbacks to bypass mandatory external authorization');
  expect(stack.rules.join(' ')).toContain('Do not expose secrets');
  expect(stack.rules.join(' ')).toContain('Do not declare success without verification evidence');
 });
});
