import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {credentialState,listCapabilityRoutes,markCapabilityRouteResult,checkpointForApproval} from '../lib/hector-agent-resilience';

export const hectorAgentResilience=new Hono<{Bindings:Bindings;Variables:Variables}>();

const secretRef=z.string().regex(/^(env|oauth|vault|connector):[A-Za-z0-9._\/-]{1,240}$/,'Usa una referencia segura; nunca guardes el secreto crudo');
const credentialSchema=z.object({
 provider:z.string().trim().min(2).max(80),
 authType:z.enum(['oauth','service_account','api_token','github_app','connector','none']),
 secretRef,
 scopes:z.array(z.string().trim().min(1).max(160)).max(100).default([]),
 status:z.enum(['ready','refresh_required','expired','revoked','blocked']).default('ready'),
 refreshable:z.boolean().default(false),
 expiresAt:z.string().datetime({offset:true}).nullable().optional(),
 metadata:z.record(z.string(),z.unknown()).default({})
});
const routeSchema=z.object({
 capability:z.string().trim().min(2).max(120),provider:z.string().trim().min(2).max(80),
 routeKind:z.enum(['connector','api','github_action','worker','mcp','model','deterministic']),
 endpointRef:z.string().trim().min(1).max(500).nullable().optional(),credentialId:z.string().uuid().nullable().optional(),
 priority:z.number().int().min(0).max(10000).default(100),enabled:z.boolean().default(true),requiresApproval:z.boolean().default(false),risk:z.enum(['low','medium','high']).default('low')
});
const routeResultSchema=z.object({ok:z.boolean(),error:z.string().max(1000).nullable().optional()});
const approvalGateSchema=z.object({
 action:z.string().trim().min(2).max(160),reason:z.string().trim().min(3).max(3000),resources:z.array(z.string().max(500)).max(100).default([]),
 risk:z.enum(['low','medium','high']).default('medium'),expectedResult:z.string().trim().min(2).max(3000),checkpoint:z.record(z.string(),z.unknown()).default({})
});

function safeJson(value:string|undefined|null,fallback:any){try{return value?JSON.parse(value):fallback;}catch{return fallback;}}

hectorAgentResilience.get('/status',async c=>{
 const userId=c.get('userId');
 const [credentials,routes,checkpoints]=await Promise.all([
  c.env.DB.prepare('SELECT id,provider,auth_type,scopes_json,status,refreshable,expires_at,last_verified_at,metadata_json,created_at,updated_at FROM hector_agent_credentials WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(userId).all<any>(),
  c.env.DB.prepare('SELECT id,capability,provider,route_kind,endpoint_ref,credential_id,priority,enabled,requires_approval,risk,failure_count,cooldown_until,last_error,last_success_at,created_at,updated_at FROM hector_agent_capability_routes WHERE user_id=? ORDER BY capability,priority,failure_count LIMIT 300').bind(userId).all<any>(),
  c.env.DB.prepare("SELECT id,goal_id,work_job_id,reason,status,resume_after,approval_id,created_at,updated_at,resumed_at FROM hector_agent_resume_checkpoints WHERE user_id=? AND status IN ('ready','waiting_external','waiting_approval','resumed') ORDER BY updated_at DESC LIMIT 100").bind(userId).all<any>()
 ]);
 return c.json({
  credentials:(credentials.results as any[]).map(x=>({...x,scopes:safeJson(x.scopes_json,[]),metadata:safeJson(x.metadata_json,{})})),
  routes:routes.results,checkpoints:checkpoints.results,
  architecture:{fallbackRouter:true,credentialBroker:true,approvalGateway:true,persistentResume:true,secretsStoredInD1:false}
 });
});

hectorAgentResilience.get('/credentials',async c=>{
 const rows=(await c.env.DB.prepare('SELECT id,provider,auth_type,scopes_json,status,refreshable,expires_at,last_verified_at,metadata_json,created_at,updated_at FROM hector_agent_credentials WHERE user_id=? ORDER BY updated_at DESC LIMIT 200').bind(c.get('userId')).all<any>()).results as any[];
 return c.json({items:rows.map(x=>({...x,scopes:safeJson(x.scopes_json,[]),metadata:safeJson(x.metadata_json,{})}))});
});

hectorAgentResilience.post('/credentials',async c=>{
 const parsed=credentialSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Credencial inválida',details:parsed.error.flatten()},400);
 const userId=c.get('userId'),v=parsed.data,id=crypto.randomUUID();
 await c.env.DB.prepare(`INSERT INTO hector_agent_credentials(id,user_id,provider,auth_type,secret_ref,scopes_json,status,refreshable,expires_at,metadata_json,last_verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
  .bind(id,userId,v.provider,v.authType,v.secretRef,JSON.stringify(v.scopes),v.status,Number(v.refreshable),v.expiresAt??null,JSON.stringify(v.metadata)).run();
 return c.json({id,provider:v.provider,authType:v.authType,status:v.status,refreshable:v.refreshable,expiresAt:v.expiresAt??null,secretStored:false,secretRef:v.secretRef},201);
});

hectorAgentResilience.patch('/credentials/:id/status',async c=>{
 const schema=z.object({status:z.enum(['ready','refresh_required','expired','revoked','blocked']),expiresAt:z.string().datetime({offset:true}).nullable().optional(),verified:z.boolean().optional()});
 const parsed=schema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Estado inválido'},400);
 const v=parsed.data,result=await c.env.DB.prepare(`UPDATE hector_agent_credentials SET status=?,expires_at=COALESCE(?,expires_at),last_verified_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE last_verified_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`)
  .bind(v.status,v.expiresAt??null,v.verified?1:0,c.req.param('id'),c.get('userId')).run();
 if(!result.meta.changes)return c.json({error:'Credencial no encontrada'},404);
 return c.json({ok:true});
});

hectorAgentResilience.get('/routes',async c=>{
 const userId=c.get('userId'),capability=(c.req.query('capability')||'').trim();
 if(capability)return c.json({items:await listCapabilityRoutes(c.env,userId,capability)});
 return c.json({items:(await c.env.DB.prepare('SELECT * FROM hector_agent_capability_routes WHERE user_id=? ORDER BY capability,priority,failure_count,updated_at DESC LIMIT 500').bind(userId).all<any>()).results});
});

hectorAgentResilience.post('/routes',async c=>{
 const parsed=routeSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Ruta inválida',details:parsed.error.flatten()},400);
 const userId=c.get('userId'),v=parsed.data,id=crypto.randomUUID();
 if(v.credentialId){const credential=await c.env.DB.prepare('SELECT id FROM hector_agent_credentials WHERE id=? AND user_id=?').bind(v.credentialId,userId).first();if(!credential)return c.json({error:'La credencial no pertenece al usuario'},400);}
 await c.env.DB.prepare(`INSERT INTO hector_agent_capability_routes(id,user_id,capability,provider,route_kind,endpoint_ref,credential_id,priority,enabled,requires_approval,risk) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
  .bind(id,userId,v.capability,v.provider,v.routeKind,v.endpointRef??null,v.credentialId??null,v.priority,Number(v.enabled),Number(v.requiresApproval),v.risk).run();
 return c.json({id,...v},201);
});

hectorAgentResilience.delete('/routes/:id',async c=>{
 const result=await c.env.DB.prepare('DELETE FROM hector_agent_capability_routes WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).run();
 if(!result.meta.changes)return c.json({error:'Ruta no encontrada'},404);
 return c.json({ok:true});
});

hectorAgentResilience.post('/routes/:id/result',async c=>{
 const parsed=routeResultSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Resultado inválido'},400);
 const result=await markCapabilityRouteResult(c.env,{routeId:c.req.param('id'),userId:c.get('userId'),ok:parsed.data.ok,error:parsed.data.error});
 if(!result)return c.json({error:'Ruta no encontrada'},404);
 return c.json({ok:true});
});

hectorAgentResilience.post('/select',async c=>{
 const parsed=z.object({capability:z.string().trim().min(2).max(120)}).safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Capacidad inválida'},400);
 const userId=c.get('userId'),routes=await listCapabilityRoutes(c.env,userId,parsed.data.capability),selected=[] as any[],rejected=[] as any[];
 for(const route of routes){
  let credential:any=null;
  if(route.credential_id)credential=await c.env.DB.prepare('SELECT * FROM hector_agent_credentials WHERE id=? AND user_id=?').bind(route.credential_id,userId).first<any>();
  const state=credentialState(credential);
  const item={...route,credential:credential?{id:credential.id,provider:credential.provider,state:state.state,refreshable:Boolean(credential.refreshable),expiresAt:credential.expires_at}:null};
  if(state.usable)selected.push(item);else rejected.push({...item,rejection:`credential_${state.state}`});
 }
 return c.json({capability:parsed.data.capability,selected:selected[0]||null,fallbacks:selected.slice(1),rejected});
});

hectorAgentResilience.post('/goals/:id/approval-gate',async c=>{
 const parsed=approvalGateSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Solicitud de aprobación inválida',details:parsed.error.flatten()},400);
 const userId=c.get('userId'),goal=await c.env.DB.prepare(`SELECT g.id,g.work_job_id,w.status,w.progress FROM hector_agent_goals g JOIN work_jobs w ON w.id=g.work_job_id WHERE g.id=? AND g.user_id=?`).bind(c.req.param('id'),userId).first<any>();
 if(!goal)return c.json({error:'Objetivo no encontrado'},404);if(goal.status==='completed')return c.json({error:'El objetivo ya terminó'},409);
 const v=parsed.data,approvalId=crypto.randomUUID();
 await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO hector_agent_approvals(id,user_id,goal_id,action,reason,resources_json,risk,expected_result,status) VALUES(?,?,?,?,?,?,?,?, 'pending')").bind(approvalId,userId,goal.id,v.action,v.reason,JSON.stringify(v.resources),v.risk,v.expectedResult),
  c.env.DB.prepare("UPDATE work_jobs SET status='blocked',next_retry_at=NULL,last_error=?,lease_token=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(`Esperando aprobación: ${v.action}`,goal.work_job_id),
  c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)").bind(crypto.randomUUID(),goal.work_job_id,`Approval Gateway: esperando autorización para ${v.action}`,Number(goal.progress||0))
 ]);
 const checkpointId=await checkpointForApproval(c.env,{userId,goalId:goal.id,workJobId:goal.work_job_id,approvalId,reason:v.reason,state:v.checkpoint});
 return c.json({ok:true,approvalId,checkpointId,status:'WAITING_FOR_USER_APPROVAL'},202);
});

hectorAgentResilience.get('/goals/:id/checkpoints',async c=>{
 const userId=c.get('userId'),goal=await c.env.DB.prepare('SELECT id FROM hector_agent_goals WHERE id=? AND user_id=?').bind(c.req.param('id'),userId).first();if(!goal)return c.json({error:'Objetivo no encontrado'},404);
 return c.json({items:(await c.env.DB.prepare('SELECT * FROM hector_agent_resume_checkpoints WHERE goal_id=? AND user_id=? ORDER BY updated_at DESC LIMIT 200').bind(c.req.param('id'),userId).all<any>()).results});
});

hectorAgentResilience.post('/goals/:id/checkpoints/:checkpointId/resume',async c=>{
 const userId=c.get('userId'),row=await c.env.DB.prepare(`SELECT cp.*,s.paused,s.auto_enabled,w.status work_status FROM hector_agent_resume_checkpoints cp JOIN hector_agent_settings s ON s.user_id=cp.user_id JOIN work_jobs w ON w.id=cp.work_job_id WHERE cp.id=? AND cp.goal_id=? AND cp.user_id=?`).bind(c.req.param('checkpointId'),c.req.param('id'),userId).first<any>();
 if(!row)return c.json({error:'Checkpoint no encontrado'},404);if(row.paused||!row.auto_enabled)return c.json({error:'Héctor Agent está detenido globalmente'},409);if(row.status==='waiting_approval')return c.json({error:'Este checkpoint requiere resolver su aprobación primero'},409);if(row.status==='completed'||row.status==='cancelled')return c.json({error:'Este checkpoint ya no se puede reanudar'},409);
 await c.env.DB.batch([
  c.env.DB.prepare("UPDATE hector_agent_resume_checkpoints SET status='resumed',resumed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id),
  c.env.DB.prepare("UPDATE work_jobs SET status='queued',next_retry_at=CURRENT_TIMESTAMP,last_error=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.work_job_id),
  c.env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) SELECT ?,id,'Checkpoint persistente reanudado; objetivo devuelto a la cola',progress FROM work_jobs WHERE id=?").bind(crypto.randomUUID(),row.work_job_id)
 ]);
 return c.json({ok:true,execution:'queued_for_cron'});
});
