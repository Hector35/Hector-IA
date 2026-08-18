import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v63 carga el refuerzo de lectura antes de app sin mutar almacenamiento',()=>{
  const floorPrompt=readFileSync('public/turno-rx/floor-photo-prompt-v63.js','utf8');
  const gesture=readFileSync('public/turno-rx/row-actions-v61.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');

  expect(()=>new Function(floorPrompt)).not.toThrow();
  expect(()=>new Function(gesture)).not.toThrow();
  expect(index.indexOf('floor-photo-prompt-v63.js?v=63')).toBeGreaterThan(-1);
  expect(index.indexOf('floor-photo-prompt-v63.js?v=63')).toBeLessThan(index.indexOf('app-v16.js?v=58'));
  expect(index).not.toContain('<script src="/turno-rx/floor-photo-reconcile-v62.js?v=62"></script>');
  expect(index).toContain('row-actions-v61.css?v=61');
  expect(index).toContain('row-actions-v61.js?v=61');
});

test('v63 conserva la relectura origen-destino pero elimina borrado y restauración temporal',()=>{
  const floorPrompt=readFileSync('public/turno-rx/floor-photo-prompt-v63.js','utf8');

  expect(floorPrompt).toContain('RELECTURA ESPECIAL DE PIZARRONES ORIGEN');
  expect(floorPrompt).toContain('14 - 72');
  expect(floorPrompt).toContain('CE1 - 30');
  expect(floorPrompt).toContain('No deduzcas por tu cuenta que significan Pendiente o Realizado');
  expect(floorPrompt).toContain("url.includes('/api/turno-rx/vision')");
  expect(floorPrompt).not.toContain('restoreAfterCommit');
  expect(floorPrompt).not.toContain('removedRealized');
  expect(floorPrompt).not.toContain('ROLLBACK_MS');
  expect(floorPrompt).not.toContain('localStorage');
});

test('v63 procesa conflictos por renglón en la cola y no bloquea silenciosamente todo el lote',()=>{
  const queue=readFileSync('public/turno-rx/progressive-photo-queue-v45.js','utf8');
  expect(queue).toContain('planPhotoReconciliation');
  expect(queue).toContain('Origen duplicado en la misma fotografía');
  expect(queue).toContain('los demás sí se procesaron');
  expect(queue).toContain('directAdded');
  expect(queue).toContain('duplicatesSkipped');
});

test('v61 replica feedback verde en RX TAC USG y el shell conserva gestos con reconciliación v63',()=>{
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
  expect(sw).toContain('/turno-rx/floor-photo-prompt-v63.js?v=63');
  expect(sw).not.toContain('/turno-rx/floor-photo-reconcile-v62.js?v=62');
});
