import {describe,expect,it} from 'vitest';
import {compressMemoryContext,rankHybridMemory,shouldUseEmbedding,type HybridMemoryItem} from './hybrid-memory';

const base=(id:string,text:string,tags:string[],verified=true):HybridMemoryItem=>({id,userId:'u1',sourceType:'experience',sourceId:id,title:text,content:`Procedimiento verificado para ${text}. Ejecutar pasos y comprobar resultado.`,normalizedText:text,tags,verified,successRate:.9,confidence:.9,estimatedCostUsd:.02,createdAt:'2026-07-20T00:00:00Z',updatedAt:'2026-07-21T00:00:00Z'});

describe('hybrid memory benchmark',()=>{
 it('reduce el contexto conservando el candidato correcto',()=>{
  const corpus=[
   base('ts','corregir compilacion typescript',['github-code','typecheck']),
   base('deploy','desplegar worker cloudflare',['cloudflare','deploy']),
   base('medical','evaluar paciente medico',['medical']),
   base('legacy','corregir compilacion javascript antiguo',['github-code'],false)
  ];
  const hits=rankHybridMemory('corrige compilación TypeScript y ejecuta typecheck',corpus,{limit:3,now:Date.parse('2026-07-22T00:00:00Z')});
  expect(hits[0]?.sourceId).toBe('ts');
  expect(hits.some(hit=>hit.sourceId==='medical')).toBe(false);
  const rawChars=corpus.reduce((sum,item)=>sum+item.content.length,0),compressed=compressMemoryContext(hits,420);
  expect(compressed.length).toBeLessThan(rawChars);
  expect(compressed).toContain('typecheck');
  expect(shouldUseEmbedding({query:'corrige compilación TypeScript y ejecuta typecheck',bestLexicalScore:hits[0]?.lexicalScore??0,candidateCount:corpus.length})).toBe(false);
 });
});
