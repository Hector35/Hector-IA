import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {planPhotoReconciliation,createPhotoJobs,photoQueueSummary} from '../public/turno-rx/progressive-photo-queue-v45.js';

const floor=(overrides={})=>({
  id:'row',bed:'20',category:'Piso',status:'Pendiente',name:'',sex:'No visible',
  target:'72',destination:'72',transport:'Por definir',reviewFields:[],imageFingerprint:'foto-a',...overrides
});

test('v65 no sobrescribe un pendiente de la misma cama cuando identidad visible contradice',()=>{
  const existing=floor({id:'actual',name:'JUAN PEREZ',sex:'Hombre'});
  const incoming=floor({id:'nuevo',name:'MARIA LOPEZ',sex:'Mujer',imageFingerprint:'foto-b'});
  const plan=planPhotoReconciliation([existing],{valid:[incoming],review:[]});
  expect(plan.metrics.updated).toBe(0);
  expect(plan.metrics.review).toBe(1);
  expect(plan.nextRows.find((row)=>row.id==='actual')?.name).toBe('JUAN PEREZ');
  expect(plan.commitResult.review).toHaveLength(1);
});

test('v65 elimina revisión pegada cuando una relectura confiable resuelve los campos',()=>{
  const existing=floor({id:'actual',needsReview:true,reviewFields:['bed','sex'],sex:'No visible'});
  const incoming=floor({id:'nuevo',sex:'Mujer',imageFingerprint:'foto-b',needsReview:false,reviewFields:[],confidence:{bed:'high',sex:'high'}});
  const plan=planPhotoReconciliation([existing],{valid:[incoming],review:[]});
  expect(plan.metrics.updated).toBe(1);
  expect(plan.nextRows[0].needsReview).toBe(false);
  expect(plan.nextRows[0].reviewFields).toEqual([]);
});

test('v65 conserva métricas de agregados actualizados y duplicados',()=>{
  const jobs=createPhotoJobs([{name:'a.jpg'},{name:'b.jpg'}]);
  jobs[0].patientsAdded=1;jobs[0].patientsUpdated=2;jobs[0].duplicatesSkipped=1;jobs[0].state='Terminada';
  jobs[1].patientsUpdated=1;jobs[1].state='Requiere revisión';
  expect(photoQueueSummary(jobs)).toMatchObject({added:1,updated:3,duplicates:1,review:1});
});

function loadStabilityApi(){
  const source=readFileSync('public/turno-rx/stability-v65.js','utf8');
  class MemoryStorage{
    constructor(){this.values=new Map();}
    getItem(key){return this.values.has(key)?this.values.get(key):null;}
    setItem(key,value){this.values.set(key,String(value));}
  }
  const localStorage=new MemoryStorage();
  const document={
    readyState:'complete',
    addEventListener(){},dispatchEvent(){return true;},
    getElementById(){return null;},querySelector(){return null;},body:{classList:{remove(){}}}
  };
  const context={
    window:{},document,localStorage,Storage:MemoryStorage,MutationObserver:class{observe(){}},
    CustomEvent:class{},FormData:class{},crypto:{randomUUID:()=> 'uuid-v65'},Date,Math,JSON,String,Number,Boolean,RegExp,Set,Array,Object
  };
  context.globalThis=context;
  vm.runInNewContext(source,context);
  return {api:context.window.__pendientesStabilityV65,localStorage,window:context.window};
}

test('captura manual Piso conserva categoría y un Realizado no bloquea reutilizar cama',()=>{
  const {api}=loadStabilityApi();
  const realized=floor({id:'old',status:'Realizado'});
  const pending=floor({id:'active',status:'Pendiente'});
  expect(api.hasActiveFloorConflict([realized],'20')).toBe(false);
  expect(api.hasActiveFloorConflict([pending],'20')).toBe(true);
  const row=api.createManualRow({bed:'CE1',category:'Piso',shiftId:'turno-1',now:'2026-08-18T15:00:00.000Z'});
  expect(row).toMatchObject({bed:'CE1',category:'Piso',target:'',destination:'',status:'Pendiente'});
});

test('feedback de cola explica actualizaciones y duplicados aunque agregados sea cero',()=>{
  const {api}=loadStabilityApi();
  expect(api.formatPhotoSummary({added:0,updated:4,duplicates:1,review:0,errors:0})).toBe('0 agregados · 4 actualizados · 1 duplicado');
});

test('v65 deja un único escritor táctil global y conserva fallback de Piso/TAC',()=>{
  const stability=readFileSync('public/turno-rx/stability-v65.js','utf8');
  const floorFlow=readFileSync('public/turno-rx/floor-workflow-v42.js','utf8');
  const tacFlow=readFileSync('public/turno-rx/tac-flow-v42.js','utf8');
  expect(stability).toContain('__PENDIENTES_GLOBAL_STATUS_GESTURES__ = true');
  expect(floorFlow).toContain("window.__PENDIENTES_GLOBAL_STATUS_GESTURES__ !== true");
  expect(tacFlow).toContain("window.__PENDIENTES_GLOBAL_STATUS_GESTURES__ !== true");
});

test('motivo de revisión puede envolver y v65 está en index/service worker',()=>{
  const css=readFileSync('public/turno-rx/stability-v65.css','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const sw=readFileSync('public/turno-rx/sw.js','utf8');
  expect(css).toContain('white-space:normal!important');
  expect(css).toContain('overflow-wrap:anywhere!important');
  expect(index.indexOf('stability-v65.js?v=65')).toBeLessThan(index.indexOf('app-v16.js?v=58'));
  expect(index).toContain('stability-v65.css?v=65');
  expect(sw).toContain('/turno-rx/stability-v65.js?v=65');
  expect(sw).toContain('/turno-rx/stability-v65.css?v=65');
});

test('historial visible ya usa snapshots sin límite de siete turnos',()=>{
  const history=readFileSync('public/turno-rx/premium-v37.js','utf8');
  expect(history).toContain("const SNAPSHOT_KEY = 'pendientes-shift-snapshots-v37'");
  expect(history).toContain('current.unshift(snapshot)');
  expect(history).not.toContain('saveSnapshots(current.slice(0,7))');
});
