import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v69 resuelve una foto duplicada con pacientes reproducidos y no como respuesta vacía',()=>{
  const dedupe=readFileSync('public/turno-rx/photo-dedupe-v68.js','utf8');
  const app=readFileSync('public/turno-rx/app-v16.js','utf8');

  expect(dedupe).toContain('duplicatePatientsForFingerprint');
  expect(dedupe).toContain('const patients=duplicatePatientsForFingerprint(rows,fingerprint)');
  expect(dedupe).toContain('JSON.stringify({patients,duplicatePhoto:true})');
  expect(dedupe).not.toContain('JSON.stringify({patients:[]})');
  expect(dedupe).toContain("'X-Pendientes-Duplicate':'1'");

  // El controlador principal considera una lectura vacía como error; por eso v69 debe
  // reproducir la identidad ya almacenada para que la reconciliación la cuente como duplicado.
  expect(app).toContain('if(!recognized.valid.length&&!recognized.review.length)throw new Error');
});

test('v69 fuerza asset nuevo y shell nuevo para evitar mezclar el contrato v68 en iPhone',()=>{
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');

  expect(index).toContain('/turno-rx/photo-dedupe-v68.js?v=69');
  expect(index).toContain('Pendientes v69');
  expect(sw).toContain("const CACHE = 'pendientes-shell-20260818-5'");
  expect(sw).toContain('/turno-rx/photo-dedupe-v68.js?v=69');
});
