import {describe,expect,it} from 'vitest';
import {HECTOR_OS_CAPABILITIES,KNOWLEDGE_ENTRIES,OWNER_CORE_PROFILE,knowledgeNeedsRefresh,publicSelfModel,renderKnowledge,selectKnowledge} from './knowledge';

describe('Héctor OS knowledge model',()=>{
 it('siempre incluye identidad y propietario, y selecciona el ecosistema por intención',()=>{
  const entries=selectKnowledge('Diferencia Work, Codex y GPT-5.6 de Héctor OS').map(x=>x.id);
  expect(entries).toEqual(expect.arrayContaining(['hector-os-self','owner','work','codex','gpt-5.6']));
 });

 it('no inyecta dominios externos irrelevantes en una consulta personal simple',()=>{
  const entries=selectKnowledge('¿Cómo prefiero aprender?').map(x=>x.id);
  expect(entries).toEqual(['hector-os-self','owner']);
 });

 it('marca conocimiento cambiante como vencido y conserva estable el perfil propio',()=>{
  const gpt=KNOWLEDGE_ENTRIES.find(x=>x.id==='gpt-5.6')!;
  const self=KNOWLEDGE_ENTRIES.find(x=>x.id==='hector-os-self')!;
  expect(knowledgeNeedsRefresh(gpt,Date.parse('2026-08-20T00:00:00Z'))).toBe(true);
  expect(knowledgeNeedsRefresh(self,Date.parse('2030-01-01T00:00:00Z'))).toBe(false);
 });

 it('describe capacidades con componente, evidencia y limitación',()=>{
  expect(HECTOR_OS_CAPABILITIES.length).toBeGreaterThanOrEqual(10);
  for(const capability of HECTOR_OS_CAPABILITIES){
   expect(capability.component.length).toBeGreaterThan(3);
   expect(capability.evidence.length).toBeGreaterThan(3);
   expect(capability.limitation.length).toBeGreaterThan(10);
  }
 });

 it('expone un modelo público sin secretos ni datos médicos o financieros',()=>{
  const model=publicSelfModel({fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol'});
  const serialized=JSON.stringify(model);
  expect(model.identity.name).toBe('Héctor OS');
  expect(model.owner.timezone).toBe('America/Monterrey');
  expect(model.models.reasoning).toBe('gpt-5.6-sol');
  expect(serialized).not.toMatch(/OPENAI_API_KEY|GITHUB_RUNNER_TOKEN|BBVA|metanfetamina|lesión del dedo/i);
 });

 it('renderiza conocimiento de Work, Codex y GPT-5.6 con fuente y fecha',()=>{
  const rendered=renderKnowledge('Explícame Work, Codex y GPT-5.6');
  expect(rendered).toContain('ChatGPT Work');
  expect(rendered).toContain('Codex');
  expect(rendered).toContain('gpt-5.6-sol');
  expect(rendered).toContain('Fuentes:');
  expect(rendered).toContain('2026-07-21');
 });

 it('mantiene un perfil operativo estable de Héctor',()=>{
  expect(OWNER_CORE_PROFILE.name).toBe('Héctor Raúl Hernández Ruiz');
  expect(OWNER_CORE_PROFILE.technicalBackground).toEqual(expect.arrayContaining(['Técnico en Electromecánica','Estudiante de Ingeniería Biomédica']));
  expect(OWNER_CORE_PROFILE.privacyRule).toContain('no se incluyen completos');
 });
});
