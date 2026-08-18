import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v64 carga inteligencia de Piso antes de app sin mutar almacenamiento',()=>{
  const floor=readFileSync('public/turno-rx/floor-intelligence-v64.js','utf8');
  const gesture=readFileSync('public/turno-rx/row-actions-v61.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');

  expect(()=>new Function(floor)).not.toThrow();
  expect(()=>new Function(gesture)).not.toThrow();
  expect(index.indexOf('floor-intelligence-v64.js?v=64')).toBeGreaterThan(-1);
  expect(index.indexOf('floor-intelligence-v64.js?v=64')).toBeLessThan(index.indexOf('app-v16.js?v=58'));
  expect(index).not.toContain('<script src="/turno-rx/floor-photo-reconcile-v62.js?v=62"></script>');
  expect(index).not.toContain('<script src="/turno-rx/floor-photo-prompt-v63.js?v=63"></script>');
  expect(index).toContain('row-actions-v61.css?v=61');
  expect(index).toContain('row-actions-v61.js?v=61');
});

test('v64 conserva relectura origen-destino y añade la semántica de servicios de destino',()=>{
  const floor=readFileSync('public/turno-rx/floor-intelligence-v64.js','utf8');

  expect(floor).toContain('DESTINO OPERATIVO DE PISO V64');
  expect(floor).toContain('14 - 72');
  expect(floor).toContain('CE1 - 30');
  expect(floor).toContain('Nefrología/Nefro -> Primero');
  expect(floor).toContain('Medicina Interna/M.I./MI -> Tercero');
  expect(floor).toContain('Ginecología/Gineco -> Quinto de la otra unidad');
  expect(floor).toContain('No copies ese servicio a originService');
  expect(floor).toContain("url.includes('/api/turno-rx/vision')");
  expect(floor).not.toContain('restoreAfterCommit');
  expect(floor).not.toContain('removedRealized');
  expect(floor).not.toContain('ROLLBACK_MS');
  expect(floor).not.toContain('localStorage');
});

test('v63 sigue procesando conflictos por renglón y v64 no sustituye esa reconciliación',()=>{
  const queue=readFileSync('public/turno-rx/progressive-photo-queue-v45.js','utf8');
  expect(queue).toContain('planPhotoReconciliation');
  expect(queue).toContain('Origen duplicado en la misma fotografía');
  expect(queue).toContain('los demás sí se procesaron');
  expect(queue).toContain('directAdded');
  expect(queue).toContain('duplicatesSkipped');
});

test('v61 replica feedback verde en RX TAC USG y el shell conserva gestos con Piso v64',()=>{
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
  expect(sw).toContain('/turno-rx/floor-intelligence-v64.js?v=64');
  expect(sw).toContain('/turno-rx/boleta-visibility-v64.css?v=64');
  expect(sw).not.toContain('/turno-rx/floor-photo-reconcile-v62.js?v=62');
  expect(sw).not.toContain('/turno-rx/floor-photo-prompt-v63.js?v=63');
});
