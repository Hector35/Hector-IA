import type { D1Database } from '@cloudflare/workers-types';
import { relevantMemories } from './openai';

export type ContextMessage={role:'user'|'assistant';content:string};
export type ContextPack={
  system:string;
  memories:string[];
  summary?:string;
  recentMessages:ContextMessage[];
  projectState:string[];
};

export async function loadContextPack(db:D1Database,userId:string,conversationId:string|undefined,input:string):Promise<ContextPack>{
  const [systemRows,memoryRows,summaryRow,recentRows,workRows,updateRows]=await Promise.all([
    db.prepare("SELECT category,content FROM system_context WHERE active=1 ORDER BY priority DESC,context_key").all<{category:string;content:string}>(),
    db.prepare("SELECT content FROM memories WHERE user_id=? ORDER BY importance DESC,updated_at DESC LIMIT 100").bind(userId).all<{content:string}>(),
    conversationId?db.prepare("SELECT summary FROM conversation_summaries WHERE conversation_id=? AND user_id=?").bind(conversationId,userId).first<{summary:string}>():Promise.resolve(null),
    conversationId?db.prepare("SELECT role,content FROM messages WHERE conversation_id=? AND conversation_id IN (SELECT id FROM conversations WHERE user_id=?) ORDER BY created_at DESC LIMIT 16").bind(conversationId,userId).all<ContextMessage>():Promise.resolve({results:[]} as any),
    db.prepare("SELECT kind,status,progress,result FROM work_jobs WHERE user_id=? ORDER BY updated_at DESC LIMIT 3").bind(userId).all<any>(),
    db.prepare("SELECT request_text,status FROM update_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 3").bind(userId).all<any>()
  ]);
  const system=(systemRows.results||[]).map(x=>`[${x.category}] ${x.content}`).join('\n');
  const memories=relevantMemories(input,(memoryRows.results||[]).map(x=>x.content));
  const recentMessages=[...(recentRows.results||[])].reverse().map(x=>({role:x.role,content:x.content}));
  const projectState=[
    ...(workRows.results||[]).map((x:any)=>`Trabajo ${x.kind}: ${x.status}, progreso ${x.progress}%${x.result?`, resultado: ${String(x.result).slice(0,240)}`:''}`),
    ...(updateRows.results||[]).map((x:any)=>`Solicitud de mejora (${x.status}): ${String(x.request_text).slice(0,240)}`)
  ];
  return{system,memories,summary:summaryRow?.summary,recentMessages,projectState};
}

export function renderContext(pack:ContextPack){
  return [
    'CONTEXTO PERMANENTE DEL SISTEMA',pack.system||'- No disponible',
    'MEMORIA RELEVANTE DEL PROPIETARIO',pack.memories.length?pack.memories.map(x=>`- ${x}`).join('\n'):'- Sin memoria relevante',
    'RESUMEN DE ESTA CONVERSACIÓN',pack.summary||'- Aún no existe resumen persistente',
    'ESTADO RECIENTE DEL PROYECTO',pack.projectState.length?pack.projectState.map(x=>`- ${x}`).join('\n'):'- Sin trabajos o mejoras recientes'
  ].join('\n\n');
}

export async function maybeSaveExplicitMemory(db:D1Database,userId:string,message:string){
  const match=message.match(/(?:recuerda(?: que)?|guarda(?: que)?|mi preferencia es|prefiero que|siempre quiero que)\s*[:,-]?\s*(.{8,500})/i);
  if(!match)return null;
  const content=match[1].trim();
  const duplicate=await db.prepare("SELECT id FROM memories WHERE user_id=? AND lower(content)=lower(?) LIMIT 1").bind(userId,content).first();
  if(duplicate)return null;
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,'preference',?,4,'conversation-explicit')").bind(id,userId,content).run();
  return{id,content};
}
