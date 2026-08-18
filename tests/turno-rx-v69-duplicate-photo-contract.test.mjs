import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('v70 resuelve una foto duplicada como no-op exitoso y conserva historial de fingerprints',()=>{
  const dedupe=readFileSync('public/turno-rx/photo-dedupe-v68.js','utf8');
  const history=readFileSync('public/turno-rx/photo-fingerprint-history-v70.js','utf8');

  expect(dedupe).toContain('fingerprintsForRow');
  expect(dedupe).toContain('imageFingerprints');
  expect(dedupe).toContain('JSON.stringify({patients:[],duplicatePhoto:true');
  expect(dedupe).toContain("'X-Pendientes-Duplicate':'1'");
  expect(history).toContain('preserveFingerprintHistory');
  expect(history).toContain('imageFingerprints:unique');
});

test('v72 conserva assets v70/v71 y shell actual sin mezclar el contrato anterior en iPhone',()=>{
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');

  expect(index).toContain('/turno-rx/photo-fingerprint-history-v70.js?v=70');
  expect(index).toContain('/turno-rx/photo-dedupe-v68.js?v=70');
  expect(index).toContain('/turno-rx/floor-intelligence-v64.js?v=64');
  expect(index).toContain('/turno-rx/manual-category-v72.js?v=72');
  expect(index).toContain('Pendientes v72');
  expect(sw).toContain("const CACHE = 'pendientes-shell-20260818-7'");
  expect(sw).toContain('/turno-rx/photo-fingerprint-history-v70.js?v=70');
  expect(sw).toContain('/turno-rx/photo-dedupe-v68.js?v=70');
  expect(sw).toContain('/turno-rx/floor-intelligence-v64.js?v=64');
  expect(sw).toContain('/turno-rx/manual-category-v72.js?v=72');
});