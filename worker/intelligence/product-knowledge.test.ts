import {describe,expect,it} from 'vitest';
import {CAPABILITY_MATRIX,PRODUCT_FACTS,PRODUCT_KNOWLEDGE_VERIFIED_AT,knowledgeNeedsFreshSource,renderProductKnowledge} from './product-knowledge';
describe('product knowledge',()=>{
 it('cubre identidad y separación de capas',()=>{expect(new Set(PRODUCT_FACTS.map(x=>x.subject))).toEqual(new Set(['hector-os','openai','work','codex','gpt-5.6','owner']));const rendered=renderProductKnowledge();for(const value of ['Héctor OS','Qwen3-4B','OpenAI no está autorizado','entrenamiento',PRODUCT_KNOWLEDGE_VERIFIED_AT])expect(rendered).toContain(value);});
 it('distingue bases, experimentos y campeón',()=>{const rendered=renderProductKnowledge();for(const value of ['Qwen abierto operativo','Base abierta de respaldo','pesos base','no existe un campeón'])expect(rendered).toContain(value);});
 it('reserva OpenAI para entrenamiento y evaluación',()=>{const rendered=renderProductKnowledge();expect(rendered).toContain('No responde el chat interactivo');expect(rendered).toContain('generar datos licenciados');expect(rendered).toContain('evaluación de candidatos');});
 it('incluye deliberación abierta',()=>{const rendered=renderProductKnowledge();for(const value of ['arquitecto','adversario','juez'])expect(rendered).toContain(value);});
 it('marca productos cambiantes',()=>{expect(knowledgeNeedsFreshSource('work')).toBe(true);expect(knowledgeNeedsFreshSource('codex')).toBe(true);expect(knowledgeNeedsFreshSource('gpt-5.6')).toBe(true);expect(knowledgeNeedsFreshSource('owner')).toBe(false);});
 it('vincula capacidades con evidencia y límites',()=>{expect(CAPABILITY_MATRIX.length).toBeGreaterThanOrEqual(9);for(const item of CAPABILITY_MATRIX){expect(item.components.length).toBeGreaterThan(0);expect(item.evidence.length).toBeGreaterThan(10);expect(item.limit.length).toBeGreaterThan(10);}});
});
