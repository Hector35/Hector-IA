import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {respondContextual} from '../lib/openai';

export const chatAgents=new Hono<{Bindings:Bindings;Variables:Variables}>();
chatAgents.use('*',requireAuth);

const createSchema=z.object({
 name:z.string().min(2).max(40),
 instructions:z.string().min(8).max(3000),
 triggerMode:z.enum(['manual','automatic']).default('manual'),
 maxRounds:z.number().int().min(1).max(6).default(2)
});

async function ownedConversation(env:Bindings,id:string,userId:string){
 return env.DB.prepare('SELECT id,title FROM conversations WHERE id=? AND user_id=? AND COALESCE(is_internal,0)=0').bind(id,userId).first<any>();
}

chatAgents.get('/:conversationId',async c=>{
 const conversationId=c.req.param('conversationId'),userId=c.get('userId');
 if(!await ownedConversation(c.env,conversationId,userId))return c.json({error:'Conversación no encontrada'},404);
 const [agents,turns,run]=await Promise.all([
  c.env.DB.prepare('SELECT id,name,instructions,trigger_mode,max_rounds,enabled,created_at FROM conversation_agents WHERE conversation_id=? AND user_id=? ORDER BY created_at').bind(conversationId,userId).all(),
  c.env.DB.prepare('SELECT id,run_id,agent_id,speaker_name,speaker_type,round,sequence,content,model,provider,created_at FROM conversation_agent_turns WHERE conversation_id=? ORDER BY created_at,sequence LIMIT 200').bind(conversationId).all(),
  c.env.DB.prepare("SELECT id,status,max_rounds,current_round,error,created_at,updated_at FROM conversation_agent_runs WHERE conversation_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1").bind(conversationId,userId).first()
 ]);
 return c.json({agents:agents.results,turns:turns.results,run});
});

chatAgents.post('/:conversationId',async c=>{
 const conversationId=c.req.param('conversationId'),userId=c.get('userId');
 if(!await ownedConversation(c.env,conversationId,userId))return c.json({error:'Conversación no encontrada'},404);
 const parsed=createSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Configuración inválida',details:parsed.error.flatten()},400);
 const count=await c.env.DB.prepare('SELECT COUNT(*) count FROM conversation_agents WHERE conversation_id=? AND user_id=?').bind(conversationId,userId).first<any>();
 if(Number(count?.count||0)>=4)return c.json({error:'Máximo 4 agentes por conversación'},409);
 const id=crypto.randomUUID(),x=parsed.data;
 await c.env.DB.prepare('INSERT INTO conversation_agents(id,conversation_id,user_id,name,instructions,trigger_mode,max_rounds) VALUES(?,?,?,?,?,?,?)').bind(id,conversationId,userId,x.name.trim(),x.instructions.trim(),x.triggerMode,x.maxRounds).run();
 return c.json({id,name:x.name.trim(),instructions:x.instructions.trim(),trigger_mode:x.triggerMode,max_rounds:x.maxRounds,enabled:1},201);
});

chatAgents.put('/:conversationId/:agentId',async c=>{
 const conversationId=c.req.param('conversationId'),agentId=c.req.param('agentId'),userId=c.get('userId');
 const parsed=createSchema.partial().extend({enabled:z.boolean().optional()}).safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Configuración inválida'},400);
 const current=await c.env.DB.prepare('SELECT * FROM conversation_agents WHERE id=? AND conversation_id=? AND user_id=?').bind(agentId,conversationId,userId).first<any>();if(!current)return c.json({error:'Agente no encontrado'},404);
 const x=parsed.data;
 await c.env.DB.prepare('UPDATE conversation_agents SET name=?,instructions=?,trigger_mode=?,max_rounds=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(x.name?.trim()||current.name,x.instructions?.trim()||current.instructions,x.triggerMode||current.trigger_mode,x.maxRounds||current.max_rounds,x.enabled===undefined?current.enabled:Number(x.enabled),agentId).run();
 return c.json({ok:true});
});

chatAgents.delete('/:conversationId/:agentId',async c=>{
 const result=await c.env.DB.prepare('DELETE FROM conversation_agents WHERE id=? AND conversation_id=? AND user_id=?').bind(c.req.param('agentId'),c.req.param('conversationId'),c.get('userId')).run();
 return result.meta.changes?c.json({ok:true}):c.json({error:'Agente no encontrado'},404);
});

chatAgents.post('/:conversationId/run',async c=>{
 const conversationId=c.req.param('conversationId'),userId=c.get('userId');
 if(!await ownedConversation(c.env,conversationId,userId))return c.json({error:'Conversación no encontrada'},404);
 const body=z.object({maxRounds:z.number().int().min(1).max(6).optional(),sourceMessageId:z.string().optional()}).safeParse(await c.req.json().catch(()=>({})));if(!body.success)return c.json({error:'Ejecución inválida'},400);
 const active=await c.env.DB.prepare("SELECT id FROM conversation_agent_runs WHERE conversation_id=? AND user_id=? AND status IN ('queued','running') LIMIT 1").bind(conversationId,userId).first();if(active)return c.json({error:'Ya existe un intercambio activo'},409);
 const agents=(await c.env.DB.prepare('SELECT * FROM conversation_agents WHERE conversation_id=? AND user_id=? AND enabled=1 ORDER BY created_at').bind(conversationId,userId).all<any>()).results;if(!agents.length)return c.json({error:'Agrega al menos un agente activo'},422);
 const maxRounds=body.data.maxRounds||Math.max(...agents.map((a:any)=>Number(a.max_rounds||1))),id=crypto.randomUUID();
 await c.env.DB.prepare("INSERT INTO conversation_agent_runs(id,conversation_id,user_id,source_message_id,status,max_rounds) VALUES(?,?,?,?,'queued',?)").bind(id,conversationId,userId,body.data.sourceMessageId||null,maxRounds).run();
 c.executionCtx.waitUntil(processChatAgentRun(c.env,id));
 return c.json({id,status:'queued',maxRounds},202);
});

chatAgents.post('/:conversationId/runs/:runId/pause',async c=>{await c.env.DB.prepare("UPDATE conversation_agent_runs SET status='paused',updated_at=CURRENT_TIMESTAMP WHERE id=? AND conversation_id=? AND user_id=? AND status IN ('queued','running')").bind(c.req.param('runId'),c.req.param('conversationId'),c.get('userId')).run();return c.json({ok:true});});

async function recentContext(env:Bindings,conversationId:string){
 const rows=(await env.DB.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 14').bind(conversationId).all<any>()).results.reverse();
 return rows.map((m:any)=>`${m.role==='user'?'Usuario':'Héctor'}: ${m.content}`).join('\n\n');
}

export async function processChatAgentRun(env:Bindings,runId:string){
 const run=await env.DB.prepare("SELECT * FROM conversation_agent_runs WHERE id=? AND status IN ('queued','running')").bind(runId).first<any>();if(!run)return;
 await env.DB.prepare("UPDATE conversation_agent_runs SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(runId).run();
 try{
  const agents=(await env.DB.prepare('SELECT * FROM conversation_agents WHERE conversation_id=? AND user_id=? AND enabled=1 ORDER BY created_at').bind(run.conversation_id,run.user_id).all<any>()).results;
  if(!agents.length)throw new Error('No hay agentes activos');
  const context=await recentContext(env,run.conversation_id);
  let principal=run.last_output||String((await env.DB.prepare("SELECT content FROM messages WHERE conversation_id=? AND role='assistant' ORDER BY created_at DESC LIMIT 1").bind(run.conversation_id).first<any>())?.content||'Analiza el objetivo de la conversación.');
  for(let round=Number(run.current_round||0)+1;round<=Number(run.max_rounds);round++){
   const state=await env.DB.prepare('SELECT status FROM conversation_agent_runs WHERE id=?').bind(runId).first<any>();if(state?.status!=='running')return;
   for(const agent of agents){
    const prompt=`CONTEXTO DEL CHAT:\n${context}\n\nRESPUESTA ACTUAL DE HÉCTOR:\n${principal}\n\nTu función en esta ronda es cumplir tus instrucciones, responder a Héctor y aportar una solicitud, corrección, crítica o información concreta para que continúe. No hables al usuario salvo que sea indispensable.`;
    const out=await respondContextual(env,prompt,[],`Eres ${agent.name}, un agente secundario dentro del mismo chat. Instrucciones permanentes:\n${agent.instructions}`,true);
    await env.DB.prepare("INSERT INTO conversation_agent_turns(id,run_id,conversation_id,agent_id,speaker_name,speaker_type,round,sequence,content,model,provider) VALUES(?,?,?,?,?,'agent',?,?,?,?,?)").bind(crypto.randomUUID(),runId,run.conversation_id,agent.id,agent.name,round,round*100+agents.indexOf(agent)*2,out.text,out.model,out.provider).run();
    const principalPrompt=`CONTEXTO ORIGINAL:\n${context}\n\nTU RESPUESTA ANTERIOR:\n${principal}\n\nMENSAJE DEL AGENTE ${agent.name}:\n${out.text}\n\nResponde al agente dentro del mismo trabajo. Integra la información útil, corrige lo necesario y formula el siguiente avance. No finjas herramientas ni resultados no ejecutados.`;
    const next=await respondContextual(env,principalPrompt,[],`Eres Héctor, el agente principal de esta conversación. Estás trabajando en coordinación con ${agent.name}.`,true);
    principal=next.text;
    await env.DB.prepare("INSERT INTO conversation_agent_turns(id,run_id,conversation_id,agent_id,speaker_name,speaker_type,round,sequence,content,model,provider) VALUES(?,?,?,?,?,'principal',?,?,?,?,?)").bind(crypto.randomUUID(),runId,run.conversation_id,null,'Héctor',round,round*100+agents.indexOf(agent)*2+1,next.text,next.model,next.provider).run();
   }
   await env.DB.prepare('UPDATE conversation_agent_runs SET current_round=?,last_output=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(round,principal,runId).run();
  }
  await env.DB.batch([
   env.DB.prepare("UPDATE conversation_agent_runs SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(runId),
   env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),run.conversation_id,'assistant',`## Resultado del intercambio multiagente\n\n${principal}`),
   env.DB.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(run.conversation_id)
  ]);
 }catch(error){await env.DB.prepare("UPDATE conversation_agent_runs SET status='blocked',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(error instanceof Error?error.message:'Error del bucle multiagente',runId).run();}
}

export async function processChatAgentRuns(env:Bindings){
 const runs=(await env.DB.prepare("SELECT id FROM conversation_agent_runs WHERE status IN ('queued','running') ORDER BY updated_at LIMIT 2").all<{id:string}>()).results;
 await Promise.all(runs.map(x=>processChatAgentRun(env,x.id)));
}
