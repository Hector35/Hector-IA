import {describe,expect,it} from 'vitest';
import {buildCognitiveRepairPrompt,cognitiveRuntimeManifest,createCognitiveRuntimePlan,createCognitiveRuntimeTelemetry,verifyCognitiveResponse} from './cognitive-runtime';

describe('cognitive runtime',()=>{
 it('reserva el modo máximo para solicitudes explícitas y define criterios observables',()=>{
  const plan=createCognitiveRuntimePlan({prompt:'Usa razonamiento alto, audita la arquitectura, compara alternativas e implementa la mejor con pruebas.',tier:'deep',mode:'ensemble',reasoning:'high'});
  expect(plan).toMatchObject({effort:'max',maxAttempts:2,verificationRequired:true});
  expect(plan.criteria.map(item=>item.id)).toEqual(expect.arrayContaining(['comparison','implementation-evidence']));
 });

 it('mantiene una respuesta breve en una sola pasada cuando la tarea es simple',()=>{
  const plan=createCognitiveRuntimePlan({prompt:'Di hola',tier:'fast',mode:'single',reasoning:'low'});
  expect(plan).toMatchObject({effort:'fast',maxAttempts:1,verificationRequired:false});
 });

 it('rechaza una implementación sin acción ni validación reproducible',()=>{
  const prompt='Implementa la corrección del API y verifica el build.';
  const plan=createCognitiveRuntimePlan({prompt,tier:'deep',mode:'single',reasoning:'high'});
  const verification=verifyCognitiveResponse({prompt,text:'Ya quedó mucho mejor.',plan});
  expect(verification.accepted).toBe(false);
  expect(verification.failedCriteria).toContain('implementation-evidence');
 });

 it('acepta una implementación que declara cambio y evidencia de validación',()=>{
  const prompt='Implementa la corrección del API y verifica el build.';
  const plan=createCognitiveRuntimePlan({prompt,tier:'deep',mode:'single',reasoning:'high'});
  const text='Modifica la ruta /api/chat para validar el cuerpo antes de ejecutar el proveedor. Agrega una prueba de regresión para entradas vacías y ejecuta typecheck, test y build; la implementación solo se considera lista cuando los tres comandos terminan correctamente.';
  const verification=verifyCognitiveResponse({prompt,text,plan});
  expect(verification.accepted).toBe(true);
  expect(verification.failedCriteria).toEqual([]);
 });

 it('obliga a reconocer el límite cuando la solicitud depende de actualidad sin búsqueda',()=>{
  const prompt='¿Cuál es la versión actual y más reciente del modelo?';
  const plan=createCognitiveRuntimePlan({prompt,tier:'balanced',mode:'single',reasoning:'medium'});
  const failed=verifyCognitiveResponse({prompt,text:'La versión más reciente es X.',plan,searchedWeb:false});
  const accepted=verifyCognitiveResponse({prompt,text:'No puedo verificar la versión actual sin una fuente en vivo; debe confirmarse con la documentación oficial fechada.',plan,searchedWeb:false});
  expect(failed.failedCriteria).toContain('freshness-honesty');
  expect(accepted.failedCriteria).not.toContain('freshness-honesty');
 });

 it('genera una reparación sin pedir ni exponer razonamiento privado',()=>{
  const prompt='Compara A y B y recomienda uno.';
  const plan=createCognitiveRuntimePlan({prompt,tier:'deep',mode:'ensemble',reasoning:'high'});
  const verification=verifyCognitiveResponse({prompt,text:'A está bien.',plan});
  const repair=buildCognitiveRepairPrompt({prompt,draft:'A está bien.',verification,plan});
  expect(repair).toContain('CRITERIOS FALLIDOS');
  expect(repair).toContain('No describas razonamiento privado');
  const telemetry=createCognitiveRuntimeTelemetry(plan,[{attempt:1,phase:'solve',provider:'cloudflare',model:'test',verification}]);
  expect(telemetry).toMatchObject({accepted:false,repairs:0,effort:'max'});
  expect(cognitiveRuntimeManifest().stages).toContain('repair-if-needed');
 });
});
