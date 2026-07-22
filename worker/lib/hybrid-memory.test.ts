import {describe,expect,it} from 'vitest';
import {compressMemoryContext,invalidateSemanticCache,lexicalSimilarity,normalizeMemoryText,rankHybridMemory,readSemanticCache,retrieveHybridMemory,shouldUseEmbedding,stablePromptHash,writeSemanticCache,type HybridMemoryItem} from './hybrid-memory';

const item=(overrides:Partial<HybridMemoryItem>={}):HybridMemoryItem=>({id:'m1',userId:'u1',sourceType:'experience',sourceId:'e1',title:'Corregir compilación TypeScript',content:'Ejecutar typecheck, localizar error y validar pruebas.',normalizedText:'corregir compilacion typescript ejecutar typecheck pruebas',tags:['github-code','typecheck'],verified:true,successRate:.95,confidence:.92,estimatedCostUsd:.02,createdAt:'2026-07-20T00:00:00Z',updatedAt:'2026-07-21T00:00:00Z',...overrides});

describe('hybrid memory',()=>{
 it('normaliza y compara sin depender de embeddings',()=>{
  expect(normalizeMemoryText('Compilación MÉDICA')).toBe('compilacion medica');
  expect(lexicalSimilarity('corrige compilación typescript','corregir compilacion typescript')).toBeGreaterThan(.5);
 });
 it('aísla no verificados, deduplica y evita contaminación semántica',()=>{
  const hits=rankHybridMemory('corrige error de compilación TypeScript',[
   item(),item({id:'duplicate',content:'menos completo',confidence:.4}),
   item({id:'medical',sourceId:'med',title:'Evaluar paciente',normalizedText:'evaluar paciente medico',content:'Revisar expediente',tags:['medical']}),
   item({id:'unsafe',sourceId:'unsafe',verified:false})
  ],{now:Date.parse('2026-07-22T00:00:00Z')});
  expect(hits.map(hit=>hit.sourceId)).toEqual(['e1']);
 });
 it('solo recomienda embeddings gratuitos en la zona ambigua',()=>{
  expect(shouldUseEmbedding({query:'corrige compilacion typescript',bestLexicalScore:.8,candidateCount:20})).toBe(false);
  expect(shouldUseEmbedding({query:'analiza comportamiento inesperado complejo',bestLexicalScore:.3,candidateCount:8})).toBe(true);
  expect(shouldUseEmbedding({query:'hola',bestLexicalScore:.2,candidateCount:8})).toBe(false);
 });
 it('comprime contexto y respeta el presupuesto',()=>{
  const hits=rankHybridMemory('corrige compilación TypeScript',[item()],{now:Date.parse('2026-07-22T00:00:00Z')});
  const context=compressMemoryContext(hits,500);
  expect(context.length).toBeLessThanOrEqual(500);
  expect(context).toContain('experience:e1');
 });
 it('produce hashes estables',()=>expect(stablePromptHash('  Corrige compilación ')).toBe(stablePromptHash('corrige compilacion')));
 it('recupera experiencias verificadas y calcula si hace falta embedding',async()=>{
  const db={prepare:(sql:string)=>({bind:(..._values:unknown[])=>({all:async()=>sql.includes('memory_items_fts')?{results:[]}:{results:[{id:'e1',user_id:'u1',objective:'Corregir compilación TypeScript',objective_normalized:'corregir compilacion typescript',result:'Ejecutar typecheck y pruebas',skills_json:'["github-code"]',verified:1,attempts:1,estimated_cost_usd:.02,created_at:'2026-07-21T00:00:00Z'}]}})})} as any;
  const result=await retrieveHybridMemory(db,'u1','corrige compilación typescript');
  expect(result.hits).toHaveLength(1);expect(result.embeddingRecommended).toBe(false);expect(result.context).toContain('typecheck');
 });
 it('lee, escribe e invalida caché sin exponer otros usuarios',async()=>{
  let stored:string|null=null,deleted=false;
  const db={prepare:(sql:string)=>({bind:(...values:unknown[])=>({first:async()=>stored?{response_json:stored}:null,run:async()=>{if(sql.startsWith('DELETE'))deleted=true;else stored=String(values[5]);}})})} as any;
  expect(await writeSemanticCache(db,{userId:'u1',namespace:'routing',prompt:'clasifica tarea',response:{tier:'free'},confidence:.9})).toBe(true);
  await expect(readSemanticCache(db,'u1','routing','clasifica tarea')).resolves.toEqual({tier:'free'});
  expect(await invalidateSemanticCache(db,'u1','routing')).toBe(true);expect(deleted).toBe(true);
 });
});
