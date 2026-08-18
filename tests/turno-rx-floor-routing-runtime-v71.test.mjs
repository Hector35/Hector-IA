import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v71/v72 ejecuta normalización de destinos de Piso antes de deduplicar fotos',()=>{
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const floorScript='<script src="/turno-rx/floor-intelligence-v64.js?v=64"></script>';
  const dedupe='photo-dedupe-v68.js?v=70';
  expect(index).toContain(floorScript);
  expect(index.indexOf(floorScript)).toBeLessThan(index.indexOf(dedupe));
});

test('v72 conserva normalizador de Piso en el shell offline',()=>{
  const sw=readFileSync('public/turno-rx/sw.js','utf8');
  expect(sw).toContain("'/turno-rx/floor-intelligence-v64.js?v=64'");
  expect(sw).toContain('Pendientes v72');
  expect(sw).toContain("const CACHE = 'pendientes-shell-20260818-7'");
});

test('normalizador restaurado sigue sin mutar almacenamiento',()=>{
  const floor=readFileSync('public/turno-rx/floor-intelligence-v64.js','utf8');
  expect(floor).toContain('DESTINO OPERATIVO DE PISO V64');
  expect(floor).toContain('normalizeFloorPatient');
  expect(floor).not.toContain('localStorage');
  expect(floor).not.toContain('Storage.prototype');
});
