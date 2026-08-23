import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings} from '../types';
import {verifyGitHubActionsToken} from '../lib/github-oidc';
import {estimateModelCost} from '../lib/model-pricing';
import {hectorAgentLimitReason,hectorAgentRunnerControlReason,loadHectorAgentRuntimeGuard,recordHectorAgentCycle} from '../lib/hector-agent-runtime';
import {buildPlan} from '../agent/planner';
import {recordExperience} from '../agent/learning';
import {assessProductionStatuses,assessPullRequestRuns,changesNeedProduction,decodeProgrammingState,encodeProgrammingState,type ProgrammingLoopState} from '../agent/programming-loop';

const audience='hector-os-agent-runner';
const repository='Hector35/Hector-IA';
const workflow='agent-code-runner.yml';
const file=z.object({path:z.string().min(1).max(300),content:z.string().max(90000)});
const proposalRequest=z.object({jobId:z.string().uuid(),task:z.string().min(10).max(10000),attempt:z.number().int().min(1).max(3),failure:z.string().max(12000).optional(),files:z.array(file).min(1).max(30)});
const proposal=z.object({summary:z.string().min(1).max(3000),risk:z.literal('low'),hypothesis:z.string().max(3000).optional(),acceptance:z.array(z.string().max(500)).max(20).optional(),changes:z.array(file).max(8)});
const publishSchema=z.object({jobId:z.string().uuid(),proposal,verification:z.object({typecheck:z.literal(true),tests:z.literal(true),build:z.literal(true)}),runId:z.string().regex(/^\d+$/),runAttempt:z.string().regex(/^\d+$/),baseRef:z.string().min(1).max(200).default('main')});

type RunnerControl={isHectorAgent:boolean;status:string;lastError:string|null;attemptCount:number;reason:string|null};
type ProgrammingJob={id:string;user_id:string;objective:string;status:string;result:string|null;attempt_count:number;max_attempts:number;autonomy_mode:string;paused:number;auto_enabled:number;accumulated_runtime_ms:number};

export const agentProgrammingRunner=new Hono<{Bindings:Bindings}>();

const exactAllowed=new Set([
 'src/CodexApp.tsx','src/api.ts','src/MarkdownMessage.tsx','src/chat-content.css','src/codex-ui.css','src/codex-mobile.css',
 'worker/index.ts','worker/types.ts','worker/lib/openai.ts','worker/lib/context.ts','worker/lib/work-mode.ts','worker/lib/hector-agent-runtime.ts',
 'worker/routes/agent.ts','worker/routes/intelligence.ts','worker/routes/system.ts','worker/routes/hector-agent.ts','worker/routes/pwa-factory.ts','worker/routes/pwa-runner-status.ts',
 'worker/agent/planner.ts','worker/agent/skills.ts','worker/agent/skills.test.ts','worker/agent/learning.ts','worker/agent/programming-loop.ts'
]);
const deniedPrefixes=['.github/','migrations/','.env','config/'];
const deniedSensitive=/(^|\/)(auth|bridge-security|secure-entry|credential|secret)(\.|\/|-)/i;
function pathAllowed(path:string){
 if(!path||path.includes('..')||path.startsWith('/')||deniedPrefixes.some(prefix=>path.startsWith(prefix))||deniedSensitive.test(path))return false;
 if(exactAllowed.has(path))return true;
 if(path.startsWith('public/turno-rx/')||path.startsWith('public/agent/'))return /\.(?:js|mjs|css|html|webmanifest|json|txt)$/i.test(path);
 if(path.startsWith('worker/agent/'))return /(?:\.test)?\.ts$/i.test(path);
 if(path.startsWith('tests/'))return /\.(?:test\.)?(?:ts|tsx|js|mjs)$/i.test(path);
 if(path.startsWith('scripts/'))return /\.(?:mjs|js|ts)$/i.test(path)&&!/(deploy|secret|credential|migration)/i.test(path);
 return false;
}
function validateChanges(changes:Array<{path:string;content:string}>){
 if(changes.length>8)throw new Error('Demasiados archivos');let total=0;
 for(const change of changes){if(!pathAllowed(change.path))throw new Error(`Archivo no permitido: ${change.path}`);total+=change.content.length;}
 if(total>180000)throw new Error('Propuesta demasiado grande');
}

async function oidc(c:any){const token=(c.req.header('Authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!token)throw new Error('OIDC requerido');return verifyGitHubActionsToken(token,audience);}
async function github(token:string,path:string,init:RequestInit={}){
 const response=await fetch(`https://api.github.com/repos/${repository}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Hector-Agent-Persistent-Runner','Content-Type':'application/json',...(init.headers||{})}});
 const data=await response.json<any>().catch(()=>({}));
 if(!response.ok)throw new Error(`GitHub ${response.status}: ${data?.message||'error'}`);
 return data;
}
async function runnerControl(env:Bindings,jobId:string):Promise<RunnerControl>{
 const row=await env.DB.prepare(`SELECT w.status,w.last_error,w.attempt_count,g.id goal_id,COALESCE(s.paused,0) paused,COALESCE(s.auto_enabled,1) auto_enabled FROM work_jobs w LEFT JOIN hector_agent_goals g ON g.work_job_id=w.id LEFT JOIN hector_agent_settings s ON s.user_id=g.user_id WHERE w.id=? LIMIT 1`).bind(jobId).first<any>();
 if(!row)return{isHectorAgent:false,status:'missing',lastError:null,attemptCount:0,reason:'Trabajo no encontrado'};
 const attemptCount=Number(row.attempt_count||0),isHectorAgent=Boolean(row.goal_id);
 if(!isHectorAgent)return{isHectorAgent:false,status:String(row.status||''),lastError:row.last_error||null,attemptCount,reason:null};
 const guard=await loadHectorAgentRuntimeGuard(env,jobId),limitReason=guard?hectorAgentLimitReason(guard,attemptCount,'before'):null;
 const reason=hectorAgentRunnerControlReason({isHectorAgent:true,status:String(row.status||''),paused:Boolean(row.paused),autoEnabled:Boolean(row.auto_enabled),lastError:row.last_error||null,limitReason});
 return{isHectorAgent:true,status:String(row.status||''),lastError:row.last_error||null,attemptCount,reason};
}
async function block(env:Bindings,jobId:string,reason:string,progress=0){
 await env.DB.batch([
  env.DB.prepare('UPDATE hector_agent_goals SET stop_reason=?,updated_at=CURRENT_TIMESTAMP WHERE work_job_id=?').bind(reason,jobId),
  env.DB.prepare("UPDATE work_jobs SET status='blocked',last_error=?,next_retry_at=NULL,lease_token=NULL,lease_expires_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(reason,jobId),
  env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),jobId,`Programación detenida de forma segura: ${reason}`,Math.max(0,Math.min(99,progress)))
 ]);
}
async function enforce(env:Bindings,jobId:string){const control=await runnerControl(env,jobId);if(control.reason&&control.isHectorAgent&&control.status!=='blocked')await block(env,jobId,control.reason);return control;}
async function beginCycle(env:Bindings,jobId:string){
 const control=await enforce(env,jobId);if(control.reason||!control.isHectorAgent)return control;
 const counter=await env.DB.prepare('UPDATE work_jobs SET attempt_count=attempt_count+1,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING attempt_count,progress').bind(jobId).first<{attempt_count:number;progress:number}>();
 const attemptCount=Number(counter?.attempt_count||control.attemptCount+1),guard=await loadHectorAgentRuntimeGuard(env,jobId),reason=guard?hectorAgentLimitReason(guard,attemptCount,'before'):null;
 if(reason){await block(env,jobId,reason,Number(counter?.progress||0));return{...control,attemptCount,reason};}
 return{...control,attemptCount,reason:null};
}
async function finishCycle(env:Bindings,jobId:string,input:{durationMs:number;costUsd:number;failed:boolean;attemptCount:number}){
 const guard=await recordHectorAgentCycle(env,jobId,{durationMs:input.durationMs,costUsd:input.costUsd,failed:input.failed});if(!guard)return null;
 const reason=input.failed?hectorAgentLimitReason(guard,input.attemptCount,'after'):hectorAgentLimitReason(guard,0,'before');if(reason)await block(env,jobId,reason);return reason;
}

agentProgrammingRunner.post('/proposal',async c=>{
 let cycle:RunnerControl|null=null,jobId:string|null=null,started=Date.now(),costUsd=0,recorded=false;
 try{
  await oidc(c);const parsed=proposalRequest.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Payload inválido'},400);jobId=parsed.data.jobId;
  for(const source of parsed.data.files)if(!pathAllowed(source.path))return c.json({error:`Archivo no permitido: ${source.path}`},400);
  cycle=await beginCycle(c.env,jobId);if(cycle.reason)return c.json({error:cycle.reason},409);
  const source=parsed.data.files.map(item=>`\n===== ${item.path} =====\n${item.content}`).join('\n').slice(0,320000);
  const instructions=[
   'Eres el runner persistente de ingeniería de Héctor Agent. Corrige una tarea real mediante el cambio mínimo que pueda verificarse.',
   'Devuelve JSON puro con {summary,risk:"low",hypothesis,acceptance,changes:[{path,content}]}.',
   'Solo modifica archivos incluidos en el contexto y permitidos por la jaula. Máximo 8 archivos. No borres archivos ni agregues dependencias.',
   'No modifiques autenticación, secretos, credenciales, workflows, migraciones, permisos ni infraestructura.',
   'No debilites pruebas, auditorías ni gates para obtener verde. Si una prueba falla, corrige la causa funcional.',
   'Para Pendientes conserva datos y comportamiento clínico no relacionado; usa el browser audit como evidencia, no como objetivo a esquivar.',
   'Si existe un fallo anterior, diagnostícalo y cambia de estrategia; no repitas el mismo parche a ciegas.'
  ].join('\n');
  const input=`JOB ${jobId}\nINTENTO ${parsed.data.attempt}/3\nTAREA\n${parsed.data.task}\n\nFALLO ANTERIOR\n${parsed.data.failure||'ninguno'}\n\nCÓDIGO\n${source}`;
  const model=c.env.OPENAI_MODEL_REASONING||'gpt-5.4';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${c.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input,store:false,reasoning:{effort:'high'},max_output_tokens:50000})});
  const data=await response.json<any>();costUsd=estimateModelCost(data?.usage,model).costUsd;
  if(!response.ok){recorded=true;const limit=await finishCycle(c.env,jobId,{durationMs:Date.now()-started,costUsd,failed:true,attemptCount:cycle.attemptCount});if(limit)return c.json({error:limit},409);return c.json({error:data?.error?.message||'Error de OpenAI'},502);}
  const text=String(data.output_text||data.output?.flatMap((item:any)=>item.content||[]).map((item:any)=>item.text||'').join('')||'').trim();let raw:any;
  try{raw=JSON.parse(text);}catch{const match=text.match(/\{[\s\S]*\}/);if(!match)throw new Error('Respuesta no JSON');raw=JSON.parse(match[0]);}
  const safe=proposal.parse(raw);validateChanges(safe.changes);recorded=true;
  const limit=await finishCycle(c.env,jobId,{durationMs:Date.now()-started,costUsd,failed:false,attemptCount:cycle.attemptCount});if(limit)return c.json({error:limit},409);
  const revoked=await enforce(c.env,jobId);if(revoked.reason)return c.json({error:revoked.reason},409);
  return c.json(safe);
 }catch(error){
  if(cycle?.isHectorAgent&&jobId&&!recorded){const limit=await finishCycle(c.env,jobId,{durationMs:Date.now()-started,costUsd,failed:true,attemptCount:cycle.attemptCount}).catch(()=>null);if(limit)return c.json({error:limit},409);}
  return c.json({error:error instanceof Error?error.message:'Error'},401);
 }
});

agentProgrammingRunner.post('/publish',async c=>{
 try{
  await oidc(c);const parsed=publishSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Publicación inválida'},400);const input=parsed.data;validateChanges(input.proposal.changes);
  if(!input.proposal.changes.length)return c.json({published:false,reason:'Sin cambios'});
  let control=await enforce(c.env,input.jobId);if(control.reason)return c.json({error:control.reason},409);
  const token=c.env.GITHUB_RUNNER_TOKEN?.trim();if(!token)return c.json({error:'GITHUB_RUNNER_TOKEN no configurado'},503);
  const job=await c.env.DB.prepare('SELECT result FROM work_jobs WHERE id=?').bind(input.jobId).first<{result:string|null}>();const previous=decodeProgrammingState(job?.result);
  let branch:string,prNumber:number,prUrl:string;
  const reuse=previous?.phase==='pr'&&previous.branch===input.baseRef;
  if(reuse){branch=previous.branch;prNumber=previous.prNumber;prUrl=previous.prUrl;}
  else{
   const main=await github(token,'/git/ref/heads/main');branch=`hector-agent/${input.jobId.slice(0,8)}-${input.runId}-${input.runAttempt}`;
   await github(token,'/git/refs',{method:'POST',body:JSON.stringify({ref:`refs/heads/${branch}`,sha:main.object.sha})});prNumber=0;prUrl='';
  }
  for(const change of input.proposal.changes){
   control=await enforce(c.env,input.jobId);if(control.reason)return c.json({error:control.reason},409);
   const current=await github(token,`/contents/${change.path}?ref=${encodeURIComponent(branch)}`);
   await github(token,`/contents/${change.path}`,{method:'PUT',body:JSON.stringify({message:`fix(agent): ${input.proposal.summary.slice(0,80)}`,content:btoa(unescape(encodeURIComponent(change.content))),sha:current.sha,branch})});
  }
  const ref=await github(token,`/git/ref/heads/${encodeURIComponent(branch)}`),headSha=String(ref.object.sha);
  if(!reuse){
   const pr=await github(token,'/pulls',{method:'POST',body:JSON.stringify({title:`Héctor Agent: ${input.proposal.summary.slice(0,100)}`,head:branch,base:'main',body:`Trabajo persistente ${input.jobId}\n\n${input.proposal.summary}\n\nVerificación local: typecheck, tests y build exitosos. Héctor Agent continuará hasta CI, merge y producción verificadas.`})});prNumber=Number(pr.number);prUrl=String(pr.html_url);
  }
  const state:ProgrammingLoopState={version:2,phase:'pr',branch,prNumber,prUrl,headSha,needsProduction:changesNeedProduction(input.proposal.changes.map(change=>change.path)),changePaths:input.proposal.changes.map(change=>change.path),repairCount:previous?.repairCount||0};
  await c.env.DB.batch([
   c.env.DB.prepare("UPDATE work_jobs SET status='testing',progress=85,result=?,last_error=NULL,next_retry_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(encodeProgrammingState(state),input.jobId),
   c.env.DB.prepare('UPDATE hector_agent_goals SET stop_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE work_job_id=?').bind(input.jobId),
   c.env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,85)').bind(crypto.randomUUID(),input.jobId,reuse?`PR actualizado; esperando CI: ${prUrl}`:`PR publicado; esperando CI antes de integrar: ${prUrl}`)
  ]);
  return c.json({published:true,branch,prUrl,prNumber,headSha,status:'testing'});
 }catch(error){return c.json({error:error instanceof Error?error.message:'Error'},502);}
});

async function dispatchRepair(env:Bindings,job:ProgrammingJob,state:ProgrammingLoopState,failure:string,baseRef:string){
 const guard=await loadHectorAgentRuntimeGuard(env,job.id),reason=guard?hectorAgentLimitReason(guard,Number(job.attempt_count||0),'before'):null;if(reason){await block(env,job.id,reason,70);return;}
 const token=env.GITHUB_RUNNER_TOKEN?.trim();if(!token){await block(env,job.id,'GITHUB_RUNNER_TOKEN no configurado',70);return;}
 const task=`HÉCTOR AGENT · REPARACIÓN PERSISTENTE\n\nOBJETIVO FINAL\n${job.objective}\n\nFALLO VERIFICADO\n${failure}\n\nCorrige la causa mínima, conserva funcionalidad no relacionada y no debilites pruebas ni gates.`;
 const response=await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Hector-Agent-Persistent-Runner','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{job_id:job.id,task,max_attempts:String(Math.max(1,Math.min(3,Number(job.max_attempts||3)))),base_ref:baseRef,failure}})});
 if(!response.ok){const data=await response.json<any>().catch(()=>({}));await block(env,job.id,`No se pudo despachar reparación: GitHub ${response.status} ${data?.message||''}`.trim(),70);return;}
 const next={...state,repairCount:(state.repairCount||0)+1,lastFailure:failure};
 await env.DB.batch([
  env.DB.prepare("UPDATE work_jobs SET status='working',progress=45,result=?,last_error=?,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(encodeProgrammingState(next),failure,job.id),
  env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,45)').bind(crypto.randomUUID(),job.id,`Verificación falló; reparación ${next.repairCount} despachada automáticamente: ${failure}`)
 ]);
}

async function completeProgramming(env:Bindings,job:ProgrammingJob,result:string,evidence:string[]){
 await env.DB.batch([
  env.DB.prepare("UPDATE work_jobs SET status='completed',progress=100,result=?,last_error=NULL,next_retry_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(result,job.id),
  env.DB.prepare('UPDATE hector_agent_goals SET stop_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE work_job_id=?').bind(job.id),
  ...evidence.map(message=>env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,100)').bind(crypto.randomUUID(),job.id,message))
 ]);
 const plan=buildPlan(job.objective);
 await recordExperience(env,{jobId:job.id,userId:job.user_id,objective:job.objective,status:'completed',result,skills:plan.skills,attempts:Number(job.attempt_count||1),durationMs:Number(job.accumulated_runtime_ms||0),verified:true,evidence:evidence.map(value=>({kind:'programming-verification',value,verified:true}))}).catch(()=>{});
}

async function reconcileOne(env:Bindings,job:ProgrammingJob){
 if(job.paused||!job.auto_enabled)return;const state=decodeProgrammingState(job.result);if(!state)return;
 const token=env.GITHUB_RUNNER_TOKEN?.trim();if(!token){await block(env,job.id,'GITHUB_RUNNER_TOKEN no configurado',85);return;}
 if(state.phase==='pr'){
  const runs=await github(token,`/actions/runs?head_sha=${encodeURIComponent(state.headSha)}&event=pull_request&per_page=50`),decision=assessPullRequestRuns(Array.isArray(runs.workflow_runs)?runs.workflow_runs:[]);
  if(decision.state==='pending')return;
  if(decision.state==='failure'){await dispatchRepair(env,job,state,decision.message,state.branch);return;}
  if(job.autonomy_mode!=='autonomous'){
   const reason=`CI del PR verde; el modo ${job.autonomy_mode} conserva la integración como decisión supervisada. Cambia el objetivo a modo Autónomo o integra ${state.prUrl}.`;
   await block(env,job.id,reason,90);return;
  }
  try{
   const merged=await github(token,`/pulls/${state.prNumber}/merge`,{method:'PUT',body:JSON.stringify({merge_method:'squash',sha:state.headSha,commit_title:`Héctor Agent: objetivo ${job.id.slice(0,8)}`})});
   if(!merged.merged)throw new Error(merged.message||'GitHub no integró el PR');const mergeSha=String(merged.sha||'');
   if(!state.needsProduction){await completeProgramming(env,job,`Objetivo verificado e integrado: ${state.prUrl} · ${mergeSha}`,[`CI del PR verificado: ${state.prUrl}`,`Merge protegido por SHA completado: ${mergeSha}`]);return;}
   const next:ProgrammingLoopState={...state,phase:'production',mergeSha,headSha:state.headSha};
   await env.DB.batch([
    env.DB.prepare("UPDATE work_jobs SET status='testing',progress=95,result=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(encodeProgrammingState(next),job.id),
    env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,95)').bind(crypto.randomUUID(),job.id,`PR integrado como ${mergeSha}; esperando gates de producción`)
   ]);
  }catch(error){await dispatchRepair(env,job,state,`No se pudo integrar PR verde: ${error instanceof Error?error.message:'error'}`,'main');}
  return;
 }
 if(state.phase==='production'){
  if(!state.mergeSha){await block(env,job.id,'Estado de producción sin merge SHA',95);return;}
  const status=await github(token,`/commits/${state.mergeSha}/status`),decision=assessProductionStatuses(Array.isArray(status.statuses)?status.statuses:[]);
  if(decision.state==='pending')return;
  if(decision.state==='failure'){await dispatchRepair(env,job,state,decision.message,'main');return;}
  await completeProgramming(env,job,`Objetivo completado y verificado en producción: ${state.prUrl} · ${state.mergeSha}`,[`CI del PR verificado: ${state.prUrl}`,`Merge verificado: ${state.mergeSha}`,decision.message]);
 }
}

export async function processProgrammingAgentJobs(env:Bindings){
 const rows=(await env.DB.prepare(`SELECT w.id,w.user_id,w.status,w.result,w.attempt_count,w.max_attempts,w.accumulated_runtime_ms,g.objective,s.autonomy_mode,s.paused,s.auto_enabled FROM work_jobs w JOIN hector_agent_goals g ON g.work_job_id=w.id JOIN hector_agent_settings s ON s.user_id=g.user_id WHERE w.kind='programming' AND w.status='testing' ORDER BY w.updated_at LIMIT 5`).all<ProgrammingJob>()).results||[];
 for(const row of rows)try{await reconcileOne(env,row);}catch(error){await env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),row.id,`Reconciliación de programación pospuesta: ${error instanceof Error?error.message:'error'}`,90).run();}
}
