import {describe,expect,it,vi} from 'vitest';
import {chooseRuntimeReuse,experienceRecencyScore,loadRuntimeReuseCandidates,runWithRuntimeReuse,type RuntimeReuseCandidate} from './runtime-reuse';

const known:RuntimeReuseCandidate={id:'skill-known',source:'skill',taskType:'github-code',risk:'medium',confidence:.94,successRate:.92,recencyScore:1,estimatedCostUsd:0,trigger:'ejecuta typecheck pruebas y build del repositorio',procedure:'Ejecutar typecheck, pruebas y build; devolver evidencia.',mode:'deterministic',deterministicOutput:'Validación reutilizada y completada.'};

const contextCandidate:RuntimeReuseCandidate={...known,id:'experience-context',mode:'context',deterministicOutput:undefined,confidence:.74,successRate:.8,trigger:'analiza error desconocido del repositorio',procedure:'Inspeccionar primero el error y los archivos relacionados.'};

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

 it('favorece una experiencia reciente cuando las demás señales empatan',()=>{
  const recent={...contextCandidate,id:'recent',recencyScore:1};
  const old={...contextCandidate,id:'old',recencyScore:.05};
  const decision=chooseRuntimeReuse('Analiza un error desconocido del repositorio',[old,recent]);
  expect(decision.kind).toBe('assist');
  if(decision.kind==='assist')expect(decision.candidate.id).toBe('recent');
  expect(experienceRecencyScore('2026-07-22T00:00:00Z',Date.parse('2026-07-22T00:00:00Z'))).toBe(1);
 });

 it('consulta únicamente experiencias verificadas y aisladas por usuario',async()=>{
  let sql='',bindings:unknown[]=[];
  const db={prepare:(statement:string)=>{sql=statement;return{bind:(...values:unknown[])=>{bindings=values;return{all:async()=>({results:[{id:'verified-1',objective:'Corrige repositorio',result:'Inspeccionar el error y ejecutar pruebas.',skills_json:'["github-code"]',attempts:1,created_at:'2026-07-22T00:00:00Z',estimated_cost_usd:.01}]})};}};}} as any;
  const items=await loadRuntimeReuseCandidates(db,'owner-1');
  expect(sql).toContain("user_id=? AND status='completed' AND verified=1");
  expect(bindings).toEqual(['owner-1']);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({id:'verified-1',taskType:'github-code',estimatedCostUsd:.01});
 });
});
