import {describe,expect,it} from 'vitest';
import {decideCallBudget} from './call-governor';
import {rankHybridMemory,type HybridMemoryItem} from './hybrid-memory';
import {chooseRuntimeReuse,type RuntimeReuseCandidate} from './runtime-reuse';

const known:RuntimeReuseCandidate={id:'known',source:'experience',taskType:'github-code',risk:'medium',confidence:.94,successRate:.92,recencyScore:1,estimatedCostUsd:.02,trigger:'ejecuta typecheck pruebas y build del repositorio',procedure:'Ejecutar validaciones y devolver evidencia.',mode:'deterministic',deterministicOutput:'Validación completada.'};
const memory:HybridMemoryItem={id:'m1',userId:'u1',sourceType:'experience',sourceId:'e1',title:'Corregir compilación',content:'Inspeccionar error, corregir y ejecutar pruebas.',normalizedText:'corregir error compilacion repositorio',tags:['github-code','tests'],verified:true,successRate:.92,confidence:.94,estimatedCostUsd:.02,createdAt:'2026-07-22T00:00:00Z',updatedAt:'2026-07-22T00:00:00Z'};

describe('benchmark end-to-end free-first',()=>{
 it('mide conocida, parcial, nueva, ambigua y alto riesgo',()=>{
  const hit=rankHybridMemory('corrige error compilacion repositorio',[memory],{now:Date.parse('2026-07-22T01:00:00Z')});
  expect(hit).toHaveLength(1);
  const scenarios=[
   {name:'conocida',reuse:chooseRuntimeReuse('Ejecuta typecheck pruebas y build del repositorio',[known]),budget:decideCallBudget({prompt:'Ejecuta typecheck pruebas y build del repositorio',reuse:'deterministic',requestedPasses:3,reasoningLevel:'high'}),expected:0},
   {name:'parcial',reuse:chooseRuntimeReuse('Analiza un error nuevo del repositorio',[{...known,mode:'context',deterministicOutput:undefined,trigger:'analiza error del repositorio'}]),budget:decideCallBudget({prompt:'Analiza un error nuevo del repositorio',reuse:'assist',requestedPasses:3,reasoningLevel:'high'}),expected:1},
   {name:'nueva',reuse:chooseRuntimeReuse('clasifica y normaliza nuevos datos',[]),budget:decideCallBudget({prompt:'clasifica y normaliza nuevos datos',reuse:'escalate',requestedPasses:3,reasoningLevel:'high'}),expected:1},
   {name:'ambigua',reuse:chooseRuntimeReuse('Audita una arquitectura nueva, compara alternativas y diagnostica riesgos de seguridad con dependencias múltiples antes de una migración irreversible.',[]),budget:decideCallBudget({prompt:'Audita una arquitectura nueva, compara alternativas y diagnostica riesgos de seguridad con dependencias múltiples antes de una migración irreversible.',reuse:'escalate',requestedPasses:3,reasoningLevel:'high'}),expected:3},
   {name:'alto-riesgo',reuse:chooseRuntimeReuse('Elimina producción y revoca el token',[known]),budget:decideCallBudget({prompt:'Elimina producción y revoca el token',reuse:'deterministic',requestedPasses:3,reasoningLevel:'high'}),expected:0}
  ];
  expect(scenarios.map(s=>({name:s.name,calls:s.budget.maxAdvancedCalls}))).toEqual([
   {name:'conocida',calls:0},{name:'parcial',calls:1},{name:'nueva',calls:1},{name:'ambigua',calls:3},{name:'alto-riesgo',calls:0}
  ]);
  expect(scenarios[0].reuse.kind).toBe('deterministic');
  expect(scenarios[4].reuse.kind).toBe('blocked');
  expect(scenarios.every(s=>s.budget.maxAdvancedCalls===s.expected)).toBe(true);
  const baseline=scenarios.length*3,actual=scenarios.reduce((sum,s)=>sum+s.budget.maxAdvancedCalls,0);
  expect({baseline,actual,saved:baseline-actual,savingsRate:(baseline-actual)/baseline}).toEqual({baseline:15,actual:5,saved:10,savingsRate:2/3});
 });
});
