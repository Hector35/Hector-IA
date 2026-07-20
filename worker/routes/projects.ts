import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {respondContextual} from '../lib/openai';

export const projects=new Hono<{Bindings:Bindings;Variables:Variables}>();
projects.use('*',requireAuth);

function cleanLabel(value:string){return value.replace(/[*_`#]+/g,'').replace(/\s+/g,' ').replace(/[;,.]+$/,'').trim();}

export function extractProjectTasks(content:string){
 const candidates=content.replace(/\r/g,'').split('\n').map(raw=>{
  const indent=(raw.match(/^\s*/)?.[0].replace(/\t/g,'    ').length)||0;
  const numbered=raw.trim().match(/^(\d{1,3})[.)]\s+(.{3,500})$/);
  const bullet=raw.trim().match(/^[-*•]\s+(.{3,500})$/);
  return numbered?{indent,kind:'numbered',order:Number(numbered[1]),value:cleanLabel(numbered[2])}:bullet?{indent,kind:'bullet',order:0,value:cleanLabel(bullet[1])}:null;
 }).filter(Boolean) as {indent:number;kind:string;order:number;value:string}[];
 const numbered=candidates.filter(x=>x.kind==='numbered');
 const source=numbered.length>=2?numbered:candidates.filter(x=>x.indent===Math.min(...candidates.map(y=>y.indent)));
 const tasks:string[]=[];
 for(const item of source){if(item.value.length>=3&&!tasks.some(x=>x.toLowerCase()===item.value.toLowerCase()))tasks.push(item.value);}
 return tasks.slice(0,16);
}

const createSchema=z.object({
 conversationId:z.string().uuid(),messageId:z.string().optional(),messageContent:z.string().min(3).max(20000),
 title:z.string().min(3).max(120),mode:z.enum(['series','parallel']),createAgents:z.boolean().default(true),
 tasks:z.array(z.string().min(3).max(600)).min(1).max(16).optional()
});

async function event(env:Bindings,projectId:string,taskId:string|null,actor:string,type:string,message:string,metadata:unknown={}){
 await env.DB.prepare('INSERT INTO agent_project_events(id,project_id,task_id,actor,event_type,message,metadata_json) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),projectId,taskId,actor,type,message,JSON.stringify(metadata)).run();
}

projects.post('/from-message',async c=>{
 const parsed=createSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Proyecto inválido',details:parsed.error.flatten()},400);
 const uid=c.get('userId'),input=parsed.data;
 const source=await c.env.DB.prepare('SELECT id,title FROM conversations WHERE id=? AND user_id=? AND COALESCE(is_internal,0)=0').bind(input.conversationId,uid).first<any>();
 if(!source)return c.json({error:'Conversación origen no encontrada'},404);
 const rawTasks=input.tasks?.length?input.tasks:extractProjectTasks(input.messageContent);
 const taskTexts=rawTasks.map(cleanLabel).filter((x,i,a)=>x.length>=3&&a.findIndex(y=>y.toLowerCase()===x.toLowerCase())===i).slice(0,16);
 if(!taskTexts.length)return c.json({error:'No se detectaron subtareas en el mensaje'},422);
 const title=cleanLabel(input.title),projectId=crypto.randomUUID(),directorId=crypto.randomUUID();
 const statements=[
  c.env.DB.prepare('INSERT INTO conversations(id,user_id,title,is_internal,project_id,project_role) VALUES(?,?,?,?,?,?)').bind(directorId,uid,`Director · ${title}`,1,projectId,'director'),
  c.env.DB.prepare("INSERT INTO agent_projects(id,user_id,source_conversation_id,source_message_id,title,objective,execution_mode,status,director_conversation_id,progress) VALUES(?,?,?,?,?,?,?,'queued',?,0)").bind(projectId,uid,input.conversationId,input.messageId||null,title,input.messageContent,input.mode,directorId),
  c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),directorId,'user',`Dirige el proyecto «${title}». Modo: ${input.mode}. Revisa relaciones, informes y bloqueos. Integra el resultado al concluir.\n\nObjetivo original:\n${input.messageContent}`),
  c.env.DB.prepare('INSERT INTO agent_project_events(id,project_id,task_id,actor,event_type,message) VALUES(?,?,NULL,?,?,?)').bind(crypto.randomUUID(),projectId,'director','project_created',`Proyecto creado con ${taskTexts.length} subtareas en modo ${input.mode}.`)
 ];
 const ids:string[]=[];
 for(let i=0;i<taskTexts.length;i++){
  const taskId=crypto.randomUUID(),agentId=input.createAgents?crypto.randomUUID():directorId;ids.push(taskId);
  if(input.createAgents){
   statements.push(c.env.DB.prepare('INSERT INTO conversations(id,user_id,title,is_internal,project_id,project_role) VALUES(?,?,?,?,?,?)').bind(agentId,uid,`Agente ${i+1} · ${taskTexts[i].slice(0,52)}`,1,projectId,'agent'));
   statements.push(c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),agentId,'user',`Eres el agente interno de la subtarea ${i+1} del proyecto «${title}». Trabaja únicamente en esta subtarea y entrega un informe verificable.\n\n${taskTexts[i]}`));
  }
  statements.push(c.env.DB.prepare("INSERT INTO agent_project_tasks(id,project_id,position,title,description,status,agent_conversation_id,progress) VALUES(?,?,?,?,?,'queued',?,0)").bind(taskId,projectId,i+1,taskTexts[i].slice(0,120),taskTexts[i],agentId));
  if(input.mode==='series'&&i>0)statements.push(c.env.DB.prepare('INSERT INTO agent_project_dependencies(task_id,depends_on_task_id) VALUES(?,?)').bind(taskId,ids[i-1]));
 }
 await c.env.DB.batch(statements);
 c.executionCtx.waitUntil(processProjectById(c.env,projectId));
 return c.json({id:projectId,title,status:'queued',mode:input.mode,taskCount:taskTexts.length,directorConversationId:directorId},201);
});

projects.get('/',async c=>{
 const rows=(await c.env.DB.prepare(`SELECT p.*,
  (SELECT COUNT(*) FROM agent_project_tasks t WHERE t.project_id=p.id) task_count,
  (SELECT COUNT(*) FROM agent_project_tasks t WHERE t.project_id=p.id AND t.status='completed') completed_count,
  (SELECT COUNT(*) FROM agent_project_tasks t WHERE t.project_id=p.id AND t.status='blocked') blocked_count,
  (SELECT COUNT(*) FROM agent_project_tasks t WHERE t.project_id=p.id AND t.status='working') active_count
  FROM agent_projects p WHERE p.user_id=? ORDER BY p.updated_at DESC LIMIT 50`).bind(c.get('userId')).all()).results;
 return c.json({items:rows});
});

projects.get('/:id',async c=>{
 const project=await c.env.DB.prepare('SELECT * FROM agent_projects WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first<any>();if(!project)return c.json({error:'Proyecto no encontrado'},404);
 const [tasks,events]=await Promise.all([
  c.env.DB.prepare(`SELECT t.*,
   COALESCE((SELECT GROUP_CONCAT(dep.position||'. '||dep.title,' | ') FROM agent_project_dependencies d JOIN agent_project_tasks dep ON dep.id=d.depends_on_task_id WHERE d.task_id=t.id),'') dependency_titles
   FROM agent_project_tasks t WHERE t.project_id=? ORDER BY t.position`).bind(project.id).all(),
  c.env.DB.prepare('SELECT * FROM agent_project_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(project.id).all()
 ]);
 return c.json({project,tasks:tasks.results,events:events.results});
});

projects.get('/:id/tasks/:taskId/messages',async c=>{
 const task=await c.env.DB.prepare(`SELECT t.agent_conversation_id FROM agent_project_tasks t JOIN agent_projects p ON p.id=t.project_id WHERE t.id=? AND t.project_id=? AND p.user_id=?`).bind(c.req.param('taskId'),c.req.param('id'),c.get('userId')).first<any>();
 if(!task)return c.json({error:'Subtarea no encontrada'},404);
 const items=(await c.env.DB.prepare('SELECT id,role,content,created_at FROM messages WHERE conversation_id=? ORDER BY created_at').bind(task.agent_conversation_id).all()).results;
 return c.json({items});
});

projects.post('/:id/pause',async c=>{await c.env.DB.prepare("UPDATE agent_projects SET status='paused',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status IN ('queued','running')").bind(c.req.param('id'),c.get('userId')).run();return c.json({ok:true,status:'paused'});});
projects.post('/:id/resume',async c=>{const id=c.req.param('id');await c.env.DB.prepare("UPDATE agent_projects SET status='queued',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status IN ('paused','blocked')").bind(id,c.get('userId')).run();c.executionCtx.waitUntil(processProjectById(c.env,id));return c.json({ok:true,status:'queued'});});

async function executeTask(env:Bindings,project:any,task:any){
 const claim=await env.DB.prepare("UPDATE agent_project_tasks SET status='working',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(task.id).run();
 if(!claim.meta.changes)return;
 await event(env,project.id,task.id,'agent','task_started',`Inició: ${task.title}`);
 const completed=(await env.DB.prepare("SELECT position,title,result FROM agent_project_tasks WHERE project_id=? AND status='completed' ORDER BY position").bind(project.id).all<any>()).results;
 const prior=completed.map((x:any)=>`${x.position}. ${x.title}: ${String(x.result||'').slice(0,900)}`).join('\n');
 const prompt=`PROYECTO: ${project.title}\nMODO: ${project.execution_mode}\nOBJETIVO ORIGINAL:\n${project.objective}\n\nSUBTAREA ${task.position}:\n${task.description}\n\nRESULTADOS PREVIOS DISPONIBLES:\n${prior||'- Ninguno'}\n\nEntrega: resultado, evidencia o razonamiento verificable, problemas, límites, relación con otras subtareas y recomendación al Director. No afirmes herramientas que no ejecutaste.`;
 try{
  const out=await respondContextual(env,prompt,[],`Agente interno de la subtarea ${task.position}. Mantén el alcance aislado.`,true);
  await env.DB.batch([
   env.DB.prepare("UPDATE agent_project_tasks SET status='completed',progress=100,result=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(out.text,task.id),
   env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),task.agent_conversation_id,'assistant',out.text)
  ]);
  await event(env,project.id,task.id,'agent','task_completed',`Terminó: ${task.title}`,{model:out.model,provider:out.provider});
 }catch(error){const message=error instanceof Error?error.message:'Error del agente';await env.DB.prepare("UPDATE agent_project_tasks SET status='blocked',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(message,task.id).run();await event(env,project.id,task.id,'agent','task_blocked',message);}
}

async function finalizeProject(env:Bindings,project:any,tasks:any[]){
 await env.DB.prepare("UPDATE agent_projects SET status='reviewing',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(project.id).run();
 const reports=tasks.map(t=>`## ${t.position}. ${t.title}\nEstado: ${t.status}\nDependencias: ${t.dependency_titles||'ninguna'}\n${t.result||t.error||'Sin informe'}`).join('\n\n');
 try{
  const out=await respondContextual(env,`Integra el proyecto «${project.title}». Explica cómo se relacionan las subtareas, qué quedó concluido, contradicciones, bloqueos y resultado final. No declares éxito si existe una subtarea bloqueada.\n\n${reports}`,[],`Objetivo original:\n${project.objective}`,false);
  const blocked=tasks.some(t=>t.status==='blocked'),status=blocked?'blocked':'completed',final=`## Proyecto ${blocked?'bloqueado':'concluido'}: ${project.title}\n\n${out.text}`;
  await env.DB.batch([
   env.DB.prepare('UPDATE agent_projects SET status=?,progress=?,final_report=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,blocked?0:100,final,project.id),
   env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),project.director_conversation_id,'assistant',final),
   env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),project.source_conversation_id,'assistant',`${final}\n\nAbre **Trabajo** para consultar los chats internos e informes.`)
  ]);
  await event(env,project.id,null,'director',status==='completed'?'project_completed':'project_blocked',status==='completed'?'Todas las subtareas concluyeron.':'El proyecto terminó con bloqueos.');
 }catch(error){await env.DB.prepare("UPDATE agent_projects SET status='blocked',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(error instanceof Error?error.message:'Error del Director',project.id).run();}
}

async function loadTasks(env:Bindings,projectId:string){return (await env.DB.prepare(`SELECT t.*,COALESCE((SELECT GROUP_CONCAT(dep.position||'. '||dep.title,' | ') FROM agent_project_dependencies d JOIN agent_project_tasks dep ON dep.id=d.depends_on_task_id WHERE d.task_id=t.id),'') dependency_titles FROM agent_project_tasks t WHERE t.project_id=? ORDER BY t.position`).bind(projectId).all<any>()).results;}

async function processProjectById(env:Bindings,projectId:string){
 for(let cycle=0;cycle<12;cycle++){
  const project=await env.DB.prepare("SELECT * FROM agent_projects WHERE id=? AND status IN ('queued','running')").bind(projectId).first<any>();if(!project)return;
  await env.DB.prepare("UPDATE agent_projects SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(project.id).run();
  const tasks=await loadTasks(env,project.id);
  const ready=tasks.filter((task:any)=>task.status==='queued'&&!tasks.some((dep:any)=>task.dependency_titles&&task.dependency_titles.includes(`${dep.position}. `)&&dep.status!=='completed'));
  if(ready.length){await Promise.all(ready.slice(0,project.execution_mode==='parallel'?3:1).map((task:any)=>executeTask(env,project,task)));continue;}
  const updated=await loadTasks(env,project.id),active=updated.some((t:any)=>t.status==='working');
  if(active)return;
  const blockedIds=new Set(updated.filter((t:any)=>t.status==='blocked').map((t:any)=>t.position));
  const stranded=updated.filter((t:any)=>t.status==='queued'&&[...blockedIds].some(pos=>t.dependency_titles.includes(`${pos}. `)));
  for(const task of stranded){await env.DB.prepare("UPDATE agent_project_tasks SET status='blocked',error='Bloqueada por una dependencia fallida',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(task.id).run();}
  const finalTasks=await loadTasks(env,project.id);
  if(finalTasks.every((t:any)=>['completed','blocked'].includes(t.status))){await finalizeProject(env,project,finalTasks);return;}
  return;
 }
}

export async function processProjectQueue(env:Bindings){
 const ids=(await env.DB.prepare("SELECT id FROM agent_projects WHERE status IN ('queued','running') ORDER BY updated_at LIMIT 4").all<{id:string}>()).results;
 await Promise.all(ids.map(x=>processProjectById(env,x.id)));
}
