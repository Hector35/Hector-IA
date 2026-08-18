import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v62 carga sin errores de sintaxis y antes de app cuando debe interceptar visión',()=>{
  const floor=readFileSync('public/turno-rx/floor-photo-reconcile-v62.js','utf8');
  const gesture=readFileSync('public/turno-rx/row-actions-v61.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');

  expect(()=>new Function(floor)).not.toThrow();
  expect(()=>new Function(gesture)).not.toThrow();
  expect(index.indexOf('floor-photo-reconcile-v62.js?v=62')).toBeGreaterThan(-1);
  expect(index.indexOf('floor-photo-reconcile-v62.js?v=62')).toBeLessThan(index.indexOf('app-v16.js?v=58'));
  expect(index).toContain('row-actions-v61.css?v=61');
  expect(index).toContain('row-actions-v61.js?v=61');
});

test('v62 relee pares origen-destino y reconcilia sin perder registros previos',()=>{
  const floor=readFileSync('public/turno-rx/floor-photo-reconcile-v62.js','utf8');

  expect(floor).toContain('RELECTURA ESPECIAL DE PIZARRONES ORIGEN');
  expect(floor).toContain('14 - 72');
  expect(floor).toContain('CE1 - 30');
  expect(floor).toContain('No deduzcas por tu cuenta que significan Pendiente o Realizado');
  expect(floor).toContain("plain(row?.category) === 'piso'");
  expect(floor).toContain('restoreAfterCommit');
  expect(floor).toContain('removedRealized');
  expect(floor).toContain('replacementExists');
  expect(floor).toContain("url.includes('/api/turno-rx/vision')");
});

test('v62 no deja que un origen duplicado bloquee silenciosamente todo el lote',()=>{
  const floor=readFileSync('public/turno-rx/floor-photo-reconcile-v62.js','utf8');
  expect(floor).toContain('Origen duplicado en la lectura');
  expect(floor).toContain('Origen ambiguo en la lectura');
  expect(floor).toContain('duplicateReview');
  expect(floor).toContain('filteredPatients.push(...duplicateReview)');
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
  expect(sw).toContain('/turno-rx/floor-photo-reconcile-v62.js?v=62');
});
