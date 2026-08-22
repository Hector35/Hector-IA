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

describe('canonical PWA architecture with advisory cross-chat coordination',()=>{
 it('records the three current canonical installable PWAs without turning the registry into a hard maximum',()=>{
  expect(registry.installablePwas.map((pwa:any)=>pwa.id)).toEqual(['hector-os','hector-agent','pendientes']);
  expect(registry.installablePwas.map((pwa:any)=>pwa.canonicalPath)).toEqual(['/','/agent/','/turno-rx/']);
  expect(registry.installablePwas.find((pwa:any)=>pwa.id==='pendientes').protected).toBe(true);
  expect(registry.creationRules.join(' ')).toContain('not a hard maximum');
 });

 it('keeps coordination and architecture recommendations advisory',()=>{
  expect(registry.coordination.mode).toBe('advisory');
  expect(registry.coordination.sharedLedger).toContain('/issues/958');
  expect(registry.creationRules.join(' ')).toContain('Do not require approvedNewPwa');
  expect(registry.creationRules.join(' ')).toContain('advisory coordination signals');
 });

 it('classifies Bridge, MCP and Context Hub as shared services rather than extra PWAs',()=>{
  const bridge=registry.sharedSurfaces.find((item:any)=>item.id==='hector-bridge');
  const context=registry.sharedSurfaces.find((item:any)=>item.id==='context-hub');
  expect(bridge.ownerPwa).toBe('hector-os');
  expect(bridge.canonicalUi).toBe('/bridge.html');
  expect(bridge.auxiliaryUi).toContain('/bridge-core.html');
  expect(bridge.remoteMcp).toBe('/mcp');
  expect(context.kind).toBe('backend-service');
  expect(context.ownerPwa).toBe('hector-os');
 });

 it('keeps same-origin installable manifests limited to the currently registered three',()=>{
  expect(manifests('public/')).toEqual(['agent/manifest.webmanifest','manifest.webmanifest','turno-rx/manifest.webmanifest']);
  for(const pwa of registry.installablePwas){
   const path=`public${pwa.manifest}`.replaceAll('//','/');
   expect(existsSync(new URL(path,root))).toBe(true);
  }
 });

 it('teaches agents to use context as intelligence rather than a permission system',()=>{
  const agents=read('AGENTS.md'),skills=read('worker/agent/skills.ts');
  expect(agents).toContain('Claims are presence signals, not locks');
  expect(agents).toContain('not a permission system');
  expect(agents).toContain('Do not require `approvedNewPwa`');
  expect(skills).toContain('COORDINACIÓN CANÓNICA DE SUPERFICIES');
  expect(skills).toContain('no locks ni permisos');
  expect(skills).toContain('No inventes approvedNewPwa');
 });

 it('uses migration 0047 to supersede the temporary hard-gate wording from 0046',()=>{
  const oldMigration=read('migrations/0046_restore_explicit_pwa_approval.sql');
  const newMigration=read('migrations/0047_max_capability_stack.sql');
  expect(oldMigration).toContain('approvedNewPwa=true');
  expect(newMigration).toContain('temporary hard PWA gate');
  expect(newMigration).toContain('not a hard maximum or permission gate');
  expect(newMigration).toContain('Do not require approvedNewPwa');
  expect(newMigration).toContain('owner_autonomy_nonblocking');
 });

 it('lets PWA Factory make an informed architecture decision without an internal approval token',()=>{
  const factory=read('worker/routes/pwa-factory.ts');
  expect(factory).not.toContain('approvedNewPwa');
  expect(factory).not.toContain('approvalReason');
  expect(factory).not.toContain('pwa_registry_reuse_required');
  expect(factory).not.toContain('pwa_explicit_approval_reason_required');
  expect(factory).toContain('coordinationHint');
  expect(factory).toContain('architectureDecision');
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
