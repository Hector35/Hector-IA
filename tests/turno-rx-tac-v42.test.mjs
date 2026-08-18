import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeModality,normalizeCategory,normalizeStudyDisplay,findMatchingRowIndex,compareImagingRows} from '../public/turno-rx/app-v16.js';

test('TAC explícita se clasifica como TAC',()=>{
  assert.equal(normalizeModality('', 'TAC de cráneo'),'TAC');
  assert.equal(normalizeModality('', 'TC de tórax'),'TAC');
  assert.equal(normalizeModality('', 'Tomografía abdominal'),'TAC');
  assert.equal(normalizeModality('', 'AngioTAC'),'TAC');
});

test('cráneo sin modalidad no se clasifica automáticamente como TAC',()=>{
  assert.notEqual(normalizeModality('TAC','Cráneo'),'TAC');
  assert.notEqual(normalizeCategory('TAC','TAC','Cráneo'),'TAC');
});

test('separa TAC, Rayos X, USG y Piso',()=>{
  assert.equal(normalizeModality('', 'TAC de cráneo'),'TAC');
  assert.equal(normalizeModality('', 'RX de cráneo'),'Rayos X');
  assert.equal(normalizeModality('', 'USG abdominal'),'Ultrasonido');
  assert.notEqual(normalizeModality('', '72'),'TAC');
});

test('normaliza estudios TAC sin simple ni protocolo',()=>{
  assert.equal(normalizeStudyDisplay('Tomografía computarizada de cráneo'),'TAC de cráneo');
  assert.equal(normalizeStudyDisplay('TC protocolo de tórax'),'TAC de Tórax');
  assert.equal(normalizeStudyDisplay('TAC de tórax, abdomen y pelvis'),'TAC de Tórax + abdomen + pelvis');
});

test('previene duplicados de la misma boleta',()=>{
  const list=[{id:'a',bed:'CE1',name:'ANA','target':'TAC de cráneo'}];
  assert.equal(findMatchingRowIndex(list,{bed:'CE1',name:'ANA',target:'TAC de cráneo'}),0);
});

test('ordena urgencia confirmada, silla, edad y sexo',()=>{
  const urgente={bed:'2',target:'TAC de cráneo',transport:'Camilla',clinicalUrgencyConfirmed:true,age:80,sex:'Hombre'};
  const silla={bed:'1',target:'TAC de cráneo',transport:'Silla',age:20,sex:'Hombre'};
  assert.ok(compareImagingRows(urgente,silla)<0);
  assert.ok(compareImagingRows({...silla,age:18,sex:'Hombre'},{...silla,age:30,sex:'Mujer'})<0);
  assert.ok(compareImagingRows({...silla,age:20,sex:'Mujer'},{...silla,age:20,sex:'Hombre'})<0);
});

test('carga flujo TAC, caché, detalle, boleta e historial',()=>{
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');
  const flow=readFileSync('public/turno-rx/tac-flow-v42.js','utf8');
  const detail=readFileSync('public/turno-rx/patient-detail-v39.js','utf8');
  const history=readFileSync('public/turno-rx/premium-v37.js','utf8');
  assert.match(index,/tac-flow-v42\.js/);
  assert.match(sw,/turno-rx-shell-v\d+-.*tac/);
  assert.match(flow,/status:'Realizado'/);
  assert.match(flow,/dx < -72/);
  assert.match(detail,/boletaPhotoId/);
  assert.match(detail,/requestingDoctor/);
  assert.match(history,/snapshot final/);
});
