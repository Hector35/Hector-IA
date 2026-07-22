import {describe,expect,it} from 'vitest';
import {classifyExperienceRisk,normalizeObjective,rankExperiences,renderExperienceContext,retrieveSimilarExperiences,type ExperienceRow} from './experience-retrieval';

const now=Date.parse('2026-07-22T10:00:00Z');
const row=(input:Partial<ExperienceRow>&Pick<ExperienceRow,'id'|'objective'|'result'>):ExperienceRow=>({skills_json:'[]',attempts:1,duration_ms:1000,created_at:'2026-07-21T10:00:00Z',...input});

describe('experience retrieval',()=>{
 it('normaliza acentos, puntuación y espacios',()=>{
  expect(normalizeObjective('  Corrige Héctor-OS: ¡pruebas! ')).toBe('corrige hector os pruebas');
 });

 it('prioriza coincidencia léxica, skill y recencia',()=>{
  const items=rankExperiences([
   row({id:'old-match',objective:'Corrige error de compilación del repositorio',result:'Abrir la rama, localizar el error, corregir y ejecutar typecheck.',skills_json:'["github-code"]',created_at:'2026-01-01T00:00:00Z'}),
   row({id:'recent-match',objective:'Corrige el error de compilación en GitHub',result:'Inspeccionar el fallo, aplicar el cambio mínimo y ejecutar pruebas.',skills_json:'["github-code"]'}),
   row({id:'unrelated',objective:'Resume un documento médico',result:'Extraer secciones y redactar un resumen clínico.'})
  ],{objective:'Corrige un error de compilación del repositorio GitHub',skills:['github-code'],nowMs:now});
  expect(items.map(item=>item.id)).toEqual(['recent-match','old-match']);
 });

 it('aísla experiencias de riesgo alto incompatibles',()=>{
  const items=rankExperiences([
   row({id:'danger',objective:'Eliminar credenciales y desplegar a producción',result:'Revocar secretos y desplegar el sistema.',skills_json:'["github-code"]'})
  ],{objective:'Revisar código del repositorio',skills:['github-code'],nowMs:now});
  expect(items).toEqual([]);
  expect(classifyExperienceRisk('transferir dinero y borrar cuenta')).toBe('high');
 });

 it('descarta falsos positivos aunque sean recientes',()=>{
  const items=rankExperiences([
   row({id:'noise',objective:'Preparar calendario de vacaciones',result:'Ordenar fechas y publicar el calendario.'})
  ],{objective:'Depurar una migración D1',skills:['github-code'],nowMs:now});
  expect(items).toEqual([]);
 });

 it('limita contexto y conserva identificadores trazables',()=>{
  const items=rankExperiences([
   row({id:'trace-1',objective:'Revisar error de repositorio',result:'Aplicar una corrección mínima y ejecutar todas las pruebas.',skills_json:'["github-code"]'})
  ],{objective:'Revisar error de repositorio',skills:['github-code'],nowMs:now});
  const context=renderExperienceContext(items,900);
  expect(context.length).toBeLessThanOrEqual(900);
  expect(context).toContain('[experiencia:trace-1');
 });

 it('consulta exclusivamente las experiencias completadas del usuario solicitado',async()=>{
  let sql='',bindings:unknown[]=[];
  const env={DB:{prepare:(statement:string)=>{sql=statement;return{bind:(...values:unknown[])=>{bindings=values;return{all:async()=>({results:[row({id:'mine',objective:'Corregir repositorio',result:'Corregir y probar.',skills_json:'["github-code"]'})]})};}};}}} as any;
  const result=await retrieveSimilarExperiences(env,{userId:'owner-1',objective:'Corregir repositorio',skills:['github-code']});
  expect(sql).toContain("WHERE user_id=? AND status='completed'");
  expect(bindings[0]).toBe('owner-1');
  expect(result.traceIds).toEqual(['mine']);
 });
});
