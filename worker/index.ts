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
import {respond,estimateCost} from './lib/openai';
import {buildPlan} from './agent/planner';
import {recordExperience} from './agent/learning';

const app=new Hono<{Bindings:Bindings;Variables:Variables}>();
app.use('*',secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'",'data:'],styleSrc:["'self'","'unsafe-inline'"]}}));
app.route('/control/v1',control);app.route('/generated',generated);app.route('/self-improve/v1',selfImprove);app.route('/runner/v1',runner);app.route('/api/auth',auth);app.route('/api/agent',agent);app.route('/api/intelligence',intelligence);app.route('/api/system',systemInfo);app.route('/api',intelligence);app.route('/api',api);
app.get('/health',c=>c.json({ok:true,service:c.env.APP_NAME}));app.all('*',c=>c.env.ASSETS.fetch(c.req.raw));

async function event(env:Bindings,jobId:string,message:string,progress:number){await env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),jobId,message,progress).run();}

async function processNext(env:Bindings){
 const job=await env.DB.prepare("SELECT * FROM work_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").first<any>();if(!job)return;
 const started=Date.now(),plan=buildPlan(job.prompt);
 await env.DB.prepare("UPDATE work_jobs SET status='working',progress=10,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id).run();
 await event(env,job.id,`Inspección iniciada. Skills: ${plan.skills.join(', ')||'general-analysis'}`,10);
 try{
  await event(env,job.id,'Plan verificable cargado; preparando ejecución',25);
  const out=await respond(env,`Ejecuta según el protocolo y entrega evidencia por criterio.\n\n${job.prompt}`,undefined,[],true),u=estimateCost(out.usage);if(out.searchedWeb)u.costUsd+=.01;
  await event(env,job.id,'Respuesta obtenida; verificando criterios y limitaciones',80);
  await env.DB.batch([
   env.DB.prepare("UPDATE work_jobs SET status='completed',progress=100,result=?,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(out.text,job.id),
   env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Resultado guardado con evidencia y límites declarados',100)").bind(crypto.randomUUID(),job.id),
   env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),job.user_id,out.provider==='cloudflare'?'Cloudflare':'OpenAI','background-work-v2',out.model,u.input,u.cached,u.output,u.costUsd)
  ]);
  await recordExperience(env,{jobId:job.id,userId:job.user_id,objective:job.prompt,status:'completed',result:out.text,skills:plan.skills,attempts:1,durationMs:Date.now()-started});
 }catch(e){const message=e instanceof Error?e.message:'Error';await env.DB.batch([
  env.DB.prepare("UPDATE work_jobs SET status='blocked',result=?,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(message,job.id),
  env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Bloqueo registrado; el próximo intento debe cambiar de estrategia',25)").bind(crypto.randomUUID(),job.id)
 ]);await recordExperience(env,{jobId:job.id,userId:job.user_id,objective:job.prompt,status:'blocked',result:message,skills:plan.skills,attempts:1,durationMs:Date.now()-started});}
}

export default {fetch:app.fetch,scheduled:(_controller:ScheduledController,env:Bindings,ctx:ExecutionContext)=>ctx.waitUntil(processNext(env))};