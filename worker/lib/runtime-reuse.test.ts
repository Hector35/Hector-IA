import {describe,expect,it,vi} from 'vitest';
import {chooseRuntimeReuse,runWithRuntimeReuse,type RuntimeReuseCandidate} from './runtime-reuse';

const known:RuntimeReuseCandidate={id:'skill-known',source:'skill',taskType:'github-code',risk:'medium',confidence:.94,successRate:.92,estimatedCostUsd:0,trigger:'ejecuta typecheck pruebas y build del repositorio',procedure:'Ejecutar typecheck, pruebas y build; devolver evidencia.',mode:'deterministic',deterministicOutput:'Validación reutilizada y completada.'};

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

 it('degrada una habilidad fallida al no superar los umbrales',()=>{
  const weak={...known,confidence:.35,successRate:.2};
  expect(chooseRuntimeReuse('Ejecuta typecheck pruebas y build del repositorio',[weak]).kind).toBe('escalate');
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
});
