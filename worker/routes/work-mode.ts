import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {WORK_MODE_PREFIX,cleanWorkModeOutput,deriveWorkTitle,unwrapWorkObjective,wrapWorkObjective} from '../lib/work-mode';

export const workMode=new Hono<{Bindings:Bindings;Variables:Variables}>();
workMode.use('*',requireAuth);

const createSchema=z.object({objective:z.string().min(10).max(12000)});
const activeStatuses=['queued','working','testing','repairing'] as const;

function present(row:any){return{
 id:String(row.id),title:String(row.title||'Trabajo persistente'),objective:unwrapWorkObjective(String(row.prompt||'')),status:String(row.status||'queued'),checkpoint:cleanWorkModeOutput(row.result),lastError:row.last_error?String(row.last_error):null,attemptCount:Number(row.attempt_count||0),nextRunAt:row.next_retry_at||null,heartbeatAt:row.heartbeat_at||null,createdAt:row.created_at,updatedAt:row.updated_at
};}

workMode.get('/',async c=>{
 const rows=(await c.env.DB.prepare(`SELECT id,title,prompt,status,result,last_error,attempt_count,next_retry_at,heartbeat_at,created_at,updated_at FROM work_jobs WHERE user_id=? AND schedule_id IS NULL AND prompt LIKE ? ORDER BY updated_at DESC LIMIT 50`).bind(c.get('userId'),`${WORK_MODE_PREFIX}%`).all()).results;
 return c.json({items:rows.map(present)});
});

workMode.post('/',async c=>{
 const parsed=createSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Describe qué debe lograr el Modo Trabajo',details:parsed.error.flatten()},400);
 const userId=c.get('userId'),active=await c.env.DB.prepare(`SELECT COUNT(*) count FROM work_jobs WHERE user_id=? AND schedule_id IS NULL AND prompt LIKE ? AND status IN (${activeStatuses.map(()=>'?').join(',')})`).bind(userId,`${WORK_MODE_PREFIX}%`,...activeStatuses).first<{count:number}>();
 if(Number(active?.count||0)>=5)return c.json({error:'Ya existen cinco trabajos activos. Abre uno o espera a que avance antes de iniciar otro.'},409);
 const id=crypto.randomUUID(),objective=parsed.data.objective.trim(),title=deriveWorkTitle(objective),stored=wrapWorkObjective(objective);
 await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO work_jobs(id,user_id,kind,title,prompt,status,progress,heartbeat_at,reasoning_level,autonomy_mode,allow_web,max_attempts) VALUES(?,?, 'agent',?,?, 'queued',0,CURRENT_TIMESTAMP,'high','continuous',1,100000)").bind(id,userId,title,stored),
  c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Modo Trabajo iniciado. Héctor continuará, corregirá errores y esperará solo cuando sea necesario.',0)").bind(crypto.randomUUID(),id)
 ]);
 const row=await c.env.DB.prepare('SELECT * FROM work_jobs WHERE id=? AND user_id=?').bind(id,userId).first();
 return c.json({item:present(row)},201);
});

workMode.get('/:id',async c=>{
 const row=await c.env.DB.prepare('SELECT * FROM work_jobs WHERE id=? AND user_id=? AND schedule_id IS NULL AND prompt LIKE ?').bind(c.req.param('id'),c.get('userId'),`${WORK_MODE_PREFIX}%`).first<any>();
 if(!row)return c.json({error:'Trabajo no encontrado'},404);
 const events=(await c.env.DB.prepare('SELECT message,created_at FROM work_events WHERE job_id=? ORDER BY created_at DESC LIMIT 80').bind(row.id).all()).results;
 return c.json({item:present(row),events});
});

workMode.post('/:id/run',async c=>{
 const result=await c.env.DB.prepare(`UPDATE work_jobs SET status='queued',next_retry_at=CURRENT_TIMESTAMP,lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND schedule_id IS NULL AND prompt LIKE ? AND status NOT IN ('queued','working','testing','repairing')`).bind(c.req.param('id'),c.get('userId'),`${WORK_MODE_PREFIX}%`).run();
 if(!result.meta.changes){const exists=await c.env.DB.prepare('SELECT status FROM work_jobs WHERE id=? AND user_id=? AND schedule_id IS NULL AND prompt LIKE ?').bind(c.req.param('id'),c.get('userId'),`${WORK_MODE_PREFIX}%`).first<{status:string}>();if(!exists)return c.json({error:'Trabajo no encontrado'},404);return c.json({ok:true,alreadyActive:true,status:exists.status});}
 await c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Ejecución solicitada. El trabajo continuará desde su último punto de control.',0)").bind(crypto.randomUUID(),c.req.param('id')).run();
 return c.json({ok:true,status:'queued'});
});
