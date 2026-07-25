import {describe,expect,it} from 'vitest';
import {buildCognitiveRepairPrompt,cognitiveRuntimeManifest,createCognitiveRuntimePlan,createCognitiveRuntimeTelemetry,verifyCognitiveResponse} from './cognitive-runtime';

describe('cognitive runtime',()=>{
 it('reserva el modo máximo para solicitudes explícitas y define criterios observables',()=>{
  const plan=createCognitiveRuntimePlan({prompt:'Usa razonamiento alto, audita la arquitectura, compara alternativas e implementa la mejor con pruebas.',tier:'deep',mode:'ensemble',reasoning:'high'});
  expect(plan).toMatchObject({effort:'max',maxAttempts:2,verificationRequired:true,version:'1.1.0'});
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
  expect(verification.failedCriteria).toEqual(expect.arrayContaining(['implementation-evidence','code-evidence']));
 });

 it('acepta una implementación con archivo, prueba y resultado observable',()=>{
  const prompt='Implementa la corrección del API y verifica el build.';
  const plan=createCognitiveRuntimePlan({prompt,tier:'deep',mode:'single',reasoning:'high'});
  const text='Modifiqué worker/routes/chat.ts para validar el cuerpo antes de ejecutar el endpoint /api/chat. Agregué una prueba Vitest de regresión para entradas vacías y ejecuté npm run typecheck, npm test y npm run build; los tres comandos pasaron correctamente con 0 fallos.';
  const verification=verifyCognitiveResponse({prompt,text,plan});
  expect(verification.accepted).toBe(true);
  expect(verification.failedCriteria).toEqual([]);
 });

 it('rechaza un número presente cuando no coincide con la operación solicitada',()=>{
  const prompt='Calcula 17 × 6.';
  const plan=createCognitiveRuntimePlan({prompt,tier:'balanced',mode:'single',reasoning:'medium'});
  const failed=verifyCognitiveResponse({prompt,text:'El resultado es 101.',plan});
  const accepted=verifyCognitiveResponse({prompt,text:'17 × 6 = 102.',plan});
  expect(failed.failedCriteria).toContain('numeric-result');
  expect(accepted.failedCriteria).not.toContain('numeric-result');
 });

 it('obliga a reconocer el límite cuando la solicitud depende de actualidad sin búsqueda',()=>{
  const prompt='¿Cuál es la versión actual y más reciente del modelo?';
  const plan=createCognitiveRuntimePlan({prompt,tier:'balanced',mode:'single',reasoning:'medium'});
  const failed=verifyCognitiveResponse({prompt,text:'La versión más reciente es X.',plan,searchedWeb:false});
  const accepted=verifyCognitiveResponse({prompt,text:'No puedo verificar la versión actual sin una fuente en vivo; debe confirmarse con la documentación oficial fechada.',plan,searchedWeb:false});
  expect(failed.failedCriteria).toContain('freshness-honesty');
  expect(accepted.failedCriteria).not.toContain('freshness-honesty');
 });

 it('exige calibración para una auditoría de riesgo',()=>{
  const prompt='Audita la seguridad del token y dime si es seguro.';
  const plan=createCognitiveRuntimePlan({prompt,tier:'deep',mode:'single',reasoning:'high'});
  const failed=verifyCognitiveResponse({prompt,text:'Es seguro y está bien configurado.',plan});
  const accepted=verifyCognitiveResponse({prompt,text:'Hecho observado: el token no aparece en el archivo revisado. Inferencia con confianza media: no hay exposición en esa ruta. El riesgo no puede descartarse sin revisar logs y secretos; una filtración o un resultado de escaneo cambiaría la conclusión. Confirma con un escaneo y rota el token si existe cualquier indicio.',plan});
  expect(failed.failedCriteria).toContain('uncertainty-calibration');
  expect(accepted.failedCriteria).not.toContain('uncertainty-calibration');
 });

 it('genera una reparación sin pedir ni exponer razonamiento privado',()=>{
  const prompt='Compara A y B y recomienda uno.';
  const plan=createCognitiveRuntimePlan({prompt,tier:'deep',mode:'ensemble',reasoning:'high'});
  const verification=verifyCognitiveResponse({prompt,text:'A está bien.',plan});
  const repair=buildCognitiveRepairPrompt({prompt,draft:'A está bien.',verification,plan});
  expect(repair).toContain('CRITERIOS FALLIDOS');
  expect(repair).toContain('No describas razonamiento privado');
  const telemetry=createCognitiveRuntimeTelemetry(plan,[{attempt:1,phase:'solve',provider:'cloudflare',model:'test',verification}]);
  expect(telemetry).toMatchObject({accepted:false,repairs:0,effort:'max',version:'1.1.0'});
  expect(cognitiveRuntimeManifest().stages).toContain('repair-if-needed');
 });
});
