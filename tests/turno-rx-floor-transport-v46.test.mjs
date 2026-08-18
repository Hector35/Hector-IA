import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app = readFileSync('public/turno-rx/app-v16.js','utf8');
const quick = readFileSync('public/turno-rx/quick-transport-v37.js','utf8');
const detail = readFileSync('public/turno-rx/patient-detail-v39.js','utf8');
const index = readFileSync('public/turno-rx/index.html','utf8');
const sw = readFileSync('public/turno-rx/sw.js','utf8');

test('Piso muestra un botón táctil propio para el traslado', () => {
  assert.match(app,/class="floor-transport" data-quick-transport="1"/);
  assert.match(app,/data-patient-id=/);
  assert.match(app,/Cambiar traslado\. Actual:/);
});

test('el selector incluye Silla, Camilla y Por definir', () => {
  assert.match(quick,/data-quick-value="Silla"/);
  assert.match(quick,/data-quick-value="Camilla"/);
  assert.match(quick,/data-quick-value="Por definir"/);
  assert.match(quick,/\['Silla','Camilla','Por definir'\]/);
});

test('la selección persiste directamente sin abrir el formulario grande', () => {
  assert.match(quick,/manualTransportOverride: true/);
  assert.match(quick,/nativeSetItem\.call\(localStorage, STORAGE_KEY/);
  assert.match(quick,/pendientes:transport-changed/);
  const commitStart = quick.indexOf('function commitThroughApp');
  const commitEnd = quick.indexOf('function reconcileVisibleLocks');
  const commitBody = quick.slice(commitStart, commitEnd);
  assert.doesNotMatch(commitBody,/patientForm|sheetBackdrop|\.click\(\)/);
});

test('el detalle de Piso muestra Destino y medio interactivo sin categoría duplicada', () => {
  assert.match(detail,/floorPatient \? 'Destino' : 'Estudio solicitado'/);
  assert.match(detail,/className = 'v39-transport-button'/);
  assert.match(detail,/dataset\.quickTransport = '1'/);
  assert.match(detail,/\['category','categoria','target','study','destination'/);
  assert.match(detail,/pendientes:transport-changed/);
});

test('la caché fuerza la versión publicada del selector', () => {
  assert.match(index,/quick-transport-v37\.js\?v=2/);
  assert.match(index,/patient-detail-v39\.js\?v=4/);
  assert.match(index,/app-v16\.js\?v=58/);
  assert.match(sw,/turno-rx-shell-v58-tac-live-interaction-hotfix/);
  assert.match(sw,/quick-transport-v37\.js\?v=2/);
});
