import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v68 detecta fingerprint idéntico sin confundir fotografías distintas',async()=>{
  const source=readFileSync('public/turno-rx/photo-dedupe-v68.js','utf8');
  const moduleUrl=`data:text/javascript;base64,${Buffer.from(`globalThis.window={fetch:async()=>{}};globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,body:null};globalThis.MutationObserver=class{observe(){}};globalThis.queueMicrotask=()=>{};globalThis.localStorage={getItem:()=>\"[]\"};globalThis.File=class{};globalThis.FormData=class{};globalThis.Response=class{};${source}`).toString('base64')}`;
  const mod=await import(moduleUrl);
  expect(mod.hasDuplicateFingerprint([{imageFingerprint:'abc'},{imageFingerprint:'def'}],'abc')).toBe(true);
  expect(mod.hasDuplicateFingerprint([{imageFingerprint:'abc'}],'xyz')).toBe(false);
  expect(mod.hasDuplicateFingerprint([], 'abc')).toBe(false);
});

test('v69 se carga antes del controlador consolidado y evita otra llamada de visión sin producir error vacío',()=>{
  const source=readFileSync('public/turno-rx/photo-dedupe-v68.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');
  expect(source).toContain("url.includes('/api/turno-rx/vision')");
  expect(source).toContain("X-Pendientes-Duplicate");
  expect(source).toContain('Foto duplicada · sin cambios');
  expect(source).toContain('duplicatePatientsForFingerprint');
  expect(source).toContain('JSON.stringify({patients,duplicatePhoto:true})');
  expect(index.indexOf('photo-dedupe-v68.js?v=69')).toBeGreaterThan(-1);
  expect(index.indexOf('photo-dedupe-v68.js?v=69')).toBeLessThan(index.indexOf('stability.js?v=20260818.1'));
  expect(sw).toContain('/turno-rx/photo-dedupe-v68.js?v=69');
});
