import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {describe,expect,it} from 'vitest';

const root=new URL('../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');
const registry=JSON.parse(read('config/pwa-registry.json'));

function manifests(dir:string):string[]{
 const absolute=new URL(dir,root).pathname;
 const out:string[]=[];
 const walk=(path:string)=>{
  for(const name of readdirSync(path)){
   const next=join(path,name);
   if(statSync(next).isDirectory())walk(next);
   else if(name==='manifest.webmanifest')out.push(relative(absolute,next).replaceAll('\\','/'));
  }
 };
 walk(absolute);
 return out.sort();
}

describe('PWA architecture with advisory cross-chat coordination',()=>{
 it('records the three current installable PWAs without turning the registry into permission law',()=>{
  expect(registry.installablePwas.map((pwa:any)=>pwa.id)).toEqual(['hector-os','hector-agent','pendientes']);
  expect(registry.installablePwas.map((pwa:any)=>pwa.canonicalPath)).toEqual(['/','/agent/','/turno-rx/']);
  expect(registry.installablePwas.find((pwa:any)=>pwa.id==='pendientes').protected).toBe(true);
  expect(registry.principle).toContain('not an internal permission gate');
 });

 it('keeps coordination advisory and permits evidence-based architectural change',()=>{
  expect(registry.coordination.mode).toBe('advisory');
  expect(registry.coordination.sharedLedger).toContain('/issues/958');
  const rules=registry.creationRules.join(' ');
  expect(rules).toContain('new PWA or surface may be created');
  expect(rules).toContain('without an internal approval token');
  expect(rules).toContain('advisory coordination signals');
  expect(rules).not.toContain('approvedNewPwa=true');
 });

 it('classifies Bridge, MCP and Context Hub as shared capabilities rather than extra PWAs',()=>{
  const bridge=registry.sharedSurfaces.find((item:any)=>item.id==='hector-bridge');
  const context=registry.sharedSurfaces.find((item:any)=>item.id==='context-hub');
  expect(bridge.ownerPwa).toBe('hector-os');
  expect(bridge.canonicalUi).toBe('/bridge.html');
  expect(bridge.auxiliaryUi).toContain('/bridge-core.html');
  expect(bridge.remoteMcp).toBe('/mcp');
  expect(context.kind).toBe('backend-service');
  expect(context.ownerPwa).toBe('hector-os');
 });

 it('keeps current same-origin installable manifests registered and isolated',()=>{
  expect(manifests('public/')).toEqual(['agent/manifest.webmanifest','manifest.webmanifest','turno-rx/manifest.webmanifest']);
  for(const pwa of registry.installablePwas){
   const path=`public${pwa.manifest}`.replaceAll('//','/');
   expect(existsSync(new URL(path,root))).toBe(true);
  }
 });

 it('teaches agents that context informs decisions but does not grant or deny internal permission',()=>{
  const agents=read('AGENTS.md'),skills=read('worker/agent/skills.ts');
  expect(agents).toContain('Shared context is intelligence infrastructure, not a permission system');
  expect(agents).toContain('Do not invent internal approval gates');
  expect(agents).toContain('does **not** require `approvedNewPwa`');
  expect(skills).toContain('COORDINACIÓN CANÓNICA DE SUPERFICIES');
  expect(skills).toContain('No exijas approvedNewPwa');
  expect(skills).toContain('claims de Context Sync son señales consultivas, no locks');
 });

 it('supersedes the historical hard-gate context without deleting migration history',()=>{
  const oldMigration=read('migrations/0046_restore_explicit_pwa_approval.sql');
  const newMigration=read('migrations/0047_max_capability_stack.sql');
  expect(oldMigration).toContain('approvedNewPwa=true');
  expect(newMigration).toContain('supersedes the hard PWA gate wording');
  expect(newMigration).toContain('Do not require approvedNewPwa');
  expect(newMigration).toContain('owner_autonomy_nonblocking');
 });

 it('does not enforce an internal PWA approval token at PWA Factory',()=>{
  const factory=read('worker/routes/pwa-factory.ts');
  expect(factory).toContain('coordinationHint');
  expect(factory).toContain('advisoryOnly:true');
  expect(factory).not.toContain('approvedNewPwa');
  expect(factory).not.toContain('approvalReason');
  expect(factory).not.toContain('pwa_registry_reuse_required');
  expect(factory).toContain("k.startsWith(PREFIX)&&k!==CACHE");
 });

 it('keeps cross-chat hydration intact',()=>{
  const context=read('worker/lib/context.ts');
  expect(context).toContain('crossConversationMessages');
  expect(context).toContain('chat_sync_commits');
  expect(context).toContain('context_hub_records');
  expect(context).toContain('SEÑALES RELEVANTES DE OTROS CHATS/AGENTES');
  expect(context).toContain('ESTADO COMPARTIDO DEL PROYECTO');
  expect(context).toContain("chr.status='active'");
 });
});
