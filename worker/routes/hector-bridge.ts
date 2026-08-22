import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack} from '../lib/context';
import {buildPlan} from '../agent/planner';
import {workModeTitle} from '../lib/work-mode';

export const hectorBridge=new Hono<{Bindings:Bindings;Variables:Variables}>();
hectorBridge.use('*',requireAuth);

const memoryKind=z.enum(['fact','decision','preference','project','error','solution']);
const memoryWriteSchema=z.object({
  kind:memoryKind.default('fact'),
  content:z.string().trim().min(2).max(5000),
  importance:z.number().int().min(1).max(5).default(3)
});
const memorySearchSchema=z.object({query:z.string().trim().min(2).max(4000)});
const jobSchema=z.object({objective:z.string().trim().min(10).max(12000)});
const inspectSchema=z.object({url:z.string().trim().url().max(2000)});
const toolSchema=z.object({
  name:z.enum(['memory.search','memory.write','jobs.create','pwa.inspect']),
  input:z.record(z.string(),z.unknown()).default({})
});

const BUILTIN_TOOLS=[
  {name:'memory.search',kind:'deterministic',writes:false,description:'Recupera memoria semántica y estado reciente relevante.'},
  {name:'memory.write',kind:'deterministic',writes:true,description:'Guarda memoria persistente para Héctor Bridge y Héctor Agent.'},
  {name:'jobs.create',kind:'worker',writes:true,description:'Crea un objetivo persistente que continúa por cron aunque la interfaz esté cerrada.'},
  {name:'pwa.inspect',kind:'worker',writes:false,description:'Inspecciona una PWA remota: HTTP, título, manifest y referencias de service worker.'}
] as const;

function parseTitle(html:string){
  const match=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g,' ').trim()||null;
}
function parseLinks(html:string,rel:string){
  const links=[...html.matchAll(/<link\b[^>]*>/gi)].map(x=>x[0]);
  return links.flatMap(tag=>{
    const relMatch=tag.match(/\brel=["']([^"']+)["']/i),hrefMatch=tag.match(/\bhref=["']([^"']+)["']/i);
    if(!relMatch||!hrefMatch||!relMatch[1].split(/\s+/).some(x=>x.toLowerCase()===rel))return[];
    return[hrefMatch[1]];
  });
}
function parseServiceWorkers(text:string){
  const out=new Set<string>();
  for(const match of text.matchAll(/serviceWorker\s*\.\s*register\s*\(\s*["'`]([^"'`]+)["'`]/gi))out.add(match[1]);
  return[...out].slice(0,20);
}

async function searchMemory(env:Bindings,userId:string,input:unknown){
  const parsed=memorySearchSchema.safeParse(input);if(!parsed.success)return{error:'Consulta de memoria inválida',status:400 as const};
  const pack=await loadContextPack(env,userId,undefined,parsed.data.query);
  return{status:200 as const,data:{query:parsed.data.query,memories:pack.memories,projectState:pack.projectState,priorSummaries:pack.priorSummaries.slice(0,4)}};
}

async function writeMemory(env:Bindings,userId:string,input:unknown){
  const parsed=memoryWriteSchema.safeParse(input);if(!parsed.success)return{error:'Memoria inválida',status:400 as const};
  const id=crypto.randomUUID(),v=parsed.data;
  const duplicate=await env.DB.prepare("SELECT id FROM memories WHERE user_id=? AND lower(content)=lower(?) LIMIT 1").bind(userId,v.content).first<{id:string}>();
  if(duplicate)return{status:200 as const,data:{id:duplicate.id,deduplicated:true,...v}};
  await env.DB.batch([
    env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,?,?,?,'hector-bridge')").bind(id,userId,v.kind,v.content,v.importance),
    env.DB.prepare('INSERT OR IGNORE INTO hector_agent_memory(id,user_id,kind,content) VALUES(?,?,?,?)').bind(id,userId,v.kind,v.content)
  ]);
  return{status:201 as const,data:{id,deduplicated:false,...v}};
}

async function createJob(env:Bindings,userId:string,input:unknown){
  const parsed=jobSchema.safeParse(input);if(!parsed.success)return{error:'Objetivo inválido',status:400 as const};
  await env.DB.prepare('INSERT OR IGNORE INTO hector_agent_settings(user_id) VALUES(?)').bind(userId).run();
  const cfg=await env.DB.prepare('SELECT * FROM hector_agent_settings WHERE user_id=?').bind(userId).first<any>();
  if(!cfg||cfg.paused||!cfg.auto_enabled)return{error:'Héctor Agent está detenido globalmente',status:409 as const};
  const objective=parsed.data.objective,goalId=crypto.randomUUID(),jobId=crypto.randomUUID(),title=workModeTitle(objective),plan=buildPlan(objective);
  const memory=await loadContextPack(env,userId,undefined,objective);
  const manual=cfg.autonomy_mode==='manual',status=manual?'blocked':'queued',approvalId=manual?crypto.randomUUID():null;
  const prompt=[
    'HÉCTOR BRIDGE · OBJETIVO PERSISTENTE',
    `OBJETIVO FINAL\n${objective}`,
    `MODO DE AUTONOMÍA\n${cfg.autonomy_mode}`,
    `LÍMITES\n- Máximo ${cfg.max_iterations} ciclos\n- Máximo ${cfg.max_runtime_seconds}s acumulados\n- Presupuesto ${Number(cfg.max_cost_usd).toFixed(2)} USD\n- Máximo ${cfg.max_consecutive_errors} errores consecutivos`,
    'MEMORIA RELEVANTE',memory.memories.length?memory.memories.map(x=>`- ${x}`).join('\n'):'- Sin memoria relevante',
    'PLAN BASE',...plan.phases.map((p,i)=>`${i+1}. ${p.name}: ${p.goal}`),
    'REGLAS\n- Conserva el progreso entre ciclos.\n- Si una ruta falla, prueba una alternativa legítima antes de detener todo el objetivo.\n- Usa WORK_STATE: waiting cuando solo una dependencia externa esté bloqueada.\n- Usa WORK_STATE: complete únicamente cuando el objetivo esté verificado.'
  ].join('\n\n');
  const wait=manual?'Esperando aprobación manual desde Héctor Bridge':null;
  const statements=[
    env.DB.prepare("INSERT INTO work_jobs(id,user_id,kind,title,prompt,status,progress,heartbeat_at,reasoning_level,autonomy_mode,allow_web,max_attempts,last_error) VALUES(?,?,?,?,?,?,0,CURRENT_TIMESTAMP,'high','continuous',1,?,?)")
      .bind(jobId,userId,'work',`Bridge · ${title}`,prompt,status,cfg.max_iterations,wait),
    env.DB.prepare('INSERT INTO hector_agent_goals(id,user_id,work_job_id,title,objective) VALUES(?,?,?,?,?)').bind(goalId,userId,jobId,title,objective),
    env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,0)').bind(crypto.randomUUID(),jobId,manual?'Bridge creó el objetivo; esperando aprobación manual':`Bridge creó el objetivo en modo ${cfg.autonomy_mode}; continuará por cron`)
  ];
  if(manual&&approvalId)statements.push(env.DB.prepare("INSERT INTO hector_agent_approvals(id,user_id,goal_id,action,reason,resources_json,risk,expected_result,status) VALUES(?,?,?,?,?,?,? ,?,'pending')")
    .bind(approvalId,userId,goalId,'start_goal','El modo Manual exige autorización antes de comenzar',JSON.stringify(['hector-bridge',`work_job:${jobId}`]),'low','Iniciar el objetivo persistente solicitado desde Héctor Bridge'));
  await env.DB.batch(statements);
  return{status:201 as const,data:{goalId,jobId,title,status,approvalId,execution:manual?'waiting_approval':'queued_for_cron'}};
}

async function inspectPwa(input:unknown){
  const parsed=inspectSchema.safeParse(input);if(!parsed.success)return{error:'URL inválida',status:400 as const};
  const url=new URL(parsed.data.url);
  if(url.protocol!=='https:'||url.username||url.password)return{error:'Solo se permiten URLs HTTPS públicas sin credenciales embebidas',status:400 as const};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url.toString(),{redirect:'follow',cache:'no-store',signal:controller.signal,headers:{'User-Agent':'Hector-Bridge-PWA-Inspector/1.0'}});
    const contentType=response.headers.get('content-type')||'',text=contentType.includes('text/html')?await response.text():'';
    const clipped=text.slice(0,300_000);
    return{status:200 as const,data:{
      requestedUrl:url.toString(),finalUrl:response.url,status:response.status,ok:response.ok,contentType,
      title:parseTitle(clipped),manifest:parseLinks(clipped,'manifest'),serviceWorkers:parseServiceWorkers(clipped),
      cacheControl:response.headers.get('cache-control'),server:response.headers.get('server')
    }};
  }catch(error){return{error:error instanceof Error?error.message:'No se pudo inspeccionar la PWA',status:502 as const};}
  finally{clearTimeout(timer);}
}

hectorBridge.get('/status',async c=>{
  const userId=c.get('userId');
  const [memoryCount,routeCount,jobCount]=await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) count FROM memories WHERE user_id=?').bind(userId).first<{count:number}>(),
    c.env.DB.prepare('SELECT COUNT(*) count FROM hector_agent_capability_routes WHERE user_id=? AND enabled=1').bind(userId).first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM work_jobs WHERE user_id=? AND status IN ('queued','working','testing','repairing','blocked')").bind(userId).first<{count:number}>()
  ]);
  return c.json({ok:true,service:'Héctor Bridge Core',version:'1.0',memory:{semantic:true,count:Number(memoryCount?.count||0)},toolBroker:{builtins:BUILTIN_TOOLS.length,configuredRoutes:Number(routeCount?.count||0)},jobEngine:{persistent:true,active:Number(jobCount?.count||0),wake:'cron'},resilience:{credentialBroker:true,fallbackRouter:true,approvalGateway:true}});
});

hectorBridge.post('/memory/search',async c=>{
  const result=await searchMemory(c.env,c.get('userId'),await c.req.json().catch(()=>null));
  return result.error?c.json({error:result.error},result.status):c.json(result.data,result.status);
});
hectorBridge.post('/memory/write',async c=>{
  const result=await writeMemory(c.env,c.get('userId'),await c.req.json().catch(()=>null));
  return result.error?c.json({error:result.error},result.status):c.json(result.data,result.status);
});
hectorBridge.get('/tools/list',async c=>{
  const routes=(await c.env.DB.prepare('SELECT capability,provider,route_kind,priority,requires_approval,risk,failure_count,cooldown_until,last_error,last_success_at FROM hector_agent_capability_routes WHERE user_id=? AND enabled=1 ORDER BY capability,priority,failure_count').bind(c.get('userId')).all<any>()).results;
  return c.json({builtins:BUILTIN_TOOLS,routes});
});
hectorBridge.post('/jobs/create',async c=>{
  const result=await createJob(c.env,c.get('userId'),await c.req.json().catch(()=>null));
  return result.error?c.json({error:result.error},result.status):c.json(result.data,result.status);
});
hectorBridge.post('/tools/execute',async c=>{
  const parsed=toolSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Invocación de herramienta inválida'},400);
  const userId=c.get('userId'),{name,input}=parsed.data;
  const result=name==='memory.search'?await searchMemory(c.env,userId,input):name==='memory.write'?await writeMemory(c.env,userId,input):name==='jobs.create'?await createJob(c.env,userId,input):await inspectPwa(input);
  return result.error?c.json({tool:name,error:result.error},result.status):c.json({tool:name,result:result.data},result.status);
});
