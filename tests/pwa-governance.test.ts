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

describe('intelligent PWA coordination',()=>{
 it('records the three current canonical PWAs without treating the list as immutable',()=>{
  expect(registry.installablePwas.map((pwa:any)=>pwa.id)).toEqual(['hector-os','hector-agent','pendientes']);
  expect(registry.installablePwas.map((pwa:any)=>pwa.canonicalPath)).toEqual(['/','/agent/','/turno-rx/']);
  expect(registry.installablePwas.find((pwa:any)=>pwa.id==='pendientes').protected).toBe(true);
  expect(registry.coordination.mode).toBe('advisory');
  expect(registry.coordination.sharedLedger).toContain('/issues/958');
 });

 it('classifies Bridge and Context Hub as current shared services',()=>{
  const bridge=registry.sharedSurfaces.find((item:any)=>item.id==='hector-bridge');
  const context=registry.sharedSurfaces.find((item:any)=>item.id==='context-hub');
  expect(bridge.ownerPwa).toBe('hector-os');
  expect(bridge.canonicalUi).toBe('/bridge.html');
  expect(bridge.auxiliaryUi).toContain('/bridge-core.html');
  expect(context.kind).toBe('backend-service');
  expect(context.ownerPwa).toBe('hector-os');
 });

 it('keeps current same-origin installable manifests mapped to registered PWAs',()=>{
  expect(manifests('public/')).toEqual(['agent/manifest.webmanifest','manifest.webmanifest','turno-rx/manifest.webmanifest']);
  for(const pwa of registry.installablePwas){
   const path=`public${pwa.manifest}`.replaceAll('//','/');
   expect(existsSync(new URL(path,root))).toBe(true);
  }
 });

 it('makes shared context mandatory input to judgment, not a permission gate',()=>{
  const agents=read('AGENTS.md'),skills=read('worker/agent/skills.ts'),planner=read('worker/agent/planner.ts');
  expect(agents).toContain('Shared context first');
  expect(agents).toContain('issue #958');
  expect(agents).toContain('not a permission system');
  expect(skills).toContain('COORDINACIÓN INTELIGENTE DE SUPERFICIES');
  expect(skills).toContain('No uses el registro como permiso ni como freno');
  expect(planner).toContain('Shared Context Ledger');
 });

 it('updates permanent system context to a cross-chat non-blocking model',()=>{
  const migration=read('migrations/0044_shared_context_intelligent_coordination.sql');
  expect(migration).toContain('shared_context_operating_model');
  expect(migration).toContain('GitHub issue #958');
  expect(migration).toContain('not be used as an artificial approval gate');
 });

 it('removes the hard approval gate from PWA Factory and returns advisory coordination instead',()=>{
  const factory=read('worker/routes/pwa-factory.ts');
  expect(factory).not.toContain('pwa_registry_reuse_required');
  expect(factory).not.toContain('approvedNewPwa');
  expect(factory).toContain('coordinationHint');
  expect(factory).toContain('advisoryOnly:true');
 });

 it('hydrates model context with signals from other conversations and Context Hub',()=>{
  const context=read('worker/lib/context.ts');
  expect(context).toContain('crossConversationMessages');
  expect(context).toContain('LIMIT 120');
  expect(context).toContain('context_hub_records');
  expect(context).toContain('SEÑALES RELEVANTES DE OTROS CHATS');
  expect(context).toContain('ESTADO COMPARTIDO DEL PROYECTO');
 });
});
