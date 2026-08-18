import {expect,test} from 'vitest';
import {planPhotoReconciliation} from '../public/turno-rx/progressive-photo-queue-v45.js';
import {readFileSync} from 'node:fs';

const floor=(overrides={})=>({id:crypto.randomUUID(),shiftId:'shift-test',bed:'20',name:'',category:'Piso',target:'72',destination:'72',status:'Pendiente',imageFingerprint:'foto-anterior',transport:'Por definir',createdAt:'2026-08-18T12:00:00.000Z',...overrides});

test('v63 permite reutilizar una cama realizada desde una foto diferente sin borrar el histórico',()=>{
  const realized=floor({id:'realizado-20',status:'Realizado',imageFingerprint:'foto-a'});
  const incoming=floor({id:'nuevo-20',status:'Pendiente',imageFingerprint:'foto-b'});
  const plan=planPhotoReconciliation([realized],{valid:[incoming],review:[]});
  expect(plan.metrics.directAdded).toBe(1);
  expect(plan.nextRows).toHaveLength(2);
  expect(plan.nextRows.find((row)=>row.id==='realizado-20')?.status).toBe('Realizado');
  expect(plan.nextRows.find((row)=>row.id==='nuevo-20')?.status).toBe('Pendiente');
  expect(plan.commitResult.valid).toHaveLength(0);
});

test('v63 omite una captura idéntica ya realizada en vez de reabrirla',()=>{
  const realized=floor({id:'realizado-20',status:'Realizado',imageFingerprint:'misma-foto'});
  const incoming=floor({id:'nuevo-20',imageFingerprint:'misma-foto'});
  const plan=planPhotoReconciliation([realized],{valid:[incoming],review:[]});
  expect(plan.metrics.duplicates).toBe(1);
  expect(plan.nextRows).toHaveLength(1);
  expect(plan.commitResult.valid).toHaveLength(0);
});

test('v63 actualiza un Piso pendiente conservando id y traslado manual',()=>{
  const existing=floor({id:'pendiente-20',destination:'72',target:'72',transport:'Silla',manualTransportOverride:true,imageFingerprint:'foto-a'});
  const incoming=floor({id:'lectura-nueva',destination:'88',target:'88',transport:'Camilla',imageFingerprint:'foto-b'});
  const plan=planPhotoReconciliation([existing],{valid:[incoming],review:[]});
  expect(plan.metrics.updated).toBe(1);
  expect(plan.nextRows).toHaveLength(1);
  expect(plan.nextRows[0].id).toBe('pendiente-20');
  expect(plan.nextRows[0].destination).toBe('88');
  expect(plan.nextRows[0].transport).toBe('Silla');
});

test('v63 aísla solo el origen duplicado y deja pasar los demás renglones de la foto',()=>{
  const rows=[
    floor({id:'14',bed:'14',destination:'72',target:'72',imageFingerprint:'lote'}),
    floor({id:'11',bed:'11',destination:'UEH',target:'UEH',imageFingerprint:'lote'}),
    floor({id:'20a',bed:'20',destination:'30',target:'30',imageFingerprint:'lote'}),
    floor({id:'20b',bed:'20',destination:'31',target:'31',imageFingerprint:'lote'})
  ];
  const plan=planPhotoReconciliation([],{valid:rows,review:[]});
  expect(plan.commitResult.valid.map((row)=>row.bed).sort()).toEqual(['11','14']);
  expect(plan.commitResult.review).toHaveLength(1);
  expect(plan.commitResult.review[0].captureReviewOnly).toBe(true);
});

test('v63 no deja que un RX realizado absorba una solicitud nueva de otra fotografía',()=>{
  const realized={id:'rx-old',bed:'UA16',name:'Maria Lopez',category:'Rayos X',target:'Tórax AP',status:'Realizado',imageFingerprint:'foto-a'};
  const incoming={id:'rx-new',bed:'16',name:'Maria Lopez',category:'Rayos X',target:'Tórax AP',status:'Pendiente',imageFingerprint:'foto-b'};
  const plan=planPhotoReconciliation([realized],{valid:[incoming],review:[]});
  expect(plan.metrics.directAdded).toBe(1);
  expect(plan.nextRows).toHaveLength(2);
  expect(plan.nextRows.find((row)=>row.id==='rx-old')?.status).toBe('Realizado');
  expect(plan.nextRows.find((row)=>row.id==='rx-new')?.status).toBe('Pendiente');
});

test('v64 reemplaza el refuerzo v63 sin reintroducir borrado/restauración temporal',()=>{
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const floor=readFileSync('public/turno-rx/floor-intelligence-v64.js','utf8');
  expect(index).toContain('floor-intelligence-v64.js?v=64');
  expect(index).not.toContain('floor-photo-prompt-v63.js?v=63');
  expect(index).not.toContain('floor-photo-reconcile-v62.js?v=62');
  expect(floor).not.toContain('restoreAfterCommit');
  expect(floor).not.toContain('ROLLBACK_MS');
  expect(floor).not.toContain('localStorage');
});
