import {describe,expect,it} from 'vitest';
import {governInference,summarizeGovernor} from './call-governor';
import type {RuntimeReuseCandidate} from './runtime-reuse';

const known:RuntimeReuseCandidate={id:'known',source:'skill',taskType:'github-code',risk:'medium',confidence:.95,successRate:.95,recencyScore:1,estimatedCostUsd:0,trigger:'ejecuta typecheck pruebas y build del repositorio',procedure:'Ejecutar validaciones.',mode:'deterministic',deterministicOutput:'Validaciones aprobadas.'};
const context:RuntimeReuseCandidate={...known,id:'context',confidence:.76,successRate:.82,mode:'context',deterministicOutput:undefined,trigger:'analiza error nuevo del repositorio',procedure:'Inspeccionar error y archivos relacionados.'};

describe('call governor free-first',()=>{
 it('resuelve una tarea conocida con cero llamadas avanzadas',()=>{
  const plan=governInference({prompt:'Ejecuta typecheck pruebas y build del repositorio',candidates:[known]});
  expect(plan).toMatchObject({inferenceTier:'none',maxAdvancedCalls:0});
  expect(plan.reuse.kind).toBe('deterministic');
 });
 it('limita una tarea parcialmente conocida a una sola llamada avanzada',()=>{
  const plan=governInference({prompt:'Analiza error nuevo del repositorio',candidates:[context]});
  expect(plan.reuse.kind).toBe('assist');
  expect(plan.maxAdvancedCalls).toBe(1);
 });
 it('reserva clasificación gratuita cuando Workers AI está permitido',()=>{
  const plan=governInference({prompt:'Clasifica esta solicitud por tipo',candidates:[],allowCloudflareAi:true});
  expect(plan).toMatchObject({capability:'classification',inferenceTier:'cloudflare-free',maxAdvancedCalls:0});
 });
 it('bloquea alto riesgo sin gastar inferencia',()=>{
  const plan=governInference({prompt:'Elimina y despliega el proyecto',candidates:[known]});
  expect(plan).toMatchObject({inferenceTier:'none',maxAdvancedCalls:0});
  expect(plan.reuse.kind).toBe('blocked');
 });
 it('mide ahorro reproducible sobre cinco clases de tarea',()=>{
  const plans=[
   governInference({prompt:'Ejecuta typecheck pruebas y build del repositorio',candidates:[known]}),
   governInference({prompt:'Analiza error nuevo del repositorio',candidates:[context]}),
   governInference({prompt:'Diseña una arquitectura inédita',candidates:[]}),
   governInference({prompt:'Clasifica esta solicitud por tipo',candidates:[],allowCloudflareAi:true}),
   governInference({prompt:'Elimina el despliegue',candidates:[]})
  ];
  expect(summarizeGovernor(plans)).toMatchObject({tasks:5,deterministic:1,freeTier:1,advancedCalls:2,advancedCallsAvoided:8});
 });
});
