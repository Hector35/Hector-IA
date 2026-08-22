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

describe('canonical PWA governance',()=>{
 it('defines exactly the three agreed installable PWAs',()=>{
  expect(registry.installablePwas.map((pwa:any)=>pwa.id)).toEqual(['hector-os','hector-agent','pendientes']);
  expect(registry.installablePwas.map((pwa:any)=>pwa.canonicalPath)).toEqual(['/','/agent/','/turno-rx/']);
  expect(registry.installablePwas.find((pwa:any)=>pwa.id==='pendientes').protected).toBe(true);
 });

 it('classifies Bridge and Context Hub as shared services instead of new PWAs',()=>{
  const bridge=registry.sharedSurfaces.find((item:any)=>item.id==='hector-bridge');
  const context=registry.sharedSurfaces.find((item:any)=>item.id==='context-hub');
  expect(bridge.ownerPwa).toBe('hector-os');
  expect(bridge.canonicalUi).toBe('/bridge.html');
  expect(bridge.auxiliaryUi).toContain('/bridge-core.html');
  expect(context.kind).toBe('backend-service');
  expect(context.ownerPwa).toBe('hector-os');
 });

 it('keeps same-origin installable manifests limited to registered PWAs',()=>{
  expect(manifests('public/')).toEqual(['agent/manifest.webmanifest','manifest.webmanifest','turno-rx/manifest.webmanifest']);
  for(const pwa of registry.installablePwas){
   const path=`public${pwa.manifest}`.replaceAll('//','/');
   expect(existsSync(new URL(path,root))).toBe(true);
  }
 });

 it('makes the registry mandatory context for humans and agents',()=>{
  const agents=read('AGENTS.md'),skills=read('worker/agent/skills.ts'),planner=read('worker/agent/planner.ts');
  expect(agents).toContain('config/pwa-registry.json');
  expect(agents).toContain('exactly three canonical installable PWAs');
  expect(skills).toContain('SURFACE_GOVERNANCE_CONTRACT');
  expect(skills).toContain('Autorizar una función o corrección NO equivale');
  expect(planner).toContain('SURFACE_GOVERNANCE_CONTRACT');
 });

 it('seeds the same decision into permanent shared system context',()=>{
  const migration=read('migrations/0043_pwa_governance_context.sql');
  expect(migration).toContain('pwa_canonical_registry');
  expect(migration).toContain('pwa_creation_governance');
  expect(migration).toContain('cross_agent_coordination');
  expect(migration).toContain('config/pwa-registry.json');
 });

 it('requires explicit new-PWA approval at the PWA Factory boundary',()=>{
  const factory=read('worker/routes/pwa-factory.ts');
  expect(factory).toContain('approvedNewPwa');
  expect(factory).toContain('pwa_registry_reuse_required');
  expect(factory).toContain('config/pwa-registry.json');
 });
});
