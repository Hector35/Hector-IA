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
import {respond,estimateCost} from './lib/openai';

const app=new Hono<{Bindings:Bindings;Variables:Variables}>();
app.use('*',secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'",'data:'],styleSrc:["'self'","'unsafe-inline'"]}}));
app.route('/control/v1',control);
app.route('/generated',generated);
app.route('/self-improve/v1',selfImprove);
app.route('/api/auth',auth);
app.route('/api/agent',agent);
app.route('/api/intelligence',intelligence);
app.route('/api/system',systemInfo);
app.route('/api',intelligence);
app.route('/api',api);
app.get('/health',c=>c.json({ok:true,service:c.env.APP_NAME}));
app.all('*',c=>c.env.ASSETS.fetch(c.req.raw));

async function processNext(env:Bindings){
 const job=await env.DB.prepare("SELECT * FROM work_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").first<any>();
 if(!job)return;
 await env.DB.batch([
  env.DB.prepare("UPDATE work_jobs SET status='working',progress=20,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id),
  env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Analizando objetivo, restricciones y criterios de aceptación',20)").bind(crypto.randomUUID(),job.id)
 ]);
 try{
  const out=await respond(env,`Tipo de trabajo: ${job.kind}\n${job.prompt}`,undefined,[],true),u=estimateCost(out.usage);
  if(out.searchedWeb)u.costUsd+=.01;
  await env.DB.batch([
   env.DB.prepare("UPDATE work_jobs SET status='completed',progress=100,result=?,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(out.text,job.id),
   env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'Criterios revisados y resultado guardado',100)").bind(crypto.randomUUID(),job.id),
   env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),job.user_id,out.provider==='cloudflare'?'Cloudflare':'OpenAI','background-work',out.model,u.input,u.cached,u.output,u.costUsd)
  ]);
 }catch(e){
  await env.DB.batch([
   env.DB.prepare("UPDATE work_jobs SET status='blocked',result=?,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(e instanceof Error?e.message:'Error',job.id),
   env.DB.prepare("INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?, 'La ejecución encontró un bloqueo; conserva evidencia para reintento',20)").bind(crypto.randomUUID(),job.id)
  ]);
 }
}

export default {fetch:app.fetch,scheduled:(_controller:ScheduledController,env:Bindings,ctx:ExecutionContext)=>ctx.waitUntil(processNext(env))};