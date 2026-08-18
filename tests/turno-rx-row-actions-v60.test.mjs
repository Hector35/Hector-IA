import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v60 elimina las X permanentes sin eliminar la acción Quitar del detalle',()=>{
  const css=readFileSync('public/turno-rx/row-actions-v60.css','utf8');
  const compact=readFileSync('public/turno-rx/compact-v17.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');

  expect(css).toContain('.patient-row .remove-btn');
  expect(css).toMatch(/\.patient-row \.remove-btn[\s\S]*display:\s*none\s*!important/);
  expect(compact).toContain('compact-detail-remove');
  expect(compact).toContain('Quitar');
  expect(index).toContain('/turno-rx/row-actions-v60.css?v=60');
  expect(index).toContain('/turno-rx/row-actions-v60.js?v=60');
});

test('v60 usa el mismo gesto para Piso RX TAC y USG y conserva acciones reversibles',()=>{
  const js=readFileSync('public/turno-rx/row-actions-v60.js','utf8');

  expect(js).toContain("document.addEventListener('touchstart'");
  expect(js).toContain("document.addEventListener('touchend'");
  expect(js).toContain("current.mode === 'pending' && dx < 0");
  expect(js).toContain("setStatus(current.id, 'Realizado')");
  expect(js).toContain("current.mode === 'realized' && dx > 0");
  expect(js).toContain("setStatus(current.id, 'Pendiente')");
  expect(js).toContain("document.dispatchEvent(new CustomEvent('pendientes:status-changed'");
  expect(js).toContain('[data-v60-restore]');
  expect(js).toContain("if (category === 'piso') return 'Piso'");
  expect(js).toContain("return 'TAC'");
  expect(js).toContain("return 'USG'");
  expect(js).toContain("return 'RX'");
});

test('v60 protege controles interactivos y mantiene los realizados fuera del contador pendiente',()=>{
  const js=readFileSync('public/turno-rx/row-actions-v60.js','utf8');
  const app=readFileSync('public/turno-rx/app-v16.js','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');

  expect(js).toContain('isInteractiveTarget');
  expect(js).toContain('[data-quick-transport="1"]');
  expect(js).toContain("clean(row?.status).toLowerCase() === 'realizado'");
  expect(app).toContain("function isPendingRow(row){return clean(row?.status).toLowerCase()!=='realizado';}");
  expect(sw).toContain('/turno-rx/row-actions-v60.css?v=60');
  expect(sw).toContain('/turno-rx/row-actions-v60.js?v=60');
});
