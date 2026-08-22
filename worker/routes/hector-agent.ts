import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {buildPlan} from '../agent/planner';
import {workModeTitle} from '../lib/work-mode';

export const hectorAgent=new Hono<{Bindings:Bindings;Variables:Variables}>();
hectorAgent.use('*',requireAuth);

type Settings={
 user_id:string;autonomy_mode:'manual'|'supervised'|'autonomous';paused:number;auto_enabled:number;
 max_iterations:number;max_runtime_seconds:number;max_cost_usd:number;max_consecutive_errors:number;updated_at:string;
};

const settingsSchema=z.object({
 autonomyMode:z.enum(['manual','supervised','autonomous']).optional(),
 paused:z.boolean().optional(),
 autoEnabled:z.boolean().optional(),
 maxIterations:z.number().int().min(1).max(1000).optional(),
 maxRuntimeSeconds:z.number().int().min(60).max(86400).optional(),
 maxCostUsd:z.number().min(0).max(1000).optional(),
 maxConsecutiveErrors:z.number().int().min(1).max(50).optional()
});
const goalSchema=z.object({objective:z.string().trim().min(10).max(12000)});
const memorySchema=z.object({kind:z.enum(['fact','decision','preference','project','error','solution']),content:z.string().trim().min(2).max(5000)});

async function settings(env:Bindings,userId:string):Promise<Settings>{
 await env.DB.prepare('INSERT OR IGNORE INTO hector_agent_settings(user_id) VALUES(?)').bind(userId).run();
 return await env.DB.prepare('SELECT * FROM hector_agent_settings WHERE user_id=?').bind(userId).first<Settings>() as Settings;
}

function phaseState(index:number,progress:number,status:string){
 if(status==='completed')return 'completed';
 if(status==='blocked')return index===0?'waiting':'pending';
 const thresholds=[10,30,55,80,100],previous=index===0?0:thresholds[index-1];
 if(progress>=thresholds[index])return 'completed';
 if(progress>=previous)return 'working';
 return 'pending';
}
function mapGoal(row:any){
 const plan=buildPlan(row.objective);
 return{
  id:row.id,title:row.title,objective:row.objective,workJobId:row.work_job_id,status:row.status,progress:Number(row.progress||0),
  result:row.result||null,lastError:row.last_error||null,attemptCount:Number(row.attempt_count||0),maxAttempts:Number(row.max_attempts||0),
  nextRetryAt:row.next_retry_at||null,createdAt:row.created_at,updatedAt:row.updated_at,
  tasks:plan.phases.map((phase,index)=>({id:`${row.id}:${index}`,name:phase.name,goal:phase.goal,evidence:phase.evidence,status:phaseState(index,Number(row.progress||0),row.status)}))
 };
}

hectorAgent.get('/dashboard',async c=>{
 const userId=c.get('userId'),cfg=await settings(c.env,userId);
 const goals=(await c.env.DB.prepare(`SELECT g.*,w.status,w.progress,w.result,w.last_error,w.attempt_count,w.max_attempts,w.next_retry_at,w.created_at,w.updated_at
  FROM hector_agent_goals g JOIN work_jobs w ON w.id=g.work_job_id WHERE g.user_id=? ORDER BY w.updated_at DESC LIMIT 25`).bind(userId).all<any>()).results;
 const approvals=(await c.env.DB.prepare("SELECT * FROM hector_agent_approvals WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 25").bind(userId).all<any>()).results;
 const memoryCount=await c.env.DB.prepare('SELECT COUNT(*) count FROM hector_agent_memory WHERE user_id=?').bind(userId).first<{count:number}>();
 const active=(goals as any[]).find(x=>['queued','working','testing','repairing'].includes(x.status));
 return c.json({
  settings:{autonomyMode:cfg.autonomy_mode,paused:Boolean(cfg.paused),autoEnabled:Boolean(cfg.auto_enabled),maxIterations:cfg.max_iterations,maxRuntimeSeconds:cfg.max_runtime_seconds,maxCostUsd:cfg.max_cost_usd,maxConsecutiveErrors:cfg.max_consecutive_errors},
  activeGoal:active?mapGoal(active):null,goals:(goals as any[]).map(mapGoal),approvals,memoryCount:Number(memoryCount?.count||0),
  nextExecution:cfg.paused||!cfg.auto_enabled?null:'cron: every minute'
 });
});

hectorAgent.patch('/settings',async c=>{
 const parsed=settingsSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Configuración inválida',details:parsed.error.flatten()},400);
 const userId=c.get('userId'),current=await settings(c.env,userId),v=parsed.data;
 await c.env.DB.prepare(`UPDATE hector_agent_settings SET autonomy_mode=?,paused=?,auto_enabled=?,max_iterations=?,max_runtime_seconds=?,max_cost_usd=?,max_consecutive_errors=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).bind(
  v.autonomyMode??current.autonomy_mode,v.paused===undefined?current.paused:Number(v.paused),v.autoEnabled===undefined?current.auto_enabled:Number(v.autoEnabled),
  v.maxIterations??current.max_iterations,v.maxRuntimeSeconds??current.max_runtime_seconds,v.maxCostUsd??current.max_cost_usd,v.maxConsecutiveErrors??current.max_consecutive_errors,userId
 ).run();
 if(v.paused===true||v.autoEnabled===false){
  await c.env.DB.prepare(`UPDATE work_jobs SET status='blocked',next_retry_at=NULL,last_error='Héctor Agent detenido por el usuario',lease_token=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
   WHERE id IN (SELECT work_job_id FROM hector_agent_goals WHERE user_id=?) AND status IN ('queued','working','testing','repairing')`).bind(userId).run();
 }
 return c.json({ok:true,settings:(await settings(c.env,userId))});
});

hectorAgent.post('/goals',async c=>{
 const parsed=goalSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Describe un objetivo de al menos 10 caracteres'},400);
 const userId=c.get('userId'),cfg=await settings(c.env,userId);
 if(cfg.paused||!cfg.auto_enabled)return c.json({error:'Héctor Agent está detenido. Reanúdalo antes de crear un objetivo.'},409);
 const objective=parsed.data.objective,goalId=crypto.randomUUID(),jobId=crypto.randomUUID(),title=workModeTitle(objective),plan=buildPlan(objective);
 const manual=cfg.autonomy_mode==='manual',status=manual?'blocked':'queued';
 const prompt=[
  'HÉCTOR AGENT V1',`OBJETIVO FINAL\n${objective}`,
  `MODO DE AUTONOMÍA\n${cfg.autonomy_mode}`,
  `LÍMITES\n- Máximo ${cfg.max_iterations} ciclos\n- Máximo ${cfg.max_runtime_seconds}s de ejecución acumulada por objetivo\n- Presupuesto objetivo ${cfg.max_cost_usd.toFixed(2)} USD\n- Máximo ${cfg.max_consecutive_errors} errores consecutivos antes de bloquear`,
  'PLAN BASE',...plan.phases.map((p,i)=>`${i+1}. ${p.name}: ${p.goal}`),
  'REGLAS\n- Registra acciones concretas y evidencia.\n- Diagnostica antes de repetir un fallo.\n- No realices despliegues, borrados, cambios destructivos, pagos ni acciones de alto impacto sin aprobación explícita.\n- Si una dependencia externa impide avanzar, usa WORK_STATE: waiting.\n- Solo usa WORK_STATE: complete cuando el objetivo esté verificado.'
 ].join('\n\n');
 const statements=[
  c.env.DB.prepare("INSERT INTO work_jobs(id,user_id,kind,title,prompt,status,progress,heartbeat_at,reasoning_level,autonomy_mode,allow_web,max_attempts) VALUES(?,?,?,?,?,?,0,CURRENT_TIMESTAMP,'high','continuous',1,?)").bind(jobId,userId,'work',`Agent · ${title}`,prompt,status,cfg.max_iterations),
  c.env.DB.prepare('INSERT INTO hector_agent_goals(id,user_id,work_job_id,title,objective) VALUES(?,?,?,?,?)').bind(goalId,userId,jobId,title,objective),
  c.env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,0)').bind(crypto.randomUUID(),jobId,manual?'Objetivo creado; esperando aprobación manual para iniciar':`Objetivo creado en modo ${cfg.autonomy_mode}; plan de ${plan.phases.length} fases generado`)
 ];
 if(manual)statements.push(c.env.DB.prepare("INSERT INTO hector_agent_approvals(id,user_id,goal_id,action,reason,resources_json,risk,expected_result,status) VALUES(?,?,?,?,?,?,'low',?,'pending')").bind(crypto.randomUUID(),userId,goalId,'start_goal','El modo Manual exige aprobación antes de ejecutar el objetivo',JSON.stringify([`work_job:${jobId}`]),'Iniciar la primera iteración del objetivo'));
 await c.env.DB.batch(statements);
 return c.json({goal:{id:goalId,title,status,progress:0,tasks:plan.phases.map((p,i)=>({id:`${goalId}:${i}`,name:p.name,goal:p.goal,status:i===0&&!manual?'working':'pending'}))}},201);
});

hectorAgent.get('/goals/:id',async c=>{
 const row=await c.env.DB.prepare(`SELECT g.*,w.status,w.progress,w.result,w.last_error,w.attempt_count,w.max_attempts,w.next_retry_at,w.created_at,w.updated_at FROM hector_agent_goals g JOIN work_jobs w ON w.id=g.work_job_id WHERE g.id=? AND g.user_id=?`).bind(c.req.param('id'),c.get('userId')).first<any>();
 if(!row)return c.json({error:'Objetivo no encontrado'},404);
 const events=(await c.env.DB.prepare('SELECT id,message,progress,created_at FROM work_events WHERE job_id=? ORDER BY created_at DESC LIMIT 150').bind(row.work_job_id).all<any>()).results;
 return c.json({goal:mapGoal(row),events});
});

hectorAgent.post('/goals/:id/pause',async c=>{
 const row=await c.env.DB.prepare('SELECT work_job_id FROM hector_agent_goals WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first<{work_job_id:string}>();if(!row)return c.json({error:'Objetivo no encontrado'},404);
 await c.env.DB.prepare("UPDATE work_jobs SET status='blocked',next_retry_at=NULL,last_error='Pausado desde Héctor Agent',lease_token=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.work_job_id).run();
 await c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) SELECT ?,id,'Objetivo pausado por el usuario',progress FROM work_jobs WHERE id=?").bind(crypto.randomUUID(),row.work_job_id).run();return c.json({ok:true});
});

hectorAgent.post('/goals/:id/resume',async c=>{
 const cfg=await settings(c.env,c.get('userId'));if(cfg.paused||!cfg.auto_enabled)return c.json({error:'Héctor Agent está detenido globalmente'},409);
 const row=await c.env.DB.prepare('SELECT work_job_id FROM hector_agent_goals WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first<{work_job_id:string}>();if(!row)return c.json({error:'Objetivo no encontrado'},404);
 await c.env.DB.prepare("UPDATE work_jobs SET status='queued',next_retry_at=CURRENT_TIMESTAMP,last_error=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.work_job_id).run();
 await c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) SELECT ?,id,'Objetivo reanudado; listo para la siguiente ejecución',progress FROM work_jobs WHERE id=?").bind(crypto.randomUUID(),row.work_job_id).run();return c.json({ok:true});
});

hectorAgent.post('/goals/:id/run-now',async c=>{
 const cfg=await settings(c.env,c.get('userId'));if(cfg.paused||!cfg.auto_enabled)return c.json({error:'Héctor Agent está detenido globalmente'},409);
 const row=await c.env.DB.prepare('SELECT work_job_id FROM hector_agent_goals WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first<{work_job_id:string}>();if(!row)return c.json({error:'Objetivo no encontrado'},404);
 await c.env.DB.prepare("UPDATE work_jobs SET status='queued',next_retry_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('working','testing','repairing')").bind(row.work_job_id).run();
 await c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) SELECT ?,id,'Ejecución priorizada manualmente; el cron la recogerá en el siguiente ciclo',progress FROM work_jobs WHERE id=?").bind(crypto.randomUUID(),row.work_job_id).run();return c.json({ok:true});
});

hectorAgent.get('/approvals',async c=>c.json({items:(await c.env.DB.prepare('SELECT * FROM hector_agent_approvals WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('userId')).all<any>()).results}));
hectorAgent.post('/approvals/:id/approve',async c=>{
 const userId=c.get('userId'),approval=await c.env.DB.prepare("SELECT * FROM hector_agent_approvals WHERE id=? AND user_id=? AND status='pending'").bind(c.req.param('id'),userId).first<any>();if(!approval)return c.json({error:'Aprobación no encontrada o ya resuelta'},404);
 await c.env.DB.prepare("UPDATE hector_agent_approvals SET status='approved',decided_at=CURRENT_TIMESTAMP WHERE id=?").bind(approval.id).run();
 if(approval.action==='start_goal'&&approval.goal_id){const row=await c.env.DB.prepare('SELECT work_job_id FROM hector_agent_goals WHERE id=? AND user_id=?').bind(approval.goal_id,userId).first<{work_job_id:string}>();if(row)await c.env.DB.prepare("UPDATE work_jobs SET status='queued',next_retry_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.work_job_id).run();}
 return c.json({ok:true});
});
hectorAgent.post('/approvals/:id/reject',async c=>{const result=await c.env.DB.prepare("UPDATE hector_agent_approvals SET status='rejected',decided_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='pending'").bind(c.req.param('id'),c.get('userId')).run();if(!result.meta.changes)return c.json({error:'Aprobación no encontrada o ya resuelta'},404);return c.json({ok:true});});

hectorAgent.get('/memory',async c=>c.json({items:(await c.env.DB.prepare('SELECT * FROM hector_agent_memory WHERE user_id=? ORDER BY updated_at DESC LIMIT 200').bind(c.get('userId')).all<any>()).results}));
hectorAgent.post('/memory',async c=>{const parsed=memorySchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Memoria inválida'},400);const id=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO hector_agent_memory(id,user_id,kind,content) VALUES(?,?,?,?)').bind(id,c.get('userId'),parsed.data.kind,parsed.data.content).run();return c.json({id,...parsed.data},201);});
hectorAgent.patch('/memory/:id',async c=>{const parsed=memorySchema.partial().safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Memoria inválida'},400);const current=await c.env.DB.prepare('SELECT * FROM hector_agent_memory WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first<any>();if(!current)return c.json({error:'Memoria no encontrada'},404);await c.env.DB.prepare('UPDATE hector_agent_memory SET kind=?,content=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').bind(parsed.data.kind??current.kind,parsed.data.content??current.content,current.id,c.get('userId')).run();return c.json({ok:true});});
hectorAgent.delete('/memory/:id',async c=>{const result=await c.env.DB.prepare('DELETE FROM hector_agent_memory WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).run();if(!result.meta.changes)return c.json({error:'Memoria no encontrada'},404);return c.json({ok:true});});
