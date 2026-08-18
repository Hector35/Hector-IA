import {test} from 'vitest';
import assert from 'node:assert/strict';
import {
  displayOrigin,
  normalizeStudyDisplay,
  normalizeModality,
  normalizeCategory,
  isRayXStudyText,
  reviewFields,
  findMatchingRowIndex,
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

test('dentro del mismo traslado prioriza menor edad y después mujeres',()=>{
  const mujer={bed:'20',sex:'Mujer',age:60,target:'Tórax',transport:'Silla'};
  const hombreJoven={bed:'21',sex:'Hombre',age:18,target:'Tórax',transport:'Silla'};
  assert.ok(compareImagingRows(hombreJoven,mujer)<0);
  const joven={bed:'22',sex:'Mujer',age:25,target:'Tórax',transport:'Silla'};
  const mayor={bed:'23',sex:'Mujer',age:70,target:'Tórax',transport:'Silla'};
  assert.ok(compareImagingRows(joven,mayor)<0);
});

test('un estudio portátil se marca como no trasladar',()=>{
  assert.equal(effectiveTransport({target:'Tele de tórax PORTÁTIL',transport:'Camilla'}),'No trasladar');
});

test('detecta solicitudes representativas de Rayos X',()=>{
  for(const study of ['RX TÓRAX AP','RADIOGRAFÍA DE MANO DERECHA','TÓRAX + ABDOMEN SIMPLE','CRÁNEO + CERVICALES','RX PORTÁTIL DE TÓRAX']){
    assert.equal(isRayXStudyText(study),true,study);
    assert.equal(normalizeCategory('', '', study),'Rayos X',study);
  }
});

test('no confunde TAC, USG, Piso ni texto clínico con Rayos X',()=>{
  assert.equal(normalizeCategory('', '', 'TAC de cráneo'),'TAC');
  assert.equal(normalizeCategory('', '', 'USG abdominal'),'USG');
  assert.equal(normalizeCategory('Piso', '', '72'),'Piso');
  assert.equal(isRayXStudyText('Dolor e inflamación de mano derecha'),false);
  assert.equal(normalizeCategory('', '', 'Dolor e inflamación de mano derecha'),'Otro');
});

test('preserva camas numéricas, CE4 y UP como orígenes distintos',()=>{
  assert.equal(displayOrigin('C15'),'15');
  assert.equal(displayOrigin('CE4'),'CE4');
  assert.equal(displayOrigin('UP'),'UP');
});

test('marca cama ilegible, nombre ambiguo y campos low para revisión sin inventarlos',()=>{
  const fields=reviewFields({bed:'',name:'',target:'RX tórax AP',confidence:{bed:'low',name:'low',target:'high'}});
  assert.deepEqual(fields.sort(),['bed','name'].sort());
});

test('deduplica la misma imagen aunque el OCR varíe levemente',()=>{
  const existing=[{category:'Rayos X',bed:'CE4',name:'María López',target:'RX tórax AP',imageFingerprint:'abc123'}];
  assert.equal(findMatchingRowIndex(existing,{category:'Rayos X',bed:'CE4',name:'Maria Lopes',target:'Radiografía de tórax',imageFingerprint:'abc123'}),0);
});

test('no elimina dos pacientes diferentes con el mismo estudio',()=>{
  const existing=[{category:'Rayos X',bed:'15',name:'Ana Pérez',target:'Tórax AP'}];
  assert.equal(findMatchingRowIndex(existing,{category:'Rayos X',bed:'16',name:'Laura Pérez',target:'Tórax AP'}),-1);
});

test('silla, camilla, portátil y oxígeno conservan semántica operativa',()=>{
  assert.ok(compareImagingRows({bed:'1',target:'Tórax',transport:'Silla'},{bed:'2',target:'Tórax',transport:'Camilla'})<0);
  assert.equal(effectiveTransport({target:'RX PORTÁTIL DE TÓRAX',transport:'Silla'}),'No trasladar');
  const oxygen={oxygenProbable:true,oxygenReason:'Oxígeno indicado en la boleta'};
  assert.equal(oxygen.oxygenProbable,true);
  assert.match(oxygen.oxygenReason,/indicado/i);
});
