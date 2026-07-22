import {describe,expect,it,vi} from 'vitest';
import {buildRetrievalContext,compressRetrievalContent,rankRetrievalRows,retrieveHybridKnowledge,selectRetrievalStrategy,stableRetrievalHash,type RetrievalDb,type RetrievalRow} from './hybrid-retrieval';

const baseRow=(overrides:Partial<RetrievalRow>={}):RetrievalRow=>({id:'exp-1',user_id:'user-1',kind:'experience',source_id:'exp-1',title:'Corregir compilación del repositorio',content:'Inspeccionar el error, corregir el archivo y ejecutar typecheck, pruebas y build.',tags_json:'["github-code","build"]',evidence_verified:1,success_rate:.92,estimated_cost_usd:.01,created_at:'2026-07-21T00:00:00Z',updated_at:'2026-07-22T00:00:00Z',fts_rank:0,...overrides});

function fakeDb(input:{version?:number;cache?:unknown;fts?:RetrievalRow[];recent?:RetrievalRow[]}){
 const runs:string[]=[];
 const db:RetrievalDb={prepare:(sql:string)=>({
  bind:(...bindings:unknown[])=>({
   bind:()=>{throw new Error('unused');},
   all:async<T>()=>({results:(sql.includes('agent_retrieval_fts')?(input.fts??[]):(input.recent??[])) as T[]}),
   first:async<T>()=>{
    if(sql.includes('agent_retrieval_meta'))return({corpus_version:input.version??0} as T);
    if(sql.includes('agent_retrieval_cache')&&input.cache)return({payload_json:JSON.stringify(input.cache)} as T);
    return null;
   },
   run:async()=>{runs.push(`${sql}|${bindings.length}`);return{};}
  }),
  all:async<T>()=>({results:[] as T[]}),first:async<T>()=>null,run:async()=>({})
 })};
 return{db,runs};
}

describe('hybrid retrieval',()=>{
 it('prioriza evidencia, similitud, éxito y recencia',()=>{
  const recent=baseRow();
  const old=baseRow({id:'old',source_id:'old',updated_at:'2024-01-01T00:00:00Z',fts_rank:1});
  const unverified=baseRow({id:'bad',source_id:'bad',evidence_verified:0,fts_rank:0});
  const ranked=rankRetrievalRows('corrige typecheck y build del repositorio',[old,unverified,recent],5,Date.parse('2026-07-22T00:00:00Z'));
  expect(ranked.map(item=>item.id)).toEqual(['exp-1','old']);
  expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
 });

 it('deduplica contenido equivalente aunque provenga de fuentes distintas',()=>{
  const duplicate=baseRow({id:'result-1',kind:'result',source_id:'result-1'});
  const ranked=rankRetrievalRows('corregir compilación',[baseRow(),duplicate],10);
  expect(ranked).toHaveLength(1);
 });

 it('comprime el contexto conservando la parte relacionada',()=>{
  const content=`Introducción irrelevante. ${'Texto de relleno. '.repeat(90)} El error de TypeScript se corrige ejecutando typecheck y revisando el archivo señalado. ${'Más relleno. '.repeat(40)}`;
  const compressed=compressRetrievalContent('error TypeScript typecheck',content,320);
  expect(compressed.length).toBeLessThanOrEqual(320);
  expect(compressed).toContain('typecheck');
  const context=buildRetrievalContext('error TypeScript',[{...rankRetrievalRows('error TypeScript',[baseRow()],1)[0],content:compressed}],600);
  expect(context.length).toBeLessThanOrEqual(600);
 });

 it('evita embeddings cuando FTS y ranking local tienen señal suficiente',()=>{
  expect(selectRetrievalStrategy({query:'corrige typecheck build',lexicalCount:4,topLexicalScore:.5,embeddingAvailable:true})).toMatchObject({useEmbedding:false});
  expect(selectRetrievalStrategy({query:'arquitectura nueva compleja con términos desconocidos',lexicalCount:0,topLexicalScore:0,embeddingAvailable:true})).toMatchObject({useEmbedding:true});
 });

 it('usa caché persistente versionada sin volver a consultar embeddings',async()=>{
  const cached={items:[],context:'contexto cacheado',metrics:{cacheHit:false,corpusVersion:3,candidatesRead:4,returned:0,embeddingCalls:0,contextChars:17,estimatedInputTokens:5}};
  const {db}=fakeDb({version:3,cache:cached});
  const embeddingSearch=vi.fn(async()=>[]);
  const result=await retrieveHybridKnowledge(db,'user-1','consulta conocida',{embeddingSearch});
  expect(result.metrics.cacheHit).toBe(true);
  expect(result.context).toBe('contexto cacheado');
  expect(embeddingSearch).not.toHaveBeenCalled();
 });

 it('consulta embeddings opcionales solo cuando la señal gratuita es insuficiente',async()=>{
  const weak=baseRow({id:'weak',source_id:'weak',title:'nota general',content:'contenido sin relación',fts_rank:null});
  const vector=baseRow({id:'vector',source_id:'vector',title:'Solución de arquitectura',content:'Procedimiento semánticamente relacionado y verificado.',vector_score:.93,fts_rank:null});
  const {db,runs}=fakeDb({version:1,recent:[weak]});
  const embeddingSearch=vi.fn(async()=>[vector]);
  const result=await retrieveHybridKnowledge(db,'user-1','diseña arquitectura cognitiva nueva y reusable',{embeddingSearch,limit:4});
  expect(embeddingSearch).toHaveBeenCalledOnce();
  expect(result.items[0]?.id).toBe('vector');
  expect(result.metrics.embeddingCalls).toBe(1);
  expect(runs.length).toBeGreaterThan(0);
 });

 it('produce claves estables para la misma consulta normalizada',()=>{
  expect(stableRetrievalHash('consulta')).toBe(stableRetrievalHash('consulta'));
  expect(stableRetrievalHash('consulta')).not.toBe(stableRetrievalHash('otra'));
 });
});
