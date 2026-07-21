import {describe,expect,it} from 'vitest';
import {CAPABILITY_MATRIX,PRODUCT_FACTS,PRODUCT_KNOWLEDGE_VERIFIED_AT,knowledgeNeedsFreshSource,renderProductKnowledge} from './product-knowledge';
describe('product knowledge',()=>{
 it('cubre todas las capas sin mezclarlas',()=>{expect(new Set(PRODUCT_FACTS.map(x=>x.subject))).toEqual(new Set(['hector-os','openai','work','codex','gpt-5.6','owner']));const text=renderProductKnowledge();expect(text).toContain('Héctor OS');expect(text).toContain('modelo externo');expect(text).toContain(PRODUCT_KNOWLEDGE_VERIFIED_AT);});
 it('conoce Work, Codex y Sol/Terra/Luna',()=>{const text=renderProductKnowledge();for(const value of ['ChatGPT Work','agente de programación','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna','telemetría'])expect(text).toContain(value);});
 it('marca conocimiento cambiante',()=>{expect(knowledgeNeedsFreshSource('work')).toBe(true);expect(knowledgeNeedsFreshSource('codex')).toBe(true);expect(knowledgeNeedsFreshSource('gpt-5.6')).toBe(true);expect(knowledgeNeedsFreshSource('owner')).toBe(false);});
 it('vincula capacidades con componentes, evidencia y límites',()=>{expect(CAPABILITY_MATRIX.length).toBeGreaterThanOrEqual(8);for(const item of CAPABILITY_MATRIX){expect(item.components.length).toBeGreaterThan(0);expect(item.evidence.length).toBeGreaterThan(10);expect(item.limit.length).toBeGreaterThan(10);}});
});
