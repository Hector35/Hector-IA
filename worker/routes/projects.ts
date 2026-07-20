import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {respondContextual} from '../lib/openai';

export const projects=new Hono<{Bindings:Bindings;Variables:Variables}>();
projects.use('*',requireAuth);

export function extractProjectTasks(content:string){
 const lines=content.replace(/\r/g,'').split('\n');
 const tasks:string[]=[];
 for(const raw of lines){
  const line=raw.trim();
  const match=line.match(/^(?:\d{1,3}[.)]|[-*•])\s+(.{3,500})$/);
  if(!match)continue;
  const value=match[1].replace(/\s+/g,' ').trim();
  if(value&&!tasks.some(x=>x.toLowerCase()===value.toLowerCase()))tasks.push(value);
 }
 return tasks.slice(0,24);
}

const createSchema=z.object({
 conversationId:z.string().uuid(),messageId:z.string().optional(),messageContent:z.string().min(3).max(20000),
 title:z.string().min(3).max(120),mode:z.enum(['series','parallel']),createAgents:z.boolean().default(true),
 tasks:z.array(z.string().min(3).max(600)).min(1).max(24).optional()
});

async function event(env:Bindings,projectId:string,taskId:string|null,actor:string,type:string,message:string,metadata:unknown={}){
 await env.DB.prepare('INSERT INTO agent_project_events(id,project_id,task_id,actor,event_type,message,metadata_json) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),projectId,taskId,actor,type,message,JSON.stringify(metadata)).run();
}

projects.post('/from-message',async c=>{
 const parsed=createSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Proyecto inválido',details:parsed.error.flatten()},400);
 const uid=c.get('userId'),input=parsed.data;
 const source=await c.env.DB.prepare('SELECT id,title FROM conversations WHERE id=? AND user_id=?').bind(input.conversationId,uid).first<any>();
 if(!source)return c.json({error:'Conversación origen no encontrada'},404);
 const taskTexts=(input.tasks?.length?input.tasks:extractProjectTasks(input.messageContent));
 if(!taskTexts.length)return c.json({error:'No se detectaron subtareas en el mensaje'},422);
 const projectId=crypto.randomUUID(),directorId=crypto.randomUUID();
 const statements=[
  c.env.DB.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(directorId,uid,`Director · ${input.title}`),
  c.env.DB.prepare("INSERT INTO agent_projects(id,user_id,source_conversation_id,source_message_id,title,objective,execution_mode,status,director_conversation_id) VALUES(?,?,?,?,?,?,?,'queued',?)").bind(projectId,uid,input.conversationId,input.messageId||null,input.title,input.messageContent,input.mode,directorId),
  c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),directorId,'user',`Dirige el proyecto «${input.title}». Modo: ${input.mode}. Revisa informes, detecta bloqueos e integra el resultado final.\n\nObjetivo original:\n${input.messageContent}`),
  c.env.DB.prepare('INSERT INTO agent_project_events(id,project_id,task_id,actor,event_type,message) VALUES(?,?,NULL,?,?,?)').bind(crypto.randomUUID(),projectId,'director','project_created',`Proyecto creado con ${taskTexts.length} subtareas en modo ${input.mode}.`)
 ];
 const ids:string[]=[];
 for(let i=0;i<taskTexts.length;i++){
  const taskId=crypto.randomUUID(),agentId=input.createAgents?crypto.randomUUID():directorId;ids.push(taskId);
  if(input.createAgents){
   statements.push(c.env.DB.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(agentId,uid,`Agente ${i+1} · ${taskTexts[i].slice(0,52)}`));
   statements.push(c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),agentId,'user',`Eres un agente independiente del proyecto «${input.title}». Completa únicamente esta subtarea, entrega un informe verificable y declara errores o límites.\n\nSubtarea ${i+1}: ${taskTexts[i]}`));
  }
  statements.push(c.env.DB.prepare("INSERT INTO agent_project_tasks(id,project_id,position,title,description,status,agent_conversation_id) VALUES(?,?,?,?,?,'queued',?)").bind(taskId,projectId,i+1,taskTexts[i].slice(0,120),taskTexts[i],agentId));
  if(input.mode==='series'&&i>0)statements.push(c.env.DB.prepare('INSERT INTO agent_project_dependencies(task_id,depends_on_task_id) VALUES(?,?)').bind(taskId,ids[i-1]));
 }
 await c.env.DB.batch(statements);
 return c.json({id:projectId,title:input.title,status:'queued',mode:input.mode,taskCount:taskTexts.length,directorConversationId:directorId},201);
});

projects.get('/',async c=>{
 const rows=(await c.env.DB.prepare(`SELECT p.*,
  (SELECT COUNT(*) FROM agent_project_tasks t WHERE t.project_id=p.id) task_count,
  (SELECT COUNT(*) FROM agent_project_tasks t WHERE t.project_id=p.id AND t.status='completed') completed_count,
  (SELECT COUNT(*) FROM agent_project_tasks t WHERE t.project_id=p.id AND t.status IN ('working','reviewing')) active_count
  FROM agent_projects p WHERE p.user_id=? ORDER BY p.updated_at DESC LIMIT 50`).bind(c.get('userId')).all()).results;
 return c.json({items:rows});
});
projects.get('/:id',async c=>{
 const project=await c.env.DB.prepare('SELECT * FROM agent_projects WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first<any>();if(!project)return c.json({error:'Proyecto no encontrado'},404);
 const [tasks,events]=await Promise.all([
  c.env.DB.prepare(`SELECT t.*,(SELECT COUNT(*) FROM agent_project_dependencies d WHERE d.task_id=t.id) dependency_count FROM agent_project_tasks t WHERE project_id=? ORDER BY position`).bind(project.id).all(),
  c.env.DB.prepare('SELECT * FROM agent_project_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(project.id).all()
 ]);
 return c.json({project,tasks:tasks.results,events:events.results});
});
projects.post('/:id/pause',async c=>{await c.env.DB.prepare("UPDATE agent_projects SET status='paused',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(c.req.param('id'),c.get('userId')).run();return c.json({ok:true,status:'paused'});});
projects.post('/:id/resume',async c=>{await c.env.DB.prepare("UPDATE agent_projects SET status='queued',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status IN ('paused','blocked')").bind(c.req.param('id'),c.get('userId')).run();return c.json({ok:true,status:'queued'});});

async function executeTask(env:Bindings,project:any,task:any){
 await env.DB.prepare("UPDATE agent_project_tasks SET status='working',progress=20,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(task.id).run();
 await event(env,project.id,task.id,'agent','task_started',`Inició: ${task.title}`);
 const completed=(await env.DB.prepare("SELECT title,result FROM agent_project_tasks WHERE project_id=? AND status='completed' ORDER BY position").bind(project.id).all<any>()).results;
 const prior=completed.map((x:any)=>`- ${x.title}: ${String(x.result||'').slice(0,900)}`).join('\n');
 const prompt=`PROYECTO: ${project.title}\nMODO: ${project.execution_mode}\nOBJETIVO ORIGINAL:\n${project.objective}\n\nSUBTAREA ASIGNADA:\n${task.description}\n\nRESULTADOS APROBADOS PREVIOS:\n${prior||'- Ninguno'}\n\nEntrega un informe con: resultado, evidencia o razonamiento verificable, problemas encontrados, trabajo pendiente y recomendación para el Director. No afirmes ejecución de herramientas que no hayas realizado.`;
 try{
  const out=await respondContextual(env,prompt,[],`Eres el agente especialista de la subtarea ${task.position}. Mantén el alcance aislado.`,true);
  await env.DB.batch([
   env.DB.prepare("UPDATE agent_project_tasks SET status='completed',progress=100,result=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(out.text,task.id),
   env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),task.agent_conversation_id,'assistant',out.text)
  ]);
  await event(env,project.id,task.id,'agent','task_completed',`Terminó: ${task.title}`,{model:out.model,provider:out.provider});
 }catch(error){
  const message=error instanceof Error?error.message:'Error del agente';
  await env.DB.prepare("UPDATE agent_project_tasks SET status='blocked',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(message,task.id).run();
  await event(env,project.id,task.id,'agent','task_blocked',message);
 }
}

async function finalizeProject(env:Bindings,project:any,tasks:any[]){
 await env.DB.prepare("UPDATE agent_projects SET status='reviewing',progress=95,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(project.id).run();
 const reports=tasks.map(t=>`## ${t.position}. ${t.title}\nEstado: ${t.status}\n${t.result||t.error||'Sin informe'}`).join('\n\n');
 const prompt=`Eres el Director del proyecto «${project.title}». Integra los informes siguientes, identifica contradicciones y entrega al propietario: resultado general, tareas concluidas, fallos o límites, próximos pasos y estado final. No declares éxito si una tarea está bloqueada.\n\n${reports}`;
 try{
  const out=await respondContextual(env,prompt,[],`Objetivo original:\n${project.objective}`,false);
  const blocked=tasks.some(t=>t.status==='blocked'),status=blocked?'blocked':'completed';
  const final=`## Proyecto ${blocked?'bloqueado':'concluido'}: ${project.title}\n\n${out.text}`;
  await env.DB.batch([
   env.DB.prepare('UPDATE agent_projects SET status=?,progress=?,final_report=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,blocked?Math.max(1,Math.round(tasks.filter(t=>t.status==='completed').length/tasks.length*100)):100,final,project.id),
   env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),project.director_conversation_id,'assistant',final),
   env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),project.source_conversation_id,'assistant',`${final}\n\n[Proyecto: ${project.id}]`)
  ]);
  await event(env,project.id,null,'director',status==='completed'?'project_completed':'project_blocked',status==='completed'?'Todas las subtareas concluyeron y el informe final fue enviado al chat origen.':'El Director devolvió un informe con bloqueos.');
 }catch(error){await env.DB.prepare("UPDATE agent_projects SET status='blocked',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(error instanceof Error?error.message:'Error del Director',project.id).run();}
}

export async function processProjectQueue(env:Bindings){
 const projects=(await env.DB.prepare("SELECT * FROM agent_projects WHERE status IN ('queued','running') ORDER BY updated_at LIMIT 4").all<any>()).results;
 for(const project of projects){
  await env.DB.prepare("UPDATE agent_projects SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(project.id).run();
  const tasks=(await env.DB.prepare('SELECT * FROM agent_project_tasks WHERE project_id=? ORDER BY position').bind(project.id).all<any>()).results;
  const ready=tasks.filter((task:any)=>task.status==='queued'&&tasks.filter((x:any)=>x.position<task.position&&project.execution_mode==='series').every((x:any)=>x.status==='completed'));
  if(ready.length)await Promise.all(ready.slice(0,project.execution_mode==='parallel'?3:1).map((task:any)=>executeTask(env,project,task)));
  const updated=(await env.DB.prepare('SELECT * FROM agent_project_tasks WHERE project_id=? ORDER BY position').bind(project.id).all<any>()).results;
  const done=updated.every((t:any)=>['completed','blocked'].includes(t.status));
  const active=updated.some((t:any)=>['working','reviewing'].includes(t.status));
  const completed=updated.filter((t:any)=>t.status==='completed').length;
  const progress=updated.length?Math.round(completed/updated.length*90):0;
  await env.DB.prepare('UPDATE agent_projects SET progress=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(progress,project.id).run();
  if(done&&!active)await finalizeProject(env,project,updated);
 }
}
