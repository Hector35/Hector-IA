import {Hono,type Context} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack} from '../lib/context';

export const contextSync=new Hono<{Bindings:Bindings;Variables:Variables}>();
contextSync.use('*',requireAuth);

type SyncContext=Context<{Bindings:Bindings;Variables:Variables}>;
type SyncSession={id:string;external_chat_ref:string;client:string;topic:string|null;last_seen_at:string};

const chatRef=z.string().trim().min(2).max(240);
const textItem=z.string().trim().min(1).max(3000);
const bootstrapSchema=z.object({chatRef,client:z.string().trim().min(2).max(80).default('chatgpt'),topic:z.string().trim().min(2).max(300).optional(),query:z.string().trim().min(2).max(4000).optional()});
const commitSchema=z.object({
 chatRef,client:z.string().trim().min(2).max(80).default('chatgpt'),topic:z.string().trim().min(2).max(300).optional(),summary:z.string().trim().min(3).max(12000),
 decisions:z.array(textItem).max(20).default([]),actions:z.array(textItem).max(30).default([]),nextSteps:z.array(textItem).max(30).default([]),blockers:z.array(textItem).max(20).default([]),resources:z.array(textItem).max(30).default([])
});
const claimSchema=z.object({chatRef,client:z.string().trim().min(2).max(80).default('chatgpt'),topic:z.string().trim().min(2).max(300).optional(),scope:z.string().trim().min(2).max(240),intent:z.string().trim().min(3).max(2000),ttlMinutes:z.number().int().min(5).max(240).default(60)});
const releaseSchema=z.object({chatRef,claimId:z.string().uuid().optional(),scope:z.string().trim().min(2).max(240).optional()}).refine(v=>Boolean(v.claimId||v.scope),{message:'Indica claimId o scope'});

function parseJson<T>(value:unknown,fallback:T):T{try{return typeof value==='string'?JSON.parse(value) as T:fallback}catch{return fallback}}
function normalizeScope(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9:/._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,240)}

async function upsertSession(c:SyncContext,input:{chatRef:string;client:string;topic?:string}){
 const userId=c.get('userId'),id=crypto.randomUUID();
 await c.env.DB.prepare(`INSERT INTO chat_sync_sessions(id,user_id,external_chat_ref,client,topic,status,last_seen_at,updated_at)
  VALUES(?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT(user_id,external_chat_ref) DO UPDATE SET client=excluded.client,topic=COALESCE(excluded.topic,chat_sync_sessions.topic),status='active',last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
  .bind(id,userId,input.chatRef,input.client,input.topic??null).run();
 const session=await c.env.DB.prepare('SELECT id,external_chat_ref,client,topic,last_seen_at FROM chat_sync_sessions WHERE user_id=? AND external_chat_ref=?').bind(userId,input.chatRef).first<SyncSession>();
 if(!session)throw new Error('No se pudo abrir la sesión compartida');
 return session;
}

async function expireClaims(c:SyncContext){
 await c.env.DB.prepare("UPDATE coordination_claims SET status='released',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='active' AND lease_expires_at<=CURRENT_TIMESTAMP").bind(c.get('userId')).run();
}

contextSync.post('/bootstrap',async c=>{
 const parsed=bootstrapSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Bootstrap inválido',details:parsed.error.flatten()},400);
 const input=parsed.data,userId=c.get('userId'),session=await upsertSession(c,input);await expireClaims(c);
 const query=input.query||input.topic||'estado actual decisiones proyectos pendientes coordinación';
 const pack=await loadContextPack(c.env,userId,undefined,query);
 const [systemContext,records,commits,claims,projects,jobs,schedules,sessions]=await Promise.all([
  c.env.DB.prepare('SELECT context_key,category,content,priority,updated_at FROM system_context WHERE active=1 AND priority>=4 ORDER BY priority DESC,updated_at DESC LIMIT 40').all(),
  c.env.DB.prepare("SELECT id,record_type,subject,content,confidence,source_type,source_ref,tags_json,valid_from,valid_until,updated_at FROM context_hub_records WHERE user_id=? AND status='active' AND (valid_from IS NULL OR valid_from<=CURRENT_TIMESTAMP) AND (valid_until IS NULL OR valid_until>CURRENT_TIMESTAMP) ORDER BY updated_at DESC LIMIT 60").bind(userId).all(),
  c.env.DB.prepare(`SELECT cc.id,cc.topic,cc.summary,cc.decisions_json,cc.actions_json,cc.next_steps_json,cc.blockers_json,cc.resources_json,cc.created_at,
    s.external_chat_ref,s.client FROM chat_sync_commits cc JOIN chat_sync_sessions s ON s.id=cc.session_id WHERE cc.user_id=? ORDER BY cc.created_at DESC LIMIT 40`).bind(userId).all(),
  c.env.DB.prepare(`SELECT cl.id,cl.scope,cl.intent,cl.lease_expires_at,cl.updated_at,s.external_chat_ref,s.client,s.topic
    FROM coordination_claims cl JOIN chat_sync_sessions s ON s.id=cl.session_id WHERE cl.user_id=? AND cl.status='active' AND cl.lease_expires_at>CURRENT_TIMESTAMP ORDER BY cl.updated_at DESC`).bind(userId).all(),
  c.env.DB.prepare('SELECT id,title,objective,status,progress,updated_at FROM agent_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 25').bind(userId).all(),
  c.env.DB.prepare("SELECT id,kind,title,status,progress,result,last_error,next_retry_at,updated_at FROM work_jobs WHERE user_id=? AND status IN ('queued','working','testing','repairing','blocked') ORDER BY updated_at DESC LIMIT 25").bind(userId).all(),
  c.env.DB.prepare('SELECT id,title,kind,cadence,autonomy_mode,enabled,next_run_at,last_run_at,updated_at FROM scheduled_tasks WHERE user_id=? AND enabled=1 ORDER BY updated_at DESC LIMIT 25').bind(userId).all(),
  c.env.DB.prepare("SELECT id,external_chat_ref,client,topic,last_seen_at FROM chat_sync_sessions WHERE user_id=? AND status='active' ORDER BY last_seen_at DESC LIMIT 30").bind(userId).all()
 ]);
 const sharedCommits=(commits.results as any[]||[]).map(row=>({id:row.id,chatRef:row.external_chat_ref,client:row.client,topic:row.topic,summary:row.summary,decisions:parseJson(row.decisions_json,[]),actions:parseJson(row.actions_json,[]),nextSteps:parseJson(row.next_steps_json,[]),blockers:parseJson(row.blockers_json,[]),resources:parseJson(row.resources_json,[]),createdAt:row.created_at,sameChat:row.external_chat_ref===input.chatRef}));
 return c.json({
  ok:true,protocol:'hector-cross-chat-sync',version:1,session:{id:session.id,chatRef:session.external_chat_ref,client:session.client,topic:session.topic},
  rules:['bootstrap before substantial work','claim scope before parallel implementation','commit decisions/actions/next steps after meaningful work','reuse canonical state instead of inventing parallel state'],
  retrieval:{query,semanticMemory:pack.memories,priorSummaries:pack.priorSummaries.slice(0,8),projectState:pack.projectState},
  durableContext:{system:systemContext.results,records:(records.results as any[]||[]).map(row=>({...row,tags:parseJson(row.tags_json,[])}))},
  coordination:{activeClaims:claims.results,recentCommits:sharedCommits,activeSessions:sessions.results},
  work:{projects:projects.results,jobs:jobs.results,schedules:schedules.results},
  note:'La fuente de verdad es compartida y durable. No se copia cada transcripción completa al prompt; se recupera el estado relevante y los commits estructurados para evitar perder decisiones.'
 });
});

contextSync.post('/commit',async c=>{
 const parsed=commitSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Commit de contexto inválido',details:parsed.error.flatten()},400);
 const input=parsed.data,userId=c.get('userId'),session=await upsertSession(c,input),commitId=crypto.randomUUID(),summaryMemoryId=crypto.randomUUID();
 const statements:any[]=[
  c.env.DB.prepare('INSERT INTO chat_sync_commits(id,user_id,session_id,topic,summary,decisions_json,actions_json,next_steps_json,blockers_json,resources_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .bind(commitId,userId,session.id,input.topic??session.topic,input.summary,JSON.stringify(input.decisions),JSON.stringify(input.actions),JSON.stringify(input.nextSteps),JSON.stringify(input.blockers),JSON.stringify(input.resources)),
  c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?, 'fact',?,4,'cross-chat-sync')").bind(summaryMemoryId,userId,input.summary),
  c.env.DB.prepare(`INSERT INTO context_hub_records(id,user_id,memory_id,record_type,subject,content,confidence,source_type,source_ref,tags_json,metadata_json,status)
    VALUES(?,?,?,'event',?,?,0.95,'cross-chat-sync',?,? ,?,'active')`)
   .bind(summaryMemoryId,userId,summaryMemoryId,input.topic||'Chat sync',input.summary,input.chatRef,JSON.stringify(['cross-chat','summary']),JSON.stringify({commitId,client:input.client,actions:input.actions,nextSteps:input.nextSteps,blockers:input.blockers,resources:input.resources})),
  c.env.DB.prepare("INSERT INTO audit_log(id,user_id,action,resource_type,resource_id,metadata_json) VALUES(?,?,'chat_sync_commit','chat_sync_commit',?,?)")
   .bind(crypto.randomUUID(),userId,commitId,JSON.stringify({chatRef:input.chatRef,topic:input.topic,decisions:input.decisions.length}))
 ];
 for(const decision of input.decisions){
  const id=crypto.randomUUID();
  statements.push(c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,'decision',?,5,'cross-chat-sync')").bind(id,userId,decision));
  statements.push(c.env.DB.prepare(`INSERT INTO context_hub_records(id,user_id,memory_id,record_type,subject,content,confidence,source_type,source_ref,tags_json,metadata_json,status)
    VALUES(?,?,?,'decision',?,?,0.98,'cross-chat-sync',?,'["cross-chat","decision"]',?,'active')`).bind(id,userId,id,input.topic||'Shared decision',decision,input.chatRef,JSON.stringify({commitId,client:input.client})));
 }
 await c.env.DB.batch(statements);
 return c.json({ok:true,commitId,sessionId:session.id,published:{summary:true,decisions:input.decisions.length},visibleToFutureSessions:true},201);
});

contextSync.post('/claim',async c=>{
 const parsed=claimSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Claim inválido',details:parsed.error.flatten()},400);
 const input=parsed.data,userId=c.get('userId'),session=await upsertSession(c,input),scope=normalizeScope(input.scope);if(!scope)return c.json({error:'Scope inválido'},400);await expireClaims(c);
 const existing=await c.env.DB.prepare(`SELECT cl.id,cl.scope,cl.intent,cl.lease_expires_at,s.external_chat_ref,s.client,s.topic FROM coordination_claims cl JOIN chat_sync_sessions s ON s.id=cl.session_id
  WHERE cl.user_id=? AND cl.scope=? AND cl.status='active' AND cl.lease_expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(userId,scope).first<any>();
 if(existing&&existing.external_chat_ref!==input.chatRef)return c.json({error:'Scope ocupado por otra sesión',code:'coordination_scope_claimed',claim:existing},409);
 const lease=new Date(Date.now()+input.ttlMinutes*60_000).toISOString();
 if(existing){await c.env.DB.prepare('UPDATE coordination_claims SET intent=?,lease_expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').bind(input.intent,lease,existing.id,userId).run();return c.json({ok:true,claimId:existing.id,scope,leaseExpiresAt:lease,renewed:true});}
 const id=crypto.randomUUID();
 try{await c.env.DB.prepare("INSERT INTO coordination_claims(id,user_id,scope,session_id,intent,status,lease_expires_at) VALUES(?,?,?,?,?,'active',?)").bind(id,userId,scope,session.id,input.intent,lease).run();}
 catch{
  const raced=await c.env.DB.prepare(`SELECT cl.id,cl.scope,cl.intent,cl.lease_expires_at,s.external_chat_ref,s.client,s.topic FROM coordination_claims cl JOIN chat_sync_sessions s ON s.id=cl.session_id WHERE cl.user_id=? AND cl.scope=? AND cl.status='active' LIMIT 1`).bind(userId,scope).first<any>();
  return c.json({error:'Scope ocupado por otra sesión',code:'coordination_scope_claimed',claim:raced},409);
 }
 return c.json({ok:true,claimId:id,scope,leaseExpiresAt:lease,renewed:false},201);
});

contextSync.post('/release',async c=>{
 const parsed=releaseSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Release inválido',details:parsed.error.flatten()},400);
 const input=parsed.data,userId=c.get('userId');
 const session=await c.env.DB.prepare('SELECT id FROM chat_sync_sessions WHERE user_id=? AND external_chat_ref=?').bind(userId,input.chatRef).first<{id:string}>();if(!session)return c.json({error:'Sesión no encontrada'},404);
 const scope=input.scope?normalizeScope(input.scope):null;
 const result=input.claimId
  ?await c.env.DB.prepare("UPDATE coordination_claims SET status='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND session_id=? AND status='active'").bind(input.claimId,userId,session.id).run()
  :await c.env.DB.prepare("UPDATE coordination_claims SET status='released',updated_at=CURRENT_TIMESTAMP WHERE scope=? AND user_id=? AND session_id=? AND status='active'").bind(scope,userId,session.id).run();
 return c.json({ok:true,released:Number(result.meta.changes||0)>0});
});

contextSync.get('/status',async c=>{
 const userId=c.get('userId');await expireClaims(c);
 const [sessions,claims,commits]=await Promise.all([
  c.env.DB.prepare("SELECT id,external_chat_ref,client,topic,last_seen_at FROM chat_sync_sessions WHERE user_id=? AND status='active' ORDER BY last_seen_at DESC LIMIT 50").bind(userId).all(),
  c.env.DB.prepare(`SELECT cl.id,cl.scope,cl.intent,cl.lease_expires_at,s.external_chat_ref,s.client,s.topic FROM coordination_claims cl JOIN chat_sync_sessions s ON s.id=cl.session_id WHERE cl.user_id=? AND cl.status='active' ORDER BY cl.updated_at DESC`).bind(userId).all(),
  c.env.DB.prepare('SELECT COUNT(*) count,MAX(created_at) last_commit_at FROM chat_sync_commits WHERE user_id=?').bind(userId).first<any>()
 ]);
 return c.json({ok:true,protocol:'hector-cross-chat-sync',version:1,activeSessions:sessions.results,activeClaims:claims.results,commitCount:Number(commits?.count||0),lastCommitAt:commits?.last_commit_at||null});
});
