import {Hono} from 'hono';
import {secureHeaders} from 'hono/secure-headers';
import type {Bindings,Variables} from './types';
import {auth} from './routes/auth';
import {api} from './routes/api';
import {agent} from './routes/agent';
import {intelligence} from './routes/intelligence';
import {systemInfo} from './routes/system';
import {control} from './routes/control';
import {generated} from './routes/generated';
import {selfImprove} from './routes/self-improve';
import {runner} from './routes/runner';
import {pwaRunnerStatus} from './routes/pwa-runner-status';
import {pwaFactory} from './routes/pwa-factory';
import {evidence} from './routes/evidence';
import {workEvidence} from './routes/work-evidence';
import {schedules,processDueSchedules} from './routes/schedules';
import {delegations,processNextDelegation} from './routes/delegations';
import {projects,processProjectQueue} from './routes/projects';
import {projectGovernance} from './routes/project-governance';
import {conversations} from './routes/conversations';
import {chatAgents,processChatAgentRuns} from './routes/chat-agents';
import {respond,estimateCost} from './lib/openai';
import {buildPlan} from './agent/planner';
import {recordExperience} from './agent/learning';
import {canRetry,JOB_LEASE_SECONDS,retryDelaySeconds} from './lib/job-reliability';

const app=new Hono<{Bindings:Bindings;Variables:Variables}>();
app.use('*',secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'",'data:'],styleSrc:["'self'","'unsafe-inline'"]}}));
app.route('/control/v1',control);app.route('/generated',generated);app.route('/self-improve/v1',selfImprove);app.route('/runner/v1',runner);app.route('/runner/v1',pwaRunnerStatus);app.route('/evidence/v1',evidence);app.route('/api/auth',auth);app.route('/api/agent',agent);app.route('/api/intelligence',intelligence);app.route('/api/system',systemInfo);app.route('/api/delegations',delegations);app.route('/api/projects',projectGovernance);app.route('/api/projects',projects);app.route('/api/pwa-factory',pwaFactory);app.route('/api/conversations',conversations);app.route('/api/chat-agents',chatAgents);app.route('/api/work-evidence',workEvidence);app.route('/api/schedules',schedules);app.route('/api',intelligence);app.route('/api',api);
app.get('/health',c=>c.json({ok:true,service:c.env.APP_NAME}));app.all('*',c=>c.env.ASSETS.fetch(c.req.raw));

async function event(env:Bindings,jobId:string,message:string,progress:number){await env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),jobId,message,progress).run();}

async function recoverExpiredLeases(env:Bindings){
 await env.DB.prepare(`UPDATE work_jobs
 SET status='queued',lease_token=NULL,lease_expires_at=NULL,next_retry_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
 WHERE status='working' AND kind!='programming' AND (lease_expires_at IS NULL OR lease_expires_at<=CURRENT_TIMESTAMP)`).run();
}

async function claimNextJob(env:Bindings){
 const leaseToken=crypto.randomUUID();
 const job=await env.DB.prepare(`UPDATE work_jobs
 SET status='working',progress=10,attempt_count=attempt_count+1,lease_token=?,lease_expires_at=datetime('now',?),heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
 WHERE id=(SELECT id FROM work_jobs WHERE status='queued' AND kind!='programming' AND (next_retry_at IS NULL OR next_retry_at<=CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 1)
 AND status='queued'
 RETURNING *`).bind(leaseToken,`+${JOB_LEASE_SECONDS} seconds`).first<any>();
 return job?{job,leaseToken}:null;
}

async function processNext(env:Bindings){
 await recoverExpiredLeases(env);
 const claimed=await claimNextJob(env);if(!claimed)return;
 const {job,leaseToken}=claimed,started=Date.now(),plan=buildPlan(job.prompt);
 await event(env,job.id,`Inspección iniciada. Intento ${job.attempt_count}/${job.max_attempts}. Skills: ${plan.skills.join(', ')||'general-analysis'}`,10);
 try{
  await event(env,job.id,job.reasoning_level==='high'?'Plan cargado; usando razonamiento alto':'Plan verificable cargado; preparando ejecución',25);
  const out=await respond(env,`Ejecuta según el protocolo y entrega evidencia por criterio.\n\n${job.prompt}`,undefined,[],Boolean(job.allow_web??1),{reasoning:job.reasoning_level==='high'?'high':'auto'}),u=estimateCost(out.usage);if(out.searchedWeb)u.costUsd+=.01;
  await event(env,job.id,'Respuesta obtenida; verificando criterios y limitaciones',80);
  const completed=await env.DB.prepare("UPDATE work_jobs SET status='completed',progress=100,result=?,last_error=NULL,lease_token=NULL,lease_expires_at=NULL,next_retry_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=?").bind(out.text,job.id,leaseToken).run();
  if(!completed.meta.changes)return;
  await env.DB.batch([
   env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Resultado guardado con evidencia y límites declarados',100)").bind(crypto.randomUUID(),job.id),
   env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),job.user_id,out.provider==='cloudflare'?'Cloudflare':'OpenAI',job.schedule_id?'scheduled-work-v1':'background-work-v2',out.model,u.input,u.cached,u.output,u.costUsd)
  ]);
  await recordExperience(env,{jobId:job.id,userId:job.user_id,objective:job.prompt,status:'completed',result:out.text,skills:plan.skills,attempts:job.attempt_count,durationMs:Date.now()-started});
 }catch(e){
  const message=e instanceof Error?e.message:'Error',retry=canRetry(job.attempt_count,job.max_attempts),delay=retryDelaySeconds(job.attempt_count);
  const status=retry?'queued':'blocked';
  const nextRetry=retry?`datetime('now','+${delay} seconds')`:'NULL';
  const failed=await env.DB.prepare(`UPDATE work_jobs SET status=?,result=?,last_error=?,next_retry_at=${nextRetry},lease_token=NULL,lease_expires_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=?`).bind(status,message,message,job.id,leaseToken).run();
  if(failed.meta.changes){
   await event(env,job.id,retry?`Intento fallido; reintento programado en ${delay}s`:'Límite de intentos alcanzado; trabajo bloqueado',25);
   await recordExperience(env,{jobId:job.id,userId:job.user_id,objective:job.prompt,status,result:message,skills:plan.skills,attempts:job.attempt_count,durationMs:Date.now()-started});
  }
 }
}

async function processScheduledWork(env:Bindings){await processDueSchedules(env);await processNext(env);}

export default {fetch:app.fetch,scheduled:(_controller:ScheduledController,env:Bindings,ctx:ExecutionContext)=>{ctx.waitUntil(processScheduledWork(env));ctx.waitUntil(processNextDelegation(env));ctx.waitUntil(processProjectQueue(env));ctx.waitUntil(processChatAgentRuns(env));}};