import {test,expect} from 'vitest';
import {
  classifyVisionRows,
  displayOrigin,
  isCompleteFloorRow,
  rowFloorGroupKey,
  findMatchingRowIndex
} from '../public/turno-rx/app-v16.js';

const boardRows = [
  ['C11','Nefrología','Hombre'],
  ['C1','Gastroenterología','Hombre'],
  ['C23','Geriatría','Hombre'],
  ['C7','Cirugía General','Hombre'],
  ['C3','Geriatría','Hombre'],
  ['CE1','Geriatría','Mujer'],
  ['C2','Angiología y Cirugía Vascular','Mujer'],
  ['C19','Nefrología','Mujer'],
  ['C21','Medicina Interna','Mujer'],
  ['C4','Gastroenterología','Mujer'],
  ['C15','Cirugía General','Mujer']
].map(([bed,service,sex])=>({
  category:'Piso',bed,service,originService:service,sex,
  target:'',destination:'',recognizedText:`${bed} ${service}`,
  confidence:{bed:'high',sex:'high'}
}));

test('PISO = 11 no se convierte en once pacientes vacíos',()=>{
  const fakeTotal=Array.from({length:11},()=>({category:'Piso',recognizedText:'PISO = 11'}));
  const result=classifyVisionRows(fakeTotal,'foto-piso');
  expect(result.valid).toHaveLength(0);
  expect(result.review).toHaveLength(0);
});

test('extrae exactamente las once camas, servicios y sexos de las columnas H/M',()=>{
  const withColumnLetters=boardRows.map((row)=>({...row,sex:row.sex==='Hombre'?'H':'M'}));
  const result=classifyVisionRows(withColumnLetters,'foto-piso');
  expect(result.review).toHaveLength(0);
  expect(result.valid).toHaveLength(11);
  expect(result.valid.map((row)=>[row.bed,row.service,row.sex])).toEqual(boardRows.map((row)=>[row.bed,row.service,row.sex]));
  expect(result.valid.every((row)=>row.destination===''&&row.target==='')).toBe(true);
  expect(result.valid.every(isCompleteFloorRow)).toBe(true);
  expect(result.valid.every((row)=>rowFloorGroupKey(row)==='por-ubicar')).toBe(true);
});

test('CE1 se conserva como Corta Estancia y no se convierte en cama 1',()=>{
  const [ce1]=classifyVisionRows([boardRows[5]],'foto-piso').valid;
  expect(ce1.bed).toBe('CE1');
  expect(displayOrigin(ce1.bed)).toBe('CE1');
});

test('un renglón parcial va a revisión y no cuenta como paciente válido',()=>{
  const result=classifyVisionRows([{category:'Piso',bed:'',service:'Geriatría',sex:'Mujer',recognizedText:'... Geriatría',confidence:{bed:'low',sex:'high'}}],'foto-piso');
  expect(result.valid).toHaveLength(0);
  expect(result.review).toHaveLength(1);
  expect(result.review[0]).toMatchObject({captureReviewOnly:true,needsReview:true,service:'Geriatría',sex:'Mujer'});
});

test('la segunda carga de la misma foto encuentra los once registros existentes',()=>{
  const first=classifyVisionRows(boardRows,'foto-piso').valid;
  const second=classifyVisionRows(boardRows,'foto-piso').valid;
  expect(second.map((row)=>findMatchingRowIndex(first,row))).toEqual([0,1,2,3,4,5,6,7,8,9,10]);
});
