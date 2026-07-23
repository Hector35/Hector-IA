import {Hono} from 'hono';
import {secureHeaders} from 'hono/secure-headers';
import type {Bindings,Variables} from './types';
import {auth} from './routes/auth';
import {api} from './routes/api';
import {openInteraction} from './routes/open-interaction';
import {agent} from './routes/agent';
import {intelligence} from './routes/intelligence';
import {modelChat} from './routes/model-chat';
import {selfModel} from './routes/self-model';
import {cognitiveBudget} from './routes/cognitive-budget';
import {intelligenceBenchmark} from './routes/intelligence-benchmark';
import {operationalNotifications} from './routes/operational-notifications';
import {planDriftIncidents} from './routes/plan-drift-incidents';
import {workMode} from './routes/work-mode';
import {systemInfo} from './routes/system';
import {control} from './routes/control';
import {generated} from './routes/generated';
import {selfImprove} from './routes/self-improve';
import {runner} from './routes/runner';
import {pwaRunnerStatus} from './routes/pwa-runner-status';
import {pwaFactory} from './routes/pwa-factory';
import {evidence} from './routes/evidence';
import {workEvidence} from './routes/work-evidence';
import {memoryStatus} from './routes/memory-status';
import {providerHealth} from './routes/provider-health';
import {responseTraces} from './routes/response-traces';
import {schedules,processDueSchedules} from './routes/schedules';
import {delegations,processNextDelegation} from './routes/delegations';
import {projects,processProjectQueue} from './routes/projects';
import {projectGovernance} from './routes/project-governance';
import {conversations} from './routes/conversations';
import {chatAgents,processChatAgentRuns} from './routes/chat-agents';
import {executePlannedWork} from './lib/planned-work';
import {parseWorkModeResult,renderWorkModePrompt,workModeFailureTransition} from './lib/work-mode';
import {buildPlan} from './agent/planner';
import {recordExperience} from './agent/learning';
import {canRetry,JOB_LEASE_SECONDS,retryDelaySeconds} from './lib/job-reliability';
import {hasCustomModelEndpoint,hasQueuedCustomInference} from './lib/custom-model-runtime';

const app=new Hono<{Bindings:Bindings;Variables:Variables}>();
app.use('*',secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'",'data:'],styleSrc:["'self'","'unsafe-inline'"]}}));
app.route('/control/v1',control);app.route('/generated',generated);app.route('/self-improve/v1',selfImprove);app.route('/runner/v1',runner);app.route('/runner/v1',pwaRunnerStatus);app.route('/evidence/v1',evidence);app.route('/api/auth',auth);app.route('/api/agent',agent);app.route('/api/intelligence',selfModel);app.route('/api/intelligence/budget',cognitiveBudget);app.route('/api/intelligence/benchmark',intelligenceBenchmark);app.route('/api/intelligence/plan-incidents',planDriftIncidents);app.route('/api/intelligence',modelChat);app.route('/api/intelligence',intelligence);app.route('/api/notifications',operationalNotifications);app.route('/api/work-mode',workMode);app.route('/api/system',systemInfo);app.route('/api/delegations',delegations);app.route('/api/projects',projectGovernance);app.route('/api/projects',projects);app.route('/api/pwa-factory',pwaFactory);app.route('/api/conversations',conversations);app.route('/api/chat-agents',chatAgents);app.route('/api/work-evidence',workEvidence);app.route('/api/memory',memoryStatus);app.route('/api/provider-health',providerHealth);app.route('/api/response-traces',responseTraces);app.route('/api/schedules',schedules);app.route('/api',intelligence);app.route('/api',openInteraction);app.route('/api',api);
app.get('/health',c=>c.json({ok:true,service:c.env.APP_NAME,customModel:{runtime:'hector-asi-qwen15-v10',mode:hasCustomModelEndpoint(c.env)?'endpoint':hasQueuedCustomInference(c.env)?'github-actions':'unavailable'}}));app.all('*',c=>c.env.ASSETS.fetch(c.req.raw));

async function event(env:Bindings,jobId:string,message:string,progress:number){await env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),jobId,message,progress).run();}
async function recoverExpiredLeases(env:Bindings){await env.DB.prepare(`UPDATE work_jobs SET status='queued',lease_token=NULL,lease_expires_at=NULL,next_retry_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status='working' AND kind!='programming' AND (lease_expires_at IS NULL OR lease_expires_at<=CURRENT_TIMESTAMP)`).run();}
async function claimNextJob(env:Bindings){const leaseToken=crypto.randomUUID();const job=await env.DB.prepare(`UPDATE work_jobs SET status='working',progress=10,attempt_count=attempt_count+1,lease_token=?,lease_expires_at=datetime('now',?),heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM work_jobs WHERE status='queued' AND kind!='programming' AND (next_retry_at IS NULL OR next_retry_at<=CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *`).bind(leaseToken,`+${JOB_LEASE_SECONDS} seconds`).first<any>();return job?{job,leaseToken}:null;}
export function budgetEvent(decision:any){if(!decision)return null;return decision.action==='degrade'?`Presupuesto cognitivo aplicado: ruta de menor costo (${decision.dailyPercent}% diario, ${decision.monthlyPercent}% mensual)`:`Presupuesto cognitivo: ${decision.action} (${decision.state})`;}
async function recordUsage(env:Bindings,job:any,out:any,u:any,executionPlan:any,verification:any,service:string){
 await env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),job.user_id,out.provider==='cloudflare'?'Cloudflare':'OpenAI',service,out.model,u.input,u.cached,u.output,u.costUsd,JSON.stringify({tier:out.modelTier,reason:out.modelReason,reasoningLevel:job.reasoning_level,budgetDecision:out.budgetDecision,cognitiveMode:out.cognitiveMode,deliberationPasses:out.deliberationPasses,deliberationReason:out.deliberationReason,planHash:executionPlan.hash,planVersion:executionPlan.version,planVerification:verification,pricingModel:u.pricingModel,pricingKnown:u.pricingKnown,pricingSource:u.pricingSource,longContext:u.longContext,cacheWriteTokens:u.cacheWrite})).run();
}
async function processNext(env:Bindings){
 await recoverExpiredLeases(env);const claimed=await claimNextJob(env);if(!claimed)return;
 const {job,leaseToken}=claimed,started=Date.now(),plan=buildPlan(job.prompt),continuous=job.kind==='work';
 await event(env,job.id,continuous?`Modo Trabajo: ciclo ${job.attempt_count} iniciado`:`Inspección iniciada. Intento ${job.attempt_count}/${job.max_attempts}. Skills: ${plan.skills.join(', ')||'general-analysis'}`,10);
 try{
  const high=continuous||job.reasoning_level==='high';
  await event(env,job.id,continuous?'Revisando progreso anterior y preparando la siguiente estrategia':high?'Preparando plan cognitivo inmutable con deliberación multiagente':'Preparando plan cognitivo inmutable',25);
  const workPrompt=continuous?renderWorkModePrompt(job.prompt,job.result,job.attempt_count):`Ejecuta según el protocolo y entrega evidencia por criterio.\n\n${job.prompt}`;
  const execution=await executePlannedWork(env,{userId:job.user_id,prompt:workPrompt,allowWeb:Boolean(job.allow_web??1),reasoningLevel:high?'high':'auto',context:`Trabajo ${job.id}. Tipo: ${job.kind}. Intento ${job.attempt_count}/${job.max_attempts}.`});
  const {out,plan:executionPlan,verification,usage:u}=execution;
  await event(env,job.id,`Plan ${executionPlan.hash.slice(0,12)} ${verification.status==='exact'?'ejecutado exactamente':verification.status==='allowed-fallback'?'cumplido mediante fallback autorizado':'presentó desviación'}`,55);
  if(!verification.ok){
   await recordUsage(env,job,out,u,executionPlan,verification,'background-policy-drift-blocked');
   throw new Error(`Ejecución bloqueada por desviación del plan cognitivo: ${verification.differences.join('; ')}`);
  }
  const budgetMessage=budgetEvent(out.budgetDecision);if(budgetMessage)await event(env,job.id,budgetMessage,65);
  if(continuous){
   const parsed=parseWorkModeResult(out.text);
   if(parsed.state!=='complete'){
    const delay=parsed.state==='waiting'?parsed.retryAfterMinutes:2,progress=Math.min(95,15+Number(job.attempt_count||1)*4),wait=`+${delay} minutes`;
    const advanced=await env.DB.prepare("UPDATE work_jobs SET status='queued',progress=?,result=?,last_error=NULL,next_retry_at=datetime('now',?),lease_token=NULL,lease_expires_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=?").bind(progress,parsed.text,wait,job.id,leaseToken).run();
    if(!advanced.meta.changes)return;
    await recordUsage(env,job,out,u,executionPlan,verification,parsed.state==='waiting'?'work-mode-waiting':'work-mode-cycle');
    await event(env,job.id,parsed.state==='waiting'?`Dependencia externa detectada. Espera controlada de ${delay} minuto${delay===1?'':'s'} antes de reintentar.`:parsed.explicit?'El objetivo todavía no está completo. Iniciará otro ciclo con el progreso actual.':'No se recibió confirmación verificable de cierre. El trabajo continuará automáticamente.',progress);
    return;
   }
   out.text=parsed.text||'Objetivo completado y verificado.';
  }
  await event(env,job.id,'Resultado obtenido; verificando criterios y limitaciones',80);
  const completed=await env.DB.prepare("UPDATE work_jobs SET status='completed',progress=100,result=?,last_error=NULL,lease_token=NULL,lease_expires_at=NULL,next_retry_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=?").bind(out.text,job.id,leaseToken).run();if(!completed.meta.changes)return;
  await env.DB.batch([env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Resultado guardado bajo plan cognitivo verificado',100)").bind(crypto.randomUUID(),job.id)]);
  await recordUsage(env,job,out,u,executionPlan,verification,continuous?'work-mode-completed':job.schedule_id?'scheduled-work-planned':'background-work-planned');
  await recordExperience(env,{jobId:job.id,userId:job.user_id,objective:job.prompt,status:'completed',result:out.text,skills:plan.skills,attempts:job.attempt_count,durationMs:Date.now()-started});
 }catch(e){
  const message=e instanceof Error?e.message:'Error';
  if(continuous){
   const retry=workModeFailureTransition(job.attempt_count),failed=await env.DB.prepare(`UPDATE work_jobs SET status='queued',last_error=?,next_retry_at=datetime('now','+${retry.delaySeconds} seconds'),lease_token=NULL,lease_expires_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=?`).bind(message,job.id,leaseToken).run();
   if(failed.meta.changes){await event(env,job.id,`Error detectado; Modo Trabajo conservará el avance e intentará otra alternativa en ${retry.delaySeconds}s`,25);await recordExperience(env,{jobId:job.id,userId:job.user_id,objective:job.prompt,status:'queued',result:message,skills:plan.skills,attempts:job.attempt_count,durationMs:Date.now()-started});}
   return;
  }
  const retry=canRetry(job.attempt_count,job.max_attempts),delay=retryDelaySeconds(job.attempt_count),status=retry?'queued':'blocked',nextRetry=retry?`datetime('now','+${delay} seconds')`:'NULL';const failed=await env.DB.prepare(`UPDATE work_jobs SET status=?,result=?,last_error=?,next_retry_at=${nextRetry},lease_token=NULL,lease_expires_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=?`).bind(status,message,message,job.id,leaseToken).run();if(failed.meta.changes){await event(env,job.id,retry?`Error detectado; se intentará una alternativa en ${delay}s`:'Límite de intentos alcanzado; trabajo bloqueado',25);await recordExperience(env,{jobId:job.id,userId:job.user_id,objective:job.prompt,status,result:message,skills:plan.skills,attempts:job.attempt_count,durationMs:Date.now()-started});}
 }
}
async function processScheduledWork(env:Bindings){await processDueSchedules(env);await processNext(env);}
export default {fetch:app.fetch,scheduled:(_controller:ScheduledController,env:Bindings,ctx:ExecutionContext)=>{ctx.waitUntil(processScheduledWork(env));ctx.waitUntil(processNextDelegation(env));ctx.waitUntil(processProjectQueue(env));ctx.waitUntil(processChatAgentRuns(env));}};
