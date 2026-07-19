import type {Bindings} from '../types';
import {relevantMemories} from './openai';

export type ContextMessage={role:'user'|'assistant';content:string};
export type ContextPack={system:string;memories:string[];summary?:string;priorSummaries:string[];recentMessages:ContextMessage[];projectState:string[]};

type MemoryRow={id:string;content:string;vector_json?:string|null};

export function cosineSimilarity(a:number[],b:number[]){
  if(!a.length||a.length!==b.length)return 0;
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa&&bb?dot/(Math.sqrt(aa)*Math.sqrt(bb)):0;
}

async function embed(env:Bindings,input:string){
  const response=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:'text-embedding-3-small',input,dimensions:512})});
  const data=await response.json<any>();
  if(!response.ok)throw new Error(data?.error?.message||'Error de embeddings');
  return data.data?.[0]?.embedding as number[];
}

async function semanticMemories(env:Bindings,userId:string,input:string,rows:MemoryRow[]){
  const embedded=rows.filter(x=>x.vector_json);
  if(!embedded.length)return [];
  try{
    const query=await embed(env,input);
    return embedded.map(x=>({content:x.content,score:cosineSimilarity(query,JSON.parse(x.vector_json||'[]'))})).filter(x=>x.score>=0.35).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.content);
  }catch{return [];}
}

export async function loadContextPack(env:Bindings,userId:string,conversationId:string|undefined,input:string):Promise<ContextPack>{
  const db=env.DB;
  const [systemRows,memoryRows,summaryRow,priorRows,recentRows,workRows,updateRows]=await Promise.all([
    db.prepare("SELECT category,content FROM system_context WHERE active=1 ORDER BY priority DESC,context_key").all<{category:string;content:string}>(),
    db.prepare("SELECT m.id,m.content,e.vector_json FROM memories m LEFT JOIN memory_embeddings e ON e.memory_id=m.id WHERE m.user_id=? ORDER BY m.importance DESC,m.updated_at DESC LIMIT 150").bind(userId).all<MemoryRow>(),
    conversationId?db.prepare("SELECT summary FROM conversation_summaries WHERE conversation_id=? AND user_id=?").bind(conversationId,userId).first<{summary:string}>():Promise.resolve(null),
    db.prepare("SELECT summary FROM conversation_summaries WHERE user_id=? AND (? IS NULL OR conversation_id<>?) ORDER BY updated_at DESC LIMIT 4").bind(userId,conversationId||null,conversationId||null).all<{summary:string}>(),
    conversationId?db.prepare("SELECT role,content FROM messages WHERE conversation_id=? AND conversation_id IN (SELECT id FROM conversations WHERE user_id=?) ORDER BY created_at DESC LIMIT 16").bind(conversationId,userId).all<ContextMessage>():Promise.resolve({results:[]} as any),
    db.prepare("SELECT kind,status,progress,result FROM work_jobs WHERE user_id=? ORDER BY updated_at DESC LIMIT 3").bind(userId).all<any>(),
    db.prepare("SELECT request_text,status FROM update_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 3").bind(userId).all<any>()
  ]);
  const rows=memoryRows.results||[];
  const lexical=relevantMemories(input,rows.map(x=>x.content));
  const semantic=await semanticMemories(env,userId,input,rows);
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
  try{const vector=await embed(env,content);await db.prepare('INSERT INTO memory_embeddings(memory_id,user_id,model,dimensions,vector_json) VALUES(?,?,?,?,?)').bind(id,userId,'text-embedding-3-small',vector.length,JSON.stringify(vector)).run();}catch{}
  return{id,content};
}
