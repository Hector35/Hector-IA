import {describe,expect,it} from 'vitest';
import {CAPABILITY_MATRIX,PRODUCT_FACTS,PRODUCT_KNOWLEDGE_VERIFIED_AT,knowledgeNeedsFreshSource,renderProductKnowledge} from './product-knowledge';

describe('product knowledge',()=>{
 it('cubre identidad, propietario y productos externos sin mezclar capas',()=>{
  expect(new Set(PRODUCT_FACTS.map(x=>x.subject))).toEqual(new Set(['hector-os','openai','work','codex','gpt-5.6','owner']));
  const rendered=renderProductKnowledge();
  expect(rendered).toContain('Héctor OS');
  expect(rendered).toContain('modelo externo');
  expect(rendered).toContain('GPT‑5.6');
  expect(rendered).toContain(PRODUCT_KNOWLEDGE_VERIFIED_AT);
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
  expect(CAPABILITY_MATRIX.length).toBeGreaterThanOrEqual(8);
  for(const item of CAPABILITY_MATRIX){
   expect(item.components.length).toBeGreaterThan(0);
   expect(item.evidence.length).toBeGreaterThan(10);
   expect(item.limit.length).toBeGreaterThan(10);
  }
 });
});
