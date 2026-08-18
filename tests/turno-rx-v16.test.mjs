import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayOrigin,
  normalizeStudyDisplay,
  normalizeModality,
  compareImagingRows,
  effectiveTransport
} from '../public/turno-rx/app-v16.js';

test('C/ CE4 se muestra como CE4 y nunca como C1',()=>{
  assert.equal(displayOrigin('C/ CE4'),'CE4');
});

test('tórax se muestra primero y se eliminan simple/protocolo',()=>{
  assert.equal(normalizeStudyDisplay('Abdomen simple + tele de tórax'),'Tórax + Abdomen');
  assert.equal(normalizeStudyDisplay('abdomen/protocolo + pelvis'),'abdomen + pelvis');
  assert.doesNotMatch(normalizeStudyDisplay('TAC simple de rodilla'),/simple/i);
});

test('TAC, ultrasonido y rayos X permanecen en modalidades separadas',()=>{
  assert.equal(normalizeModality('', 'TAC de rodilla'),'TAC');
  assert.equal(normalizeModality('', 'USG hepático'),'Ultrasonido');
  assert.equal(normalizeModality('', 'Tele de tórax + pelvis AP'),'Rayos X');
});

test('sillas se ordenan antes que camillas',()=>{
  const silla={bed:'CE4',sex:'Hombre',age:70,target:'Tórax',transport:'Silla'};
  const camilla={bed:'CE2',sex:'Mujer',age:20,target:'Tórax',transport:'Camilla'};
  assert.ok(compareImagingRows(silla,camilla)<0);
});

test('dentro del mismo traslado prioriza mujeres y después menor edad',()=>{
  const mujer={bed:'20',sex:'Mujer',age:60,target:'Tórax',transport:'Silla'};
  const hombreJoven={bed:'21',sex:'Hombre',age:18,target:'Tórax',transport:'Silla'};
  assert.ok(compareImagingRows(mujer,hombreJoven)<0);
  const joven={bed:'22',sex:'Mujer',age:25,target:'Tórax',transport:'Silla'};
  const mayor={bed:'23',sex:'Mujer',age:70,target:'Tórax',transport:'Silla'};
  assert.ok(compareImagingRows(joven,mayor)<0);
});

test('un estudio portátil se marca como no trasladar',()=>{
  assert.equal(effectiveTransport({target:'Tele de tórax PORTÁTIL',transport:'Camilla'}),'No trasladar');
});
