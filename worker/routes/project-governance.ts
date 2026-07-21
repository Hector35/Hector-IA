import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {extractProjectTasks,processProjectQueue} from './projects';

export const projectGovernance=new Hono<{Bindings:Bindings;Variables:Variables}>();
projectGovernance.use('*',requireAuth);

const schema=z.object({
 conversationId:z.string().uuid(),messageId:z.string().optional(),messageContent:z.string().min(3).max(20000),
 title:z.string().min(3).max(120),mode:z.enum(['series','parallel']),createAgents:z.boolean().default(true),
 tasks:z.array(z.string().min(3).max(600)).min(1).max(16).optional()
});

export function cleanProjectText(value:string){return value.replace(/[*_`#]+/g,'').replace(/\s+/g,' ').trim().replace(/[;,.]+$/,'').trim();}
export function normalizeProjectText(value:string){return cleanProjectText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();}
export async function projectObjectiveHash(title:string,objective:string){const value=`${normalizeProjectText(title)}|${normalizeProjectText(objective)}`;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}

export function compactProjectTasks(items:string[]){
 const unique=items.map(cleanProjectText).filter((x,i,a)=>x.length>=3&&a.findIndex(y=>normalizeProjectText(y)===normalizeProjectText(x))===i);
 if(unique.length<=5)return unique;
 const first=Math.ceil(unique.length/3),second=Math.ceil(unique.length*2/3);
 const groups=[unique.slice(0,first),unique.slice(first,second),unique.slice(second)].filter(x=>x.length);
 return groups.map((group,i)=>`${['Arquitectura y alcance','Implementación','Pruebas e integración'][i]||`Bloque ${i+1}`}: ${group.join('; ')}`).slice(0,5);
}

projectGovernance.post('/from-message',async c=>{
 const parsed=schema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Proyecto inválido',details:parsed.error.flatten()},400);
 const uid=c.get('userId'),input=parsed.data;
 const source=await c.env.DB.prepare('SELECT id FROM conversations WHERE id=? AND user_id=? AND COALESCE(is_internal,0)=0').bind(input.conversationId,uid).first();
 if(!source)return c.json({error:'Conversación origen no encontrada'},404);
 const raw=input.tasks?.length?input.tasks:extractProjectTasks(input.messageContent),tasks=compactProjectTasks(raw);
 if(!tasks.length)return c.json({error:'No se detectaron subtareas útiles'},422);
 const title=cleanProjectText(input.title),hash=await projectObjectiveHash(title,input.messageContent);
 const existing=await c.env.DB.prepare("SELECT id,title,status,director_conversation_id FROM agent_projects WHERE user_id=? AND objective_hash=? AND status IN ('queued','running','reviewing','paused','blocked') ORDER BY updated_at DESC LIMIT 1").bind(uid,hash).first<any>();
 if(existing)return c.json({id:existing.id,title:existing.title,status:existing.status,directorConversationId:existing.director_conversation_id,deduplicated:true},200);
 const projectId=crypto.randomUUID(),directorId=crypto.randomUUID(),statements:any[]=[
  c.env.DB.prepare('INSERT INTO conversations(id,user_id,title,is_internal,project_id,project_role) VALUES(?,?,?,?,?,?)').bind(directorId,uid,`Director · ${title}`,1,projectId,'director'),
  c.env.DB.prepare("INSERT INTO agent_projects(id,user_id,source_conversation_id,source_message_id,title,objective,objective_hash,execution_mode,status,director_conversation_id,progress,max_agents,max_attempts,max_runtime_seconds) VALUES(?,?,?,?,?,?,?,?, 'queued',?,0,?,?,?)").bind(projectId,uid,input.conversationId,input.messageId||null,title,input.messageContent,hash,input.mode,directorId,tasks.length,2,240),
  c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),directorId,'user',`Dirige el proyecto «${title}». Integra obligatoriamente resultados, bloqueos, evidencia, límites y una conclusión final.\n\nObjetivo original:\n${input.messageContent}`),
  c.env.DB.prepare('INSERT INTO agent_project_events(id,project_id,task_id,actor,event_type,message,metadata_json) VALUES(?,?,NULL,?,?,?,?)').bind(crypto.randomUUID(),projectId,'director','project_created',`Proyecto gobernado creado con ${tasks.length} subtareas.`,JSON.stringify({originalTaskCount:raw.length,compactedTaskCount:tasks.length,maxAgents:5,maxAttempts:2,maxRuntimeSeconds:240}))
 ];
 const ids:string[]=[];
 for(let i=0;i<tasks.length;i++){
  const taskId=crypto.randomUUID(),agentId=input.createAgents?crypto.randomUUID():directorId;ids.push(taskId);
  if(input.createAgents){statements.push(c.env.DB.prepare('INSERT INTO conversations(id,user_id,title,is_internal,project_id,project_role) VALUES(?,?,?,?,?,?)').bind(agentId,uid,`Agente ${i+1} · ${tasks[i].slice(0,52)}`,1,projectId,'agent'));statements.push(c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),agentId,'user',`Completa esta subtarea y entrega resultado verificable, límites y errores.\n\n${tasks[i]}`));}
  statements.push(c.env.DB.prepare("INSERT INTO agent_project_tasks(id,project_id,position,title,description,status,agent_conversation_id,progress,attempt_count,max_attempts) VALUES(?,?,?,?,?,'queued',?,0,0,2)").bind(taskId,projectId,i+1,tasks[i].slice(0,120),tasks[i],agentId));
  if(input.mode==='series'&&i>0)statements.push(c.env.DB.prepare('INSERT INTO agent_project_dependencies(task_id,depends_on_task_id) VALUES(?,?)').bind(taskId,ids[i-1]));
 }
 await c.env.DB.batch(statements);c.executionCtx.waitUntil(processProjectQueue(c.env));
 return c.json({id:projectId,title,status:'queued',mode:input.mode,taskCount:tasks.length,originalTaskCount:raw.length,directorConversationId:directorId,governed:true},201);
});

projectGovernance.get('/internal-summary',async c=>{
 const rows=(await c.env.DB.prepare(`SELECT p.id,p.title,p.status,p.progress,p.updated_at,
  COUNT(t.id) task_count,
  SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) completed_count,
  SUM(CASE WHEN t.status='blocked' THEN 1 ELSE 0 END) blocked_count,
  SUM(CASE WHEN t.status IN ('queued','working') THEN 1 ELSE 0 END) pending_count
  FROM agent_projects p LEFT JOIN agent_project_tasks t ON t.project_id=p.id WHERE p.user_id=? GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 50`).bind(c.get('userId')).all()).results;
 return c.json({items:rows});
});