import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadCognitiveBudget} from '../lib/cognitive-budget';
import {budgetNotification,dedupeOperationalNotifications,qualityNotification,workNotification,type OperationalNotification} from '../lib/operational-notifications';

export const operationalNotifications=new Hono<{Bindings:Bindings;Variables:Variables}>();
operationalNotifications.use('*',requireAuth);

async function safeRows(db:D1Database,sql:string,bindings:unknown[]){try{return((await db.prepare(sql).bind(...bindings).all<any>()).results||[]);}catch{return[];}}

operationalNotifications.get('/',async c=>{
 const userId=c.get('userId'),items:OperationalNotification[]=[];
 try{const status=await loadCognitiveBudget(c.env.DB,userId),notice=budgetNotification(status);if(notice)items.push(notice);}catch{}
 const [quality,work,runner,state]=await Promise.all([
  safeRows(c.env.DB,"SELECT task,reason,sample_count,last_seen_at,updated_at FROM budget_quality_alerts WHERE user_id=? AND state='active' AND acknowledged_at IS NULL AND (muted_until IS NULL OR muted_until<=CURRENT_TIMESTAMP) ORDER BY updated_at DESC LIMIT 20",[userId]),
  safeRows(c.env.DB,"SELECT id,kind,title,status,result,last_error,updated_at FROM work_jobs WHERE user_id=? AND status IN ('blocked','failed') ORDER BY updated_at DESC LIMIT 20",[userId]),
  safeRows(c.env.DB,"SELECT w.job_id id,w.message,w.created_at FROM work_events w JOIN work_jobs j ON j.id=w.job_id WHERE j.user_id=? AND (lower(w.message) LIKE '%runner%' OR lower(w.message) LIKE '%github rechazó%') ORDER BY w.created_at DESC LIMIT 10",[userId]),
  safeRows(c.env.DB,'SELECT event_key,acknowledged_at,muted_until FROM operational_notification_state WHERE user_id=?',[userId])
 ]);
 items.push(...quality.map(qualityNotification),...work.map(workNotification),...runner.map(row=>({key:`runner:${row.id}`,source:'runner' as const,severity:'critical' as const,title:'Incidente del runner',message:String(row.message),action:'Abrir Trabajo',createdAt:row.created_at})));
 const hidden=new Map(state.map(row=>[String(row.event_key),row]));
 const visible=dedupeOperationalNotifications(items).filter(item=>{const saved=hidden.get(item.key);return !saved?.acknowledged_at&&(!saved?.muted_until||new Date(saved.muted_until).getTime()<=Date.now());});
 return c.json({items:visible,summary:{total:visible.length,critical:visible.filter(x=>x.severity==='critical').length,warning:visible.filter(x=>x.severity==='warning').length,info:visible.filter(x=>x.severity==='info').length},contentStored:false});
});

operationalNotifications.post('/:key/action',async c=>{
 const parsed=z.object({action:z.enum(['acknowledge','mute','unmute']),muteHours:z.number().int().min(1).max(720).optional()}).safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Acción inválida'},400);
 const userId=c.get('userId'),key=decodeURIComponent(c.req.param('key')).slice(0,240),action=parsed.data.action;
 if(action==='unmute')await c.env.DB.prepare("INSERT INTO operational_notification_state(user_id,event_key,muted_until,acknowledged_at,updated_at) VALUES(?,?,NULL,NULL,CURRENT_TIMESTAMP) ON CONFLICT(user_id,event_key) DO UPDATE SET muted_until=NULL,acknowledged_at=NULL,updated_at=CURRENT_TIMESTAMP").bind(userId,key).run();
 else if(action==='acknowledge')await c.env.DB.prepare("INSERT INTO operational_notification_state(user_id,event_key,acknowledged_at,updated_at) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,event_key) DO UPDATE SET acknowledged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP").bind(userId,key).run();
 else await c.env.DB.prepare("INSERT INTO operational_notification_state(user_id,event_key,muted_until,updated_at) VALUES(?,?,datetime('now',?),CURRENT_TIMESTAMP) ON CONFLICT(user_id,event_key) DO UPDATE SET muted_until=excluded.muted_until,updated_at=CURRENT_TIMESTAMP").bind(userId,key,`+${parsed.data.muteHours||24} hours`).run();
 return c.json({ok:true,key,action});
});
