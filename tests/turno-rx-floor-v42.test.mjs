import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  normalizeCategory,
  hasFloorTarget,
  rowFloorGroupKey,
  compareFloorRows,
  findMatchingRowIndex
} from '../public/turno-rx/app-v16.js';

test('clasifica cada tipo sin mezclar Rayos X y Piso', () => {
  assert.equal(normalizeCategory('Piso', '', '72'), 'Piso');
  assert.equal(normalizeCategory('Rayos X', 'Rayos X', 'Tórax'), 'Rayos X');
  assert.equal(normalizeCategory('TAC', '', 'TAC de cráneo'), 'TAC');
  assert.equal(normalizeCategory('USG', '', 'abdomen'), 'USG');
  assert.equal(normalizeCategory('Interconsulta'), 'Interconsulta');
  assert.equal(normalizeCategory('Apoyo para movimiento'), 'Apoyo para movimiento');
  assert.equal(hasFloorTarget({category:'Piso',bed:'CE1',destination:'72'}), true);
  assert.equal(hasFloorTarget({category:'Piso',bed:'CE1',destination:''}), true);
  assert.equal(hasFloorTarget({category:'Rayos X',bed:'CE1',target:'72'}), false);
});

test('agrupa destinos confirmados por cama, piso y bloque', () => {
  assert.equal(rowFloorGroupKey({category:'Piso',destination:'44'}), 'primero');
  assert.equal(rowFloorGroupKey({category:'Piso',destination:'72'}), 'segundo');
  assert.equal(rowFloorGroupKey({category:'Piso',destinationFloor:'3',destinationBlock:'B'}), 'tercero');
  assert.equal(rowFloorGroupKey({category:'Piso',destinationFloor:'2',destinationBlock:'A'}), 'segundo-otra');
  assert.equal(rowFloorGroupKey({category:'Piso',destinationFloor:'5',destinationBlock:'otra unidad'}), 'quinto-otra');
});

test('ordena silla antes que camilla dentro de destinos compatibles', () => {
  const rows = [
    {bed:'10',transport:'Camilla'},
    {bed:'CE2',transport:'Silla'},
    {bed:'2',transport:'Silla'}
  ].sort(compareFloorRows);
  assert.deepEqual(rows.map((row) => row.bed), ['2','CE2','10']);
});

test('deduplica dentro de la misma categoría y conserva categorías diferentes', () => {
  const existing = [{category:'Piso',bed:'CE1',destination:'72',target:'72',name:''}];
  assert.equal(findMatchingRowIndex(existing,{category:'Piso',bed:'CE1',destination:'72',target:'72',name:''}),0);
  assert.equal(findMatchingRowIndex(existing,{category:'Rayos X',bed:'CE1',target:'72',name:''}),-1);
});

test('la captura única pide categoría automática y el service worker carga v42', () => {
  const app = readFileSync('public/turno-rx/app-v16.js','utf8');
  const index = readFileSync('public/turno-rx/index.html','utf8');
  const sw = readFileSync('public/turno-rx/sw.js','utf8');
  const workflow = readFileSync('public/turno-rx/floor-workflow-v42.js','utf8');
  assert.match(app,/category":"Rayos X\|TAC\|USG\|Piso\|Interconsulta\|Apoyo para movimiento/);
  assert.match(app,/category debe ser "Piso"/);
  assert.match(index,/floor-workflow-v42\.js\?v=58/);
  assert.match(sw,/turno-rx-shell-v\d+-/);
  assert.match(workflow,/status:'Realizado'/);
  assert.match(workflow,/SWIPE_THRESHOLD/);
});
