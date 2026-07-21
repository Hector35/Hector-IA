import type {Bindings} from '../types';
import {relevantMemories} from './openai';

export type ContextMessage={role:'user'|'assistant';content:string};
export type ContextPack={system:string;memories:string[];summary?:string;priorSummaries:string[];recentMessages:ContextMessage[];projectState:string[]};

export const EMBEDDING_MODEL='text-embedding-3-small';
export const EMBEDDING_DIMENSIONS=512;
export const MAX_EMBEDDING_BACKFILL=6;
export const MIN_SEMANTIC_SCORE=0.35;
export const MAX_SEMANTIC_MEMORIES=8;

export type MemoryRow={id:string;content:string;model?:string|null;dimensions?:number|null;vector_json?:string|null};
export type SemanticCandidate={id:string;content:string;vector:number[]};

type EmbeddingResponse={data?:Array<{index:number;embedding:number[]}>;error?:{message?:string}};

export function cosineSimilarity(a:number[],b:number[]){
  if(!a.length||a.length!==b.length)return 0;
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa&&bb?dot/(Math.sqrt(aa)*Math.sqrt(bb)):0;
}

export function parseEmbedding(value:string|null|undefined){
  if(!value)return null;
  try{
    const parsed=JSON.parse(value);
    if(!Array.isArray(parsed)||!parsed.length||parsed.some(x=>typeof x!=='number'||!Number.isFinite(x)))return null;
    return parsed as number[];
  }catch{return null;}
}

export function embeddingNeedsRefresh(row:MemoryRow){
  const vector=parseEmbedding(row.vector_json);
  return !vector||row.model!==EMBEDDING_MODEL||row.dimensions!==EMBEDDING_DIMENSIONS||vector.length!==EMBEDDING_DIMENSIONS;
}

export function selectEmbeddingBackfill(rows:MemoryRow[],lexical:string[],limit=MAX_EMBEDDING_BACKFILL){
  const lexicalRank=new Map(lexical.map((content,index)=>[content,index]));
  return rows
    .map((row,index)=>({row,index,lexicalRank:lexicalRank.get(row.content)}))
    .filter(x=>embeddingNeedsRefresh(x.row))
    .sort((a,b)=>{
      const ar=a.lexicalRank??Number.MAX_SAFE_INTEGER,br=b.lexicalRank??Number.MAX_SAFE_INTEGER;
      return ar-br||a.index-b.index;
    })
    .slice(0,Math.max(0,limit))
    .map(x=>x.row);
}

export function rankSemanticMemories(query:number[],items:SemanticCandidate[],minimumScore=MIN_SEMANTIC_SCORE,limit=MAX_SEMANTIC_MEMORIES){
  const candidates=new Map<string,SemanticCandidate>();
  for(const item of items)candidates.set(item.id,item);
  return [...candidates.values()]
    .map(x=>({content:x.content,score:cosineSimilarity(query,x.vector)}))
    .filter(x=>x.score>=minimumScore)
    .sort((a,b)=>b.score-a.score)
    .slice(0,Math.max(0,limit))
    .map(x=>x.content);
}

async function embedMany(env:Bindings,inputs:string[]){
  if(!inputs.length)return [];
  const response=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:EMBEDDING_MODEL,input:inputs,dimensions:EMBEDDING_DIMENSIONS})});
  const data=await response.json<EmbeddingResponse>();
  if(!response.ok)throw new Error(data?.error?.message||'Error de embeddings');
  const ordered=[...(data.data||[])].sort((a,b)=>a.index-b.index).map(x=>x.embedding);
  if(ordered.length!==inputs.length||ordered.some(vector=>vector.length!==EMBEDDING_DIMENSIONS||vector.some(x=>!Number.isFinite(x))))throw new Error('Respuesta de embeddings inválida');
  return ordered;
}

async function persistEmbeddingBackfill(env:Bindings,userId:string,items:SemanticCandidate[]){
  if(!items.length)return;
  try{
    await env.DB.batch(items.map(item=>env.DB.prepare(`INSERT INTO memory_embeddings(memory_id,user_id,model,dimensions,vector_json,updated_at)
      VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(memory_id) DO UPDATE SET user_id=excluded.user_id,model=excluded.model,dimensions=excluded.dimensions,vector_json=excluded.vector_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(item.id,userId,EMBEDDING_MODEL,EMBEDDING_DIMENSIONS,JSON.stringify(item.vector))));
  }catch{}
}

async function semanticMemories(env:Bindings,userId:string,input:string,rows:MemoryRow[],lexical:string[]){
  const backfill=selectEmbeddingBackfill(rows,lexical);
  const existing=rows.flatMap(row=>{
    if(embeddingNeedsRefresh(row))return [];
    const vector=parseEmbedding(row.vector_json);
    return vector?[{id:row.id,content:row.content,vector}]:[];
  });
  if(!existing.length&&!backfill.length)return [];
  try{
    const vectors=await embedMany(env,[input,...backfill.map(x=>x.content)]),query=vectors[0];
    const refreshed=backfill.map((row,index)=>({id:row.id,content:row.content,vector:vectors[index+1]}));
    await persistEmbeddingBackfill(env,userId,refreshed);
    return rankSemanticMemories(query,[...existing,...refreshed]);
  }catch{return [];}
}

export async function loadContextPack(env:Bindings,userId:string,conversationId:string|undefined,input:string):Promise<ContextPack>{
  const db=env.DB;
  const [systemRows,memoryRows,summaryRow,priorRows,recentRows,workRows,updateRows]=await Promise.all([
    db.prepare("SELECT category,content FROM system_context WHERE active=1 ORDER BY priority DESC,context_key").all<{category:string;content:string}>(),
    db.prepare("SELECT m.id,m.content,e.model,e.dimensions,e.vector_json FROM memories m LEFT JOIN memory_embeddings e ON e.memory_id=m.id WHERE m.user_id=? ORDER BY m.importance DESC,m.updated_at DESC LIMIT 150").bind(userId).all<MemoryRow>(),
    conversationId?db.prepare("SELECT summary FROM conversation_summaries WHERE conversation_id=? AND user_id=?").bind(conversationId,userId).first<{summary:string}>():Promise.resolve(null),
    db.prepare("SELECT summary FROM conversation_summaries WHERE user_id=? AND (? IS NULL OR conversation_id<>?) ORDER BY updated_at DESC LIMIT 4").bind(userId,conversationId||null,conversationId||null).all<{summary:string}>(),
    conversationId?db.prepare("SELECT role,content FROM messages WHERE conversation_id=? AND conversation_id IN (SELECT id FROM conversations WHERE user_id=?) ORDER BY created_at DESC LIMIT 16").bind(conversationId,userId).all<ContextMessage>():Promise.resolve({results:[]} as any),
    db.prepare("SELECT kind,status,progress,result FROM work_jobs WHERE user_id=? ORDER BY updated_at DESC LIMIT 3").bind(userId).all<any>(),
    db.prepare("SELECT request_text,status FROM update_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 3").bind(userId).all<any>()
  ]);
  const rows=memoryRows.results||[];
  const lexical=relevantMemories(input,rows.map(x=>x.content));
  const semantic=await semanticMemories(env,userId,input,rows,lexical);
  const memories=[...new Set([...semantic,...lexical])].slice(0,12);
  const system=(systemRows.results||[]).map(x=>`[${x.category}] ${x.content}`).join('\n');
  const priorSummaries=(priorRows.results||[]).map(x=>x.summary).filter(Boolean);
  const recentMessages=[...(recentRows.results||[])].reverse().map(x=>({role:x.role,content:x.content}));
  const projectState=[...(workRows.results||[]).map((x:any)=>`Trabajo ${x.kind}: ${x.status}, progreso ${x.progress}%${x.result?`, resultado: ${String(x.result).slice(0,240)}`:''}`),...(updateRows.results||[]).map((x:any)=>`Solicitud de mejora (${x.status}): ${String(x.request_text).slice(0,240)}`)];
  return{system,memories,summary:summaryRow?.summary,priorSummaries,recentMessages,projectState};
}

export function renderContext(pack:ContextPack){return['CONTEXTO PERMANENTE DEL SISTEMA',pack.system||'- No disponible','MEMORIA RELEVANTE DEL PROPIETARIO',pack.memories.length?pack.memories.map(x=>`- ${x}`).join('\n'):'- Sin memoria relevante','RESUMEN DE ESTA CONVERSACIÓN',pack.summary||'- Aún no existe resumen persistente','RESÚMENES DE CONVERSACIONES RECIENTES',pack.priorSummaries.length?pack.priorSummaries.map((x,i)=>`Conversación ${i+1}: ${x}`).join('\n\n'):'- No hay conversaciones resumidas anteriores','ESTADO RECIENTE DEL PROYECTO',pack.projectState.length?pack.projectState.map(x=>`- ${x}`).join('\n'):'- Sin trabajos o mejoras recientes'].join('\n\n');}

export async function maybeSaveExplicitMemory(env:Bindings,userId:string,message:string){
  const match=message.match(/(?:recuerda(?: que)?|guarda(?: que)?|mi preferencia es|prefiero que|siempre quiero que)\s*[:,-]?\s*(.{8,500})/i);
  if(!match)return null;
  const content=match[1].trim(),db=env.DB;
  const duplicate=await db.prepare("SELECT id FROM memories WHERE user_id=? AND lower(content)=lower(?) LIMIT 1").bind(userId,content).first();
  if(duplicate)return null;
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,'preference',?,4,'conversation-explicit')").bind(id,userId,content).run();
  try{const [vector]=await embedMany(env,[content]);await db.prepare('INSERT INTO memory_embeddings(memory_id,user_id,model,dimensions,vector_json) VALUES(?,?,?,?,?)').bind(id,userId,EMBEDDING_MODEL,vector.length,JSON.stringify(vector)).run();}catch{}
  return{id,content};
}
