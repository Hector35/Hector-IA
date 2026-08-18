import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

function loadRules(){
  const source=readFileSync('public/turno-rx/floor-intelligence-v64.js','utf8');
  const fakeWindow={fetch:async()=>({ok:false})};
  new Function('window','FormData',source)(fakeWindow,globalThis.FormData);
  return fakeWindow.__pendientesFloorIntelligenceV64;
}

test('v64 identifica los seis destinos operativos por nombre de servicio',()=>{
  const rules=loadRules();
  expect(rules.floorDestinationFromService('Nefrología')).toMatchObject({label:'Primero',floor:'1',block:'B'});
  expect(rules.floorDestinationFromService('CX GRAL')).toMatchObject({label:'Segundo',floor:'2',block:'B'});
  expect(rules.floorDestinationFromService('M.I.')).toMatchObject({label:'Tercero',floor:'3',block:'B'});
  expect(rules.floorDestinationFromService('Obstetricia')).toMatchObject({label:'Segundo de la otra unidad',floor:'2',block:'A'});
  expect(rules.floorDestinationFromService('Pediatría')).toMatchObject({label:'Tercero de la otra unidad',floor:'3',block:'A'});
  expect(rules.floorDestinationFromService('Gineco')).toMatchObject({label:'Quinto de la otra unidad',floor:'5',block:'A'});
});

test('v64 usa los rangos de camas destino sin sustituir el número visible',()=>{
  const rules=loadRules();
  expect(rules.floorDestinationFromBed('44')).toMatchObject({label:'Primero',floor:'1',block:'B',bed:'44'});
  expect(rules.floorDestinationFromBed('72')).toMatchObject({label:'Segundo',floor:'2',block:'B',bed:'72'});
  expect(rules.floorDestinationFromBed('111')).toMatchObject({label:'Tercero',floor:'3',block:'B',bed:'111'});
  expect(rules.floorDestinationFromBed('146')).toMatchObject({label:'Segundo de la otra unidad',floor:'2',block:'A',bed:'146'});
  expect(rules.floorDestinationFromBed('180')).toMatchObject({label:'Tercero de la otra unidad',floor:'3',block:'A',bed:'180'});
  expect(rules.floorDestinationFromBed('199')).toMatchObject({label:'Quinto de la otra unidad',floor:'5',block:'A',bed:'199'});
});

test('v64 convierte un servicio destino a piso pero conserva el origen',()=>{
  const rules=loadRules();
  const row=rules.normalizeFloorPatient({category:'Piso',bed:'15',destination:'Nefro',target:'Nefro',service:'Nefrología'});
  expect(row.bed).toBe('15');
  expect(row.destination).toBe('Primero');
  expect(row.target).toBe('Primero');
  expect(row.destinationFloor).toBe('1');
  expect(row.destinationBlock).toBe('B');
  expect(row.destinationService).toBe('Nefro');
});

test('v64 deja que una cama destino explícita gane sobre un servicio inconsistente',()=>{
  const rules=loadRules();
  const row=rules.normalizeFloorPatient({category:'Piso',bed:'15',destination:'72',target:'72',service:'Nefrología'});
  expect(row.destination).toBe('72');
  expect(row.target).toBe('72');
  expect(row.destinationFloor).toBe('2');
  expect(row.destinationBlock).toBe('B');
});

test('v64 usa el servicio conocido cuando el destino estaba por confirmar y no inventa servicios desconocidos',()=>{
  const rules=loadRules();
  const inferred=rules.normalizeFloorPatient({category:'Piso',bed:'20',destination:'',target:'',service:'Medicina Interna'});
  expect(inferred.destination).toBe('Tercero');
  expect(inferred.target).toBe('Tercero');
  const unknown=rules.normalizeFloorPatient({category:'Piso',bed:'23',destination:'',target:'',service:'GERIA'});
  expect(unknown.destination).toBe('');
  expect(unknown.target).toBe('');
});

test('v64 oculta metadata clínica extra en la tabla y la conserva en el detalle',()=>{
  const css=readFileSync('public/turno-rx/boleta-visibility-v64.css','utf8');
  const detail=readFileSync('public/turno-rx/patient-detail-v39.js','utf8');
  expect(css).toContain('.imaging-table .diagnosis-cell');
  expect(css).toContain('.imaging-table .meaning-cell');
  expect(css).toMatch(/display:\s*none\s*!important/);
  expect(detail).toContain('Diagnóstico / dato clínico');
  expect(detail).toContain('Médico solicitante');
  expect(detail).toContain('Fecha de solicitud');
  expect(detail).toContain("firstAvailable(row, ['requestDate'])");
  expect(detail).toContain("firstAvailable(row, ['requestTime'])");
});
