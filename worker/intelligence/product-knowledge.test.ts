import {describe,expect,it} from 'vitest';
import {CAPABILITY_MATRIX,PRODUCT_FACTS,PRODUCT_KNOWLEDGE_VERIFIED_AT,knowledgeNeedsFreshSource,renderProductKnowledge} from './product-knowledge';

describe('product knowledge',()=>{
 it('cubre identidad, propietario y productos externos sin mezclar capas',()=>{
  const subjects=new Set(PRODUCT_FACTS.map(x=>x.subject));
  expect(subjects).toEqual(new Set(['hector-os','openai','work','codex','gpt-5.6','owner']));
  const rendered=renderProductKnowledge();
  expect(rendered).toContain('Héctor OS');
  expect(rendered).toContain('modelo externo');
  expect(rendered).toContain('GPT‑5.6');
  expect(rendered).toContain(PRODUCT_KNOWLEDGE_VERIFIED_AT);
 });

 it('marca productos cambiantes para verificación actual',()=>{
  expect(knowledgeNeedsFreshSource('work')).toBe(true);
  expect(knowledgeNeedsFreshSource('codex')).toBe(true);
  expect(knowledgeNeedsFreshSource('gpt-5.6')).toBe(true);
  expect(knowledgeNeedsFreshSource('owner')).toBe(false);
 });

 it('vincula capacidades con componentes, evidencia y límites',()=>{
  expect(CAPABILITY_MATRIX.length).toBeGreaterThanOrEqual(6);
  for(const item of CAPABILITY_MATRIX){
   expect(item.components.length).toBeGreaterThan(0);
   expect(item.evidence.length).toBeGreaterThan(10);
   expect(item.limit.length).toBeGreaterThan(10);
  }
 });
});
