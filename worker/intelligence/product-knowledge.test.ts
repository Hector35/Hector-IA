import {describe,expect,it} from 'vitest';
import {CAPABILITY_MATRIX,PRODUCT_FACTS,PRODUCT_KNOWLEDGE_VERIFIED_AT,knowledgeNeedsFreshSource,renderProductKnowledge} from './product-knowledge';

describe('product knowledge',()=>{
 it('cubre identidad, propietario y productos externos sin mezclar capas',()=>{
  expect(new Set(PRODUCT_FACTS.map(x=>x.subject))).toEqual(new Set(['hector-os','openai','work','codex','gpt-5.6','owner']));
  const rendered=renderProductKnowledge();
  expect(rendered).toContain('Héctor OS');
  expect(rendered).toContain('Héctor Base');
  expect(rendered).toContain('motor avanzado externo');
  expect(rendered).toContain('Qwen3-4B');
  expect(rendered).toContain('GPT‑5.6');
  expect(rendered).toContain(PRODUCT_KNOWLEDGE_VERIFIED_AT);
 });

 it('distingue base operativa, candidato personalizado y campeón',()=>{
  const rendered=renderProductKnowledge();
  expect(rendered).toContain('Base abierta operativa');
  expect(rendered).toContain('pesos todavía no son una adaptación personalizada');
  expect(rendered).toContain('no tiene adaptador entrenado');
  expect(rendered).toContain('campeón propio validado');
 });

 it('incluye Work, Codex, Sol, Terra, Luna y deliberación multiagente',()=>{
  const rendered=renderProductKnowledge();
  for(const value of ['ChatGPT Work','Codex','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna','arquitecto','adversario','juez'])expect(rendered).toContain(value);
 });

 it('marca productos cambiantes para verificación actual',()=>{
  expect(knowledgeNeedsFreshSource('work')).toBe(true);
  expect(knowledgeNeedsFreshSource('codex')).toBe(true);
  expect(knowledgeNeedsFreshSource('gpt-5.6')).toBe(true);
  expect(knowledgeNeedsFreshSource('owner')).toBe(false);
 });

 it('vincula capacidades con componentes, evidencia y límites',()=>{
  expect(CAPABILITY_MATRIX.length).toBeGreaterThanOrEqual(9);
  for(const item of CAPABILITY_MATRIX){
   expect(item.components.length).toBeGreaterThan(0);
   expect(item.evidence.length).toBeGreaterThan(10);
   expect(item.limit.length).toBeGreaterThan(10);
  }
 });
});
