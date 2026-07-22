export type RetrievalKind='experience'|'skill'|'document'|'result';

export type RetrievalStatement={
 bind:(...values:unknown[])=>RetrievalStatement;
 all:<T>()=>Promise<{results:T[]}>;
 first:<T>()=>Promise<T|null>;
 run:()=>Promise<unknown>;
};

export type RetrievalDb={prepare:(sql:string)=>RetrievalStatement};

export type RetrievalRow={
 id:string;
 user_id:string;
 kind:RetrievalKind;
 source_id:string;
 title:string;
 content:string;
 tags_json:string|null;
 evidence_verified:number;
 success_rate:number|null;
 estimated_cost_usd:number|null;
 created_at:string|null;
 updated_at:string|null;
 fts_rank?:number|null;
 vector_score?:number|null;
};

export type RetrievalItem={
 id:string;
 kind:RetrievalKind;
 sourceId:string;
 title:string;
 content:string;
 tags:string[];
 score:number;
 lexicalScore:number;
 ftsScore:number;
 vectorScore:number;
 successRate:number;
 recencyScore:number;
 estimatedCostUsd:number;
 createdAt:string|null;
 updatedAt:string|null;
};

export type RetrievalMetrics={
 cacheHit:boolean;
 corpusVersion:number;
 candidatesRead:number;
 returned:number;
 embeddingCalls:number;
 contextChars:number;
 estimatedInputTokens:number;
};

export type HybridRetrievalResult={items:RetrievalItem[];context:string;metrics:RetrievalMetrics};
export type EmbeddingSearch=(input:{userId:string;query:string;limit:number})=>Promise<RetrievalRow[]>;

const STOP=new Set(['para','como','esta','este','esto','desde','hasta','sobre','entre','todos','todas','cada','solo','pero','porque','cuando','donde','quiere','quiero','hacer','hace','hector','the','and','for','with','from','that','this']);

export function normalizeRetrievalText(value:string){
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

export function retrievalTerms(value:string){
 return [...new Set(normalizeRetrievalText(value).split(' ').filter(token=>token.length>2&&!STOP.has(token)))];
}

export function retrievalSimilarity(a:string,b:string){
 const left=new Set(retrievalTerms(a)),right=new Set(retrievalTerms(b));
 if(!left.size||!right.size)return 0;
 let shared=0;for(const token of left)if(right.has(token))shared++;
 return shared/(left.size+right.size-shared);
}

export function stableRetrievalHash(value:string){
 let hash=2166136261;
 for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}
 return(hash>>>0).toString(36);
}

function clamp(value:number){return Math.max(0,Math.min(1,Number.isFinite(value)?value:0));}
function parseTags(value:string|null){try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed.filter(item=>typeof item==='string').slice(0,24):[];}catch{return[];}}
function recencyScore(value:string|null,nowMs=Date.now()){
 const timestamp=value?Date.parse(value):NaN;if(!Number.isFinite(timestamp))return.2;
 return Math.exp(-Math.max(0,(nowMs-timestamp)/86_400_000)/180);
}

function rowFingerprint(row:RetrievalRow){
 return normalizeRetrievalText(`${row.title} ${row.content}`).slice(0,420);
}

export function rankRetrievalRows(query:string,rows:RetrievalRow[],limit=12,nowMs=Date.now()){
 const ranked=rows.filter(row=>row.evidence_verified===1&&row.content.trim().length>0).map(row=>{
  const tags=parseTags(row.tags_json),lexicalScore=retrievalSimilarity(query,`${row.title} ${row.content} ${tags.join(' ')}`);
  const ftsOrdinal=Number(row.fts_rank),ftsScore=Number.isFinite(ftsOrdinal)&&ftsOrdinal>=0?1/(1+ftsOrdinal*.22):0;
  const vectorScore=clamp(Number(row.vector_score)||0),semanticScore=Math.max(lexicalScore,vectorScore*.95);
  const successRate=clamp(Number(row.success_rate) || .65),recent=recencyScore(row.updated_at||row.created_at,nowMs);
  const cost=Math.max(0,Number(row.estimated_cost_usd)||0),costScore=1/(1+cost*50);
  const score=semanticScore*.46+ftsScore*.18+successRate*.16+recent*.12+costScore*.08;
  return{row,item:{id:row.id,kind:row.kind,sourceId:row.source_id,title:row.title,content:row.content,tags,score,lexicalScore,ftsScore,vectorScore,successRate,recencyScore:recent,estimatedCostUsd:cost,createdAt:row.created_at,updatedAt:row.updated_at} satisfies RetrievalItem};
 }).filter(entry=>entry.item.score>=.18&&(entry.item.lexicalScore>=.06||entry.item.ftsScore>0||entry.item.vectorScore>=.45));
 const bestByFingerprint=new Map<string,typeof ranked[number]>();
 for(const entry of ranked){const key=rowFingerprint(entry.row);const current=bestByFingerprint.get(key);if(!current||entry.item.score>current.item.score)bestByFingerprint.set(key,entry);}
 return[...bestByFingerprint.values()].map(entry=>entry.item).sort((a,b)=>b.score-a.score||b.successRate-a.successRate||b.recencyScore-a.recencyScore).slice(0,limit);
}

export function selectRetrievalStrategy(input:{query:string;lexicalCount:number;topLexicalScore:number;embeddingAvailable:boolean}){
 const terms=retrievalTerms(input.query);
 if(!input.embeddingAvailable)return{useFts:true,useEmbedding:false,reason:'No hay proveedor de embeddings; FTS y ranking local son suficientes.'};
 if(input.topLexicalScore>=.42||input.lexicalCount>=4)return{useFts:true,useEmbedding:false,reason:'La recuperación léxica ya tiene cobertura suficiente.'};
 if(terms.length<=2)return{useFts:true,useEmbedding:false,reason:'Consulta demasiado corta; un embedding añadiría costo sin señal suficiente.'};
 return{useFts:true,useEmbedding:true,reason:'Cobertura léxica insuficiente; se habilita embedding opcional.'};
}

export function compressRetrievalContent(query:string,content:string,maxChars=1200){
 const clean=content.trim();if(clean.length<=maxChars)return clean;
 const queryTerms=new Set(retrievalTerms(query));
 const pieces=clean.split(/(?<=[.!?])\s+|\n+/).map((text,index)=>({text:text.trim(),index})).filter(item=>item.text.length>0);
 const scored=pieces.map(item=>{
  const terms=retrievalTerms(item.text);let overlap=0;for(const term of terms)if(queryTerms.has(term))overlap++;
  return{...item,score:overlap/Math.max(1,queryTerms.size)+Math.max(0,.08-item.index*.002)};
 }).sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected:typeof scored=[];let used=0;
 for(const item of scored){if(used+item.text.length+1>maxChars)continue;selected.push(item);used+=item.text.length+1;if(used>=maxChars*.82)break;}
 const result=selected.sort((a,b)=>a.index-b.index).map(item=>item.text).join('\n');
 return(result||clean.slice(0,maxChars)).slice(0,maxChars);
}

export function buildRetrievalContext(query:string,items:RetrievalItem[],maxChars=5200){
 const blocks:string[]=[];let used=0;
 for(const item of items){
  const body=compressRetrievalContent(query,item.content,Math.min(1400,Math.max(480,maxChars-used-120)));
  const block=`FUENTE ${item.kind.toUpperCase()} ${item.sourceId}\nRelevancia: ${item.score.toFixed(3)} · éxito: ${item.successRate.toFixed(2)}\n${item.title}\n${body}`;
  if(used+block.length+2>maxChars)break;blocks.push(block);used+=block.length+2;
 }
 return blocks.join('\n\n');
}

function safeFtsQuery(query:string){return retrievalTerms(query).slice(0,12).map(term=>`"${term.replace(/"/g,'')}"*`).join(' OR ');}

async function corpusVersion(db:RetrievalDb,userId:string){
 try{return Number((await db.prepare('SELECT corpus_version FROM agent_retrieval_meta WHERE user_id=?').bind(userId).first<{corpus_version:number}>())?.corpus_version)||0;}catch{return 0;}
}

async function readCache(db:RetrievalDb,userId:string,queryHash:string,version:number){
 try{
  const row=await db.prepare("SELECT payload_json FROM agent_retrieval_cache WHERE user_id=? AND query_hash=? AND corpus_version=? AND expires_at>datetime('now')").bind(userId,queryHash,version).first<{payload_json:string}>();
  if(!row)return null;const parsed=JSON.parse(row.payload_json) as HybridRetrievalResult;
  return parsed&&Array.isArray(parsed.items)&&typeof parsed.context==='string'?parsed:null;
 }catch{return null;}
}

async function writeCache(db:RetrievalDb,userId:string,queryHash:string,version:number,result:HybridRetrievalResult,ttlMinutes:number){
 try{
  await db.prepare("INSERT INTO agent_retrieval_cache(user_id,query_hash,corpus_version,payload_json,expires_at,created_at) VALUES(?,?,?,?,datetime('now',?),CURRENT_TIMESTAMP) ON CONFLICT(user_id,query_hash,corpus_version) DO UPDATE SET payload_json=excluded.payload_json,expires_at=excluded.expires_at,created_at=CURRENT_TIMESTAMP").bind(userId,queryHash,version,JSON.stringify(result),`+${Math.max(1,ttlMinutes)} minutes`).run();
 }catch{}
}

export async function retrieveHybridKnowledge(db:RetrievalDb,userId:string,query:string,options:{limit?:number;maxContextChars?:number;cacheTtlMinutes?:number;embeddingSearch?:EmbeddingSearch}={}):Promise<HybridRetrievalResult>{
 const limit=Math.max(1,Math.min(24,options.limit??12)),maxContextChars=Math.max(800,Math.min(12_000,options.maxContextChars??5200));
 const version=await corpusVersion(db,userId),queryHash=stableRetrievalHash(`${normalizeRetrievalText(query)}|${limit}|${maxContextChars}`);
 const cached=await readCache(db,userId,queryHash,version);if(cached)return{...cached,metrics:{...cached.metrics,cacheHit:true,corpusVersion:version}};
 const byId=new Map<string,RetrievalRow>();let ftsRows:RetrievalRow[]=[];
 try{
  const fts=safeFtsQuery(query);
  if(fts){
   const rows=(await db.prepare("SELECT i.id,i.user_id,i.kind,i.source_id,i.title,i.content,i.tags_json,i.evidence_verified,i.success_rate,i.estimated_cost_usd,i.created_at,i.updated_at,bm25(agent_retrieval_fts) AS raw_rank FROM agent_retrieval_fts JOIN agent_retrieval_items i ON i.rowid=agent_retrieval_fts.rowid WHERE agent_retrieval_fts MATCH ? AND i.user_id=? AND i.evidence_verified=1 ORDER BY bm25(agent_retrieval_fts) LIMIT ?").bind(fts,userId,Math.max(24,limit*4)).all<RetrievalRow&{raw_rank:number}>()).results;
   ftsRows=rows.map((row,index)=>({...row,fts_rank:index}));for(const row of ftsRows)byId.set(row.id,row);
  }
 }catch{}
 try{
  const rows=(await db.prepare("SELECT id,user_id,kind,source_id,title,content,tags_json,evidence_verified,success_rate,estimated_cost_usd,created_at,updated_at FROM agent_retrieval_items WHERE user_id=? AND evidence_verified=1 ORDER BY updated_at DESC LIMIT 180").bind(userId).all<RetrievalRow>()).results;
  for(const row of rows){const current=byId.get(row.id);byId.set(row.id,current?{...row,fts_rank:current.fts_rank}:row);}
 }catch{}
 let items=rankRetrievalRows(query,[...byId.values()],limit);
 const strategy=selectRetrievalStrategy({query,lexicalCount:items.length,topLexicalScore:items[0]?.lexicalScore??0,embeddingAvailable:Boolean(options.embeddingSearch)});
 let embeddingCalls=0;
 if(strategy.useEmbedding&&options.embeddingSearch){
  try{const rows=await options.embeddingSearch({userId,query,limit:Math.max(24,limit*3)});embeddingCalls=1;for(const row of rows){const current=byId.get(row.id);byId.set(row.id,current?{...current,vector_score:Math.max(Number(current.vector_score)||0,Number(row.vector_score)||0)}:row);}items=rankRetrievalRows(query,[...byId.values()],limit);}catch{}
 }
 const context=buildRetrievalContext(query,items,maxContextChars);
 const result:HybridRetrievalResult={items,context,metrics:{cacheHit:false,corpusVersion:version,candidatesRead:byId.size,returned:items.length,embeddingCalls,contextChars:context.length,estimatedInputTokens:Math.ceil(context.length/4)}};
 await writeCache(db,userId,queryHash,version,result,options.cacheTtlMinutes??30);return result;
}

export async function upsertRetrievalItem(db:RetrievalDb,input:{id:string;userId:string;kind:RetrievalKind;sourceId:string;title:string;content:string;tags?:string[];evidenceVerified:boolean;successRate?:number;estimatedCostUsd?:number;createdAt?:string}){
 await db.prepare("INSERT INTO agent_retrieval_items(id,user_id,kind,source_id,title,content,tags_json,evidence_verified,success_rate,estimated_cost_usd,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP) ON CONFLICT(user_id,kind,source_id) DO UPDATE SET title=excluded.title,content=excluded.content,tags_json=excluded.tags_json,evidence_verified=excluded.evidence_verified,success_rate=excluded.success_rate,estimated_cost_usd=excluded.estimated_cost_usd,updated_at=CURRENT_TIMESTAMP").bind(input.id,input.userId,input.kind,input.sourceId,input.title,input.content,JSON.stringify(input.tags??[]),input.evidenceVerified?1:0,clamp(input.successRate??.65),Math.max(0,input.estimatedCostUsd??0),input.createdAt??null).run();
}

export async function invalidateRetrievalCache(db:RetrievalDb,userId:string){
 try{await db.prepare("INSERT INTO agent_retrieval_meta(user_id,corpus_version,updated_at) VALUES(?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET corpus_version=agent_retrieval_meta.corpus_version+1,updated_at=CURRENT_TIMESTAMP").bind(userId).run();await db.prepare('DELETE FROM agent_retrieval_cache WHERE user_id=?').bind(userId).run();}catch{}
}
