import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v72 permite elegir categoría manual sin quedar forzada por la pestaña activa',()=>{
  const patch=readFileSync('public/turno-rx/manual-category-v72.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');

  expect(()=>new Function(patch)).not.toThrow();
  expect(patch).toContain("'Rayos X': 'RX'");
  expect(patch).toContain("'TAC': 'TAC'");
  expect(patch).toContain("'Ultrasonido': 'USG'");
  expect(patch).toContain("'Piso': 'Piso'");
  expect(patch).toContain('option.value = \'Piso\'');
  expect(patch).toContain("window.addEventListener('submit'");
  expect(index).toContain('/turno-rx/manual-category-v72.js?v=72');
  expect(index.indexOf('/turno-rx/stability.js?v=20260818.1')).toBeLessThan(index.indexOf('/turno-rx/manual-category-v72.js?v=72'));
  expect(sw).toContain("const CACHE = 'pendientes-shell-20260818-7'");
  expect(sw).toContain('/turno-rx/manual-category-v72.js?v=72');
});

test('v72 conserva el controlador consolidado y no reactiva listeners legacy',()=>{
  const index=readFileSync('public/turno-rx/index.html','utf8');
  expect(index).toContain('/turno-rx/stability.js?v=20260818.1');
  expect(index).toContain('LEGACY TEST REFERENCES ONLY');
  expect(index).not.toMatch(/<script[^>]+src="\/turno-rx\/(?:floor-workflow-v42|tac-flow-v42|row-actions-v60|row-actions-v61|manual-quick-v38)\.js/);
});
