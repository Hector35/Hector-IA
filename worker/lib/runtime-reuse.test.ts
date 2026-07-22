import {describe,expect,it,vi} from 'vitest';
import {chooseRuntimeReuse,loadRuntimeReuseCandidates,runWithRuntimeReuse,type RuntimeReuseCandidate} from './runtime-reuse';

const known:RuntimeReuseCandidate={id:'skill-known',source:'skill',taskType:'github-code',risk:'medium',confidence:.94,successRate:.92,estimatedCostUsd:0,trigger:'ejecuta typecheck pruebas y build del repositorio',procedure:'Ejecutar typecheck, pruebas y build; devolver evidencia.',mode:'deterministic',deterministicOutput:'Validación reutilizada y completada.'};

const contextCandidate:RuntimeReuseCandidate={...known,id:'experience-context',mode:'context',deterministicOutput:undefined,confidence:.74,successRate:.8,trigger:'analiza error desconocido del repositorio',procedure:'Inspeccionar primero el error y los archivos relacionados.'};

type ReuseDb=Parameters<typeof loadRuntimeReuseCandidates>[0];

function dbWithRows(rows:unknown[]){
 const prepare=vi.fn((_sql:string)=>({
  bind:vi.fn((..._values:unknown[])=>({
   all:async<T>()=>({results:rows as T[]})
  }))
 }));
 return{db:{prepare} as unknown as ReuseDb,prepare};
}

describe('runtime reuse engine',()=>{
 it('resuelve una tarea conocida sin llamar al modelo',async()=>{
  const model=vi.fn(async()=>({text:'modelo'}));
  const result=await runWithRuntimeReuse({prompt:'Ejecuta typecheck, pruebas y build del repositorio',candidates:[known],model,deterministic:output=>({text:output})});
  expect(result.modelCalls).toBe(0);expect(model).not.toHaveBeenCalled();expect(result.value.text).toContain('completada');
 });

 it('escala una tarea ambigua y conserva el fallback',async()=>{
  const model=vi.fn(async context=>({text:'resuelto',context}));
  const result=await runWithRuntimeReuse({prompt:'descubre una arquitectura completamente nueva',candidates:[known],model,deterministic:output=>({text:output})});
  expect(result.modelCalls).toBe(1);expect(result.decision.kind).toBe('escalate');expect(model).toHaveBeenCalledWith('');
 });

 it('reutiliza contexto sin fingir resolución determinista',async()=>{
  const model=vi.fn(async context=>context);
  const result=await runWithRuntimeReuse({prompt:'Analiza un error desconocido del repositorio',candidates:[contextCandidate],model,deterministic:output=>output});
  expect(result.decision.kind).toBe('assist');expect(result.modelCalls).toBe(1);expect(model.mock.calls[0][0]).toContain('Procedimiento verificado');
 });

 it('degrada una habilidad fallida y evita que omita el modelo',async()=>{
  const weak={...known,confidence:.35,successRate:.2};
  const model=vi.fn(async()=>({text:'revisado por modelo'}));
  const result=await runWithRuntimeReuse({prompt:'Ejecuta typecheck pruebas y build del repositorio',candidates:[weak],model,deterministic:output=>({text:output})});
  expect(chooseRuntimeReuse('Ejecuta typecheck pruebas y build del repositorio',[weak]).kind).toBe('assist');
  expect(result.modelCalls).toBe(1);expect(model).toHaveBeenCalledOnce();
 });

 it('bloquea acciones de alto riesgo sin autorización',async()=>{
  const model=vi.fn(async()=>({text:'no debe ejecutarse'}));
  await expect(runWithRuntimeReuse({prompt:'Elimina producción y revoca el token',candidates:[known],model,deterministic:output=>({text:output})})).rejects.toThrow('autorización explícita');
  expect(model).not.toHaveBeenCalled();
 });

 it('permite evaluar alto riesgo cuando existe autorización explícita',()=>{
  const candidate={...known,risk:'high' as const,trigger:'elimina despliegue temporal verificado'};
  expect(chooseRuntimeReuse('Elimina el despliegue temporal verificado',[candidate],{authorizedHighRisk:true}).kind).not.toBe('blocked');
 });

 it('carga únicamente experiencias con evidencia objetivamente verificada',async()=>{
  const verified={id:'verified',objective:'Ejecuta pruebas del repositorio',objective_normalized:'ejecuta pruebas del repositorio',result:'Procedimiento comprobado\nREUSABLE_OUTPUT: pruebas aprobadas',skills_json:'["github-code"]',attempts:1,evidence_json:'[{"kind":"test","verified":true}]',verified:1};
  const unverified={...verified,id:'unverified',evidence_json:'[{"kind":"nota","verified":false}]'};
  const legacy={...verified,id:'legacy',evidence_json:'[]'};
  const {db,prepare}=dbWithRows([verified,unverified,legacy]);
  const candidates=await loadRuntimeReuseCandidates(db,'user-1');
  expect(candidates.map(item=>item.id)).toEqual(['verified']);
  expect(candidates[0]).toMatchObject({mode:'deterministic',deterministicOutput:'pruebas aprobadas'});
  expect(String(prepare.mock.calls[0]?.[0])).toContain('verified=1');
 });

 it('mantiene fallback seguro si el esquema todavía no está disponible',async()=>{
  const db:ReuseDb={prepare:()=>({bind:()=>({all:async<T>()=>{throw new Error('missing column');}})})};
  await expect(loadRuntimeReuseCandidates(db,'user-1')).resolves.toEqual([]);
 });
});
