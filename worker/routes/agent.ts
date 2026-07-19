import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {buildPlan,renderAgentContext} from '../agent/planner';
import {repeatedFailures} from '../agent/learning';

export const agent=new Hono<{Bindings:Bindings;Variables:Variables}>();
agent.use('*',requireAuth);

const taskSchema=z.object({
 title:z.string().min(3).max(100),objective:z.string().min(10).max(6000),
 mode:z.enum(['research','programming','automation','api','analysis']).default('analysis'),
 constraints:z.array(z.string().min(2).max(300)).max(12).default([]),
 acceptance:z.array(z.string().min(2).max(300)).min(1).max(12),context:z.string().max(4000).optional()
});

function renderTask(input:z.infer<typeof taskSchema>){const protocol=renderAgentContext(input.objective);return[
 'Eres un agente de trabajo de Héctor OS. Completa la tarea de forma verificable.',protocol,
 `OBJETIVO\n${input.objective}`,`MODO\n${input.mode}`,
 `RESTRICCIONES\n${input.constraints.length?input.constraints.map(x=>`- ${x}`).join('\n'):'- Ninguna adicional'}`,
 `CRITERIOS DE ACEPTACIÓN\n${input.acceptance.map(x=>`- ${x}`).join('\n')}`,
 input.context?`CONTEXTO\n${input.context}`:''
].filter(Boolean).join('\n\n');}

async function dispatchRunner(env:Bindings,jobId:string,task:string){const token=env.GITHUB_RUNNER_TOKEN?.trim();if(!token)throw new Error('GITHUB_RUNNER_TOKEN no configurado');const r=await fetch('https://api.github.com/repos/Hector35/Hector-IA/actions/workflows/agent-code-runner.yml/dispatches',{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Hector-OS-Agent','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{job_id:jobId,task,max_attempts:'3'}})});if(!r.ok){const d=await r.json<any>().catch(()=>({}));throw new Error(`No se pudo iniciar runner: ${r.status} ${d?.message||''}`);}}

agent.post('/jobs',async c=>{const parsed=taskSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Definición de tarea inválida',details:parsed.error.flatten()},400);const id=crypto.randomUUID(),uid=c.get('userId'),plan=buildPlan(parsed.data.objective),prompt=renderTask(parsed.data);await c.env.DB.batch([
 c.env.DB.prepare("INSERT INTO work_jobs(id,user_id,kind,title,prompt,status,progress,heartbeat_at) VALUES(?,?,?,?,?,'queued',0,CURRENT_TIMESTAMP)").bind(id,uid,parsed.data.mode==='analysis'?'agent':parsed.data.mode,parsed.data.title,prompt),
 c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,0)").bind(crypto.randomUUID(),id,`Plan creado. Skills: ${plan.skills.join(', ')||'general-analysis'}`)
]);if(parsed.data.mode==='programming'){try{await dispatchRunner(c.env,id,prompt);await c.env.DB.batch([c.env.DB.prepare("UPDATE work_jobs SET status='working',progress=5,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id),c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Runner editar-probar-corregir iniciado en GitHub Actions',5)").bind(crypto.randomUUID(),id)]);}catch(e){await c.env.DB.batch([c.env.DB.prepare("UPDATE work_jobs SET status='blocked',result=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(e instanceof Error?e.message:'Error al iniciar runner',id),c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'No se pudo iniciar el runner autónomo',0)").bind(crypto.randomUUID(),id)]);}}
return c.json({id,status:parsed.data.mode==='programming'?'working':'queued',protocol:'work-v3',plan,acceptance:parsed.data.acceptance,runner:parsed.data.mode==='programming'?'github-actions':null},201);});

agent.get('/jobs',async c=>c.json({items:(await c.env.DB.prepare('SELECT id,kind,title,status,progress,result,heartbeat_at,created_at,updated_at FROM work_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('userId')).all()).results}));
agent.get('/jobs/:id',async c=>{const uid=c.get('userId'),id=c.req.param('id');const job=await c.env.DB.prepare('SELECT * FROM work_jobs WHERE id=? AND user_id=?').bind(id,uid).first<any>();if(!job)return c.json({error:'Tarea no encontrada'},404);const events=(await c.env.DB.prepare('SELECT message,progress,created_at FROM work_events WHERE job_id=? ORDER BY created_at').bind(id).all()).results;return c.json({job,events});});
agent.get('/learning/failures',async c=>c.json({items:await repeatedFailures(c.env,c.get('userId'))}));
agent.post('/jobs/:id/dispatch',async c=>{const uid=c.get('userId'),id=c.req.param('id');const job=await c.env.DB.prepare('SELECT id,prompt,status FROM work_jobs WHERE id=? AND user_id=?').bind(id,uid).first<any>();if(!job)return c.json({error:'Tarea no encontrada'},404);if(['working','testing','repairing'].includes(job.status))return c.json({error:'La tarea sigue activa'},409);try{await dispatchRunner(c.env,id,job.prompt);await c.env.DB.batch([c.env.DB.prepare("UPDATE work_jobs SET status='working',progress=5,result=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id),c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Runner autónomo despachado manualmente',5)").bind(crypto.randomUUID(),id)]);return c.json({id,status:'working',runner:'github-actions'});}catch(e){return c.json({error:e instanceof Error?e.message:'Error al iniciar runner'},502);}});
agent.post('/jobs/:id/retry',async c=>{const uid=c.get('userId'),id=c.req.param('id');const job=await c.env.DB.prepare('SELECT id,status,prompt,kind FROM work_jobs WHERE id=? AND user_id=?').bind(id,uid).first<any>();if(!job)return c.json({error:'Tarea no encontrada'},404);if(['queued','working','testing','repairing'].includes(job.status))return c.json({error:'La tarea sigue activa'},409);if(job.kind==='programming'){try{await dispatchRunner(c.env,id,job.prompt);}catch(e){return c.json({error:e instanceof Error?e.message:'Error al reintentar'},502);}}await c.env.DB.batch([
 c.env.DB.prepare("UPDATE work_jobs SET status=?,progress=?,result=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.kind==='programming'?'working':'queued',job.kind==='programming'?5:0,id),
 c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Reintento solicitado; debe cambiar de estrategia y conservar evidencia',0)").bind(crypto.randomUUID(),id)
]);return c.json({id,status:job.kind==='programming'?'working':'queued'});});