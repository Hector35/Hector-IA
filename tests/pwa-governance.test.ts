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

describe('canonical PWA governance with advisory cross-chat coordination',()=>{
 it('defines exactly the three authorized installable PWAs',()=>{
  expect(registry.installablePwas.map((pwa:any)=>pwa.id)).toEqual(['hector-os','hector-agent','pendientes']);
  expect(registry.installablePwas.map((pwa:any)=>pwa.canonicalPath)).toEqual(['/','/agent/','/turno-rx/']);
  expect(registry.installablePwas.find((pwa:any)=>pwa.id==='pendientes').protected).toBe(true);
 });

 it('keeps cross-chat coordination advisory without weakening the PWA boundary',()=>{
  expect(registry.coordination.mode).toBe('advisory');
  expect(registry.coordination.sharedLedger).toContain('/issues/958');
  expect(registry.creationRules.join(' ')).toContain('exactly three canonical installable PWAs');
  expect(registry.creationRules.join(' ')).toContain('approvedNewPwa=true');
  expect(registry.creationRules.join(' ')).toContain('Claims and shared-context records remain advisory');
 });

 it('classifies Bridge and Context Hub as shared services rather than extra PWAs',()=>{
  const bridge=registry.sharedSurfaces.find((item:any)=>item.id==='hector-bridge');
  const context=registry.sharedSurfaces.find((item:any)=>item.id==='context-hub');
  expect(bridge.ownerPwa).toBe('hector-os');
  expect(bridge.canonicalUi).toBe('/bridge.html');
  expect(bridge.auxiliaryUi).toContain('/bridge-core.html');
  expect(context.kind).toBe('backend-service');
  expect(context.ownerPwa).toBe('hector-os');
 });

 it('keeps same-origin installable manifests limited to the registered three',()=>{
  expect(manifests('public/')).toEqual(['agent/manifest.webmanifest','manifest.webmanifest','turno-rx/manifest.webmanifest']);
  for(const pwa of registry.installablePwas){
   const path=`public${pwa.manifest}`.replaceAll('//','/');
   expect(existsSync(new URL(path,root))).toBe(true);
  }
 });

 it('teaches agents the distinction between advisory claims and explicit PWA authorization',()=>{
  const agents=read('AGENTS.md'),skills=read('worker/agent/skills.ts');
  expect(agents).toContain('Claims are advisory');
  expect(agents).toContain('requires explicit user approval');
  expect(skills).toContain('COORDINACIÓN CANÓNICA DE SUPERFICIES');
  expect(skills).toContain('Autorizar una función o corrección NO autoriza una nueva PWA');
  expect(skills).toContain('claims de Cross-Chat Sync son señales consultivas, no locks');
 });

 it('overrides advisory migration wording with the explicit PWA boundary in the next migration',()=>{
  const migration=read('migrations/0046_restore_explicit_pwa_approval.sql');
  expect(migration).toContain('Exactly three installable PWAs are authorized');
  expect(migration).toContain('approvedNewPwa=true');
  expect(migration).toContain('Claims are not locks');
  expect(migration).toContain('does not override separate explicit-authorization boundaries');
 });

 it('enforces explicit new-PWA approval at the PWA Factory boundary',()=>{
  const factory=read('worker/routes/pwa-factory.ts');
  expect(factory).toContain('approvedNewPwa');
  expect(factory).toContain('approvalReason');
  expect(factory).toContain('pwa_registry_reuse_required');
  expect(factory).toContain('pwa_explicit_approval_reason_required');
  expect(factory).toContain('coordinationHint');
 });

 it('keeps cross-chat hydration intact',()=>{
  const context=read('worker/lib/context.ts');
  expect(context).toContain('crossConversationMessages');
  expect(context).toContain('chat_sync_commits');
  expect(context).toContain('context_hub_records');
  expect(context).toContain('SEÑALES RELEVANTES DE OTROS CHATS/AGENTES');
  expect(context).toContain('ESTADO COMPARTIDO DEL PROYECTO');
 });
});
