import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v61 carga sin errores de sintaxis y antes de app cuando debe interceptar visión',()=>{
  const floor=readFileSync('public/turno-rx/floor-photo-reconcile-v61.js','utf8');
  const gesture=readFileSync('public/turno-rx/row-actions-v61.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');

  expect(()=>new Function(floor)).not.toThrow();
  expect(()=>new Function(gesture)).not.toThrow();
  expect(index.indexOf('floor-photo-reconcile-v61.js?v=61')).toBeGreaterThan(-1);
  expect(index.indexOf('floor-photo-reconcile-v61.js?v=61')).toBeLessThan(index.indexOf('app-v16.js?v=58'));
  expect(index).toContain('row-actions-v61.css?v=61');
  expect(index).toContain('row-actions-v61.js?v=61');
});

test('v61 reconcilia solo pizarrones de Piso y reemplaza conflictos por origen',()=>{
  const floor=readFileSync('public/turno-rx/floor-photo-reconcile-v61.js','utf8');

  expect(floor).toContain('floorCandidates.length < 2');
  expect(floor).toContain("plain(row?.category) === 'piso'");
  expect(floor).toContain('replaceIds.add');
  expect(floor).toContain("localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRows))");
  expect(floor).toContain("source: 'floor-photo-reconcile-v61'");
  expect(floor).toContain("url.includes('/api/turno-rx/vision')");
});

test('v61 replica feedback verde en RX TAC USG y mueve undo fuera de Realizados',()=>{
  const css=readFileSync('public/turno-rx/row-actions-v61.css','utf8');
  const js=readFileSync('public/turno-rx/row-actions-v61.js','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');

  expect(js).toContain(".imaging-row.patient-row[data-id]");
  expect(js).toContain('v61-swipe-preview');
  expect(js).toContain('v61-swipe-armed');
  expect(css).toContain('rgba(29, 137, 91, .62)');
  expect(css).toContain('body.v60-realized-open .v60-status-undo');
  expect(css).toContain('bottom: auto');
  expect(sw).toContain('turno-rx-shell-v58-tac-live-interaction-hotfix');
  expect(sw).toContain('/turno-rx/floor-photo-reconcile-v61.js?v=61');
});
