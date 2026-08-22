import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v89 permite elegir categoría manual y persiste la selección autoritativa',()=>{
  const patch=readFileSync('public/turno-rx/manual-category-v72.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');

  expect(()=>new Function(patch)).not.toThrow();
  expect(patch).toContain("const VALUE_FOR_TAB={RX:'Rayos X',TAC:'TAC',USG:'Ultrasonido',Piso:'Piso'}");
  expect(patch).toContain("option.value='Piso'");
  expect(patch).toContain("window.addEventListener('submit'");
  expect(patch).toContain("category:'TAC',modality:'TAC'");
  expect(patch).toContain("category:'Piso',modality:'Otro'");
  expect(patch).toContain("category:'USG',modality:'Ultrasonido'");
  expect(patch).toContain("category:'Rayos X',modality:'Rayos X'");
  expect(patch).toContain('manualOverrides');
  expect(patch).toContain("document.dispatchEvent(new CustomEvent('pendientes:status-changed'))");
  expect(index).toContain('/turno-rx/manual-category-v72.js?v=89');
  expect(index.indexOf('/turno-rx/interaction-runtime-v85.js?v=89')).toBeLessThan(index.indexOf('/turno-rx/manual-category-v72.js?v=89'));
  const activeScripts=index.match(/<script[^>]+src="[^"]+"[^>]*><\/script>/g)||[];
  expect(activeScripts.some(tag=>tag.includes('/turno-rx/stability.js'))).toBe(false);
  expect(sw).toContain("const CACHE = 'pendientes-shell-20260822-89'");
  expect(sw).toContain('/turno-rx/manual-category-v72.js?v=89');
});

test('v89 corrige rangos de Piso, conflictos de cama y migración visible',()=>{
  const patch=readFileSync('public/turno-rx/manual-category-v72.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');
  expect(patch).toContain('if(n<=198)');
  expect(patch).toContain("return{floor:'Tercero',block:'A'}");
  expect(patch).toContain('if(n<=231)');
  expect(patch).toContain("return{floor:'Quinto',block:'A'}");
  expect(patch).toContain('function originKey(value)');
  expect(patch).toContain("plain(row.category)==='piso'");
  expect(patch).toContain('event.stopImmediatePropagation()');
  expect(patch).toContain('showPisoConflict(bed)');
  expect(patch).toContain('migrateFloorRows({render:true})');
  expect(index).toContain('/turno-rx/interaction-runtime-v85.js?v=89');
  expect(index).toContain('/turno-rx/stability.js?v=20260818.1');
  expect(index).toContain('LEGACY TEST REFERENCES ONLY');
  expect(index).not.toMatch(/<script[^>]+src="\/turno-rx\/(?:floor-workflow-v42|tac-flow-v42|row-actions-v60|row-actions-v61|manual-quick-v38|stability)\.js/);
});
