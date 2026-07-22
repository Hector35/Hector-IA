import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {workModeTitle} from '../lib/work-mode';

export const workMode=new Hono<{Bindings:Bindings;Variables:Variables}>();
workMode.use('*',requireAuth);

const createSchema=z.object({goal:z.string().min(10).max(12000)});

workMode.get('/',async c=>{
 const items=(await c.env.DB.prepare(`SELECT id,title,prompt,status,progress,result,last_error,next_retry_at,attempt_count,max_attempts,created_at,updated_at FROM work_jobs WHERE user_id=? AND kind='work' ORDER BY CASE WHEN status IN ('working','queued','testing','repairing') THEN 0 ELSE 1 END,updated_at DESC LIMIT 50`).bind(c.get('userId')).all()).results;
 return c.json({items});
});

workMode.post('/',async c=>{
 const parsed=createSchema.safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Describe qué debe lograr el Modo Trabajo',details:parsed.error.flatten()},400);
 const id=crypto.randomUUID(),title=workModeTitle(parsed.data.goal);
 await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO work_jobs(id,user_id,kind,title,prompt,status,progress,heartbeat_at,reasoning_level,autonomy_mode,allow_web,max_attempts) VALUES(?,?,?,?,?,'queued',0,CURRENT_TIMESTAMP,'high','continuous',1,1000)").bind(id,c.get('userId'),'work',title,parsed.data.goal),
  c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Modo Trabajo activado: continuará, esperará o cambiará de estrategia hasta verificar el objetivo',0)").bind(crypto.randomUUID(),id)
 ]);
 return c.json({item:{id,title,status:'queued',progress:0}},201);
});

workMode.get('/:id',async c=>{
 const job=await c.env.DB.prepare("SELECT * FROM work_jobs WHERE id=? AND user_id=? AND kind='work'").bind(c.req.param('id'),c.get('userId')).first();
 if(!job)return c.json({error:'Trabajo no encontrado'},404);
 const events=(await c.env.DB.prepare('SELECT id,message,progress,created_at FROM work_events WHERE job_id=? ORDER BY created_at DESC LIMIT 100').bind(c.req.param('id')).all()).results;
 return c.json({job,events});
});

workMode.post('/:id/pause',async c=>{
 const id=c.req.param('id');
 const result=await c.env.DB.prepare("UPDATE work_jobs SET status='blocked',next_retry_at=NULL,last_error='Pausado por el usuario',lease_token=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND kind='work' AND status IN ('queued','working','testing','repairing')").bind(id,c.get('userId')).run();
 if(!result.meta.changes)return c.json({error:'El trabajo ya está pausado, terminó o no existe'},409);
 await c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) SELECT ?,id,'Modo Trabajo pausado por el usuario',progress FROM work_jobs WHERE id=?").bind(crypto.randomUUID(),id).run();
 return c.json({ok:true});
});

workMode.post('/:id/resume',async c=>{
 const result=await c.env.DB.prepare("UPDATE work_jobs SET status='queued',next_retry_at=CURRENT_TIMESTAMP,last_error=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND kind='work' AND status IN ('blocked','completed')").bind(c.req.param('id'),c.get('userId')).run();
 if(!result.meta.changes)return c.json({error:'El trabajo ya está activo o no existe'},409);
 await c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Modo Trabajo reanudado manualmente',10)").bind(crypto.randomUUID(),c.req.param('id')).run();
 return c.json({ok:true});
});