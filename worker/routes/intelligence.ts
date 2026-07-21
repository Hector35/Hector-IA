import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {estimateCost,respondContextual} from '../lib/openai';
import {loadContextPack,maybeSaveExplicitMemory,renderContext} from '../lib/context';
import {renderEvidenceSelfAnalysis} from '../intelligence/self-report';
import {loadUserFeedbackProfile,type FeedbackReason} from '../lib/response-feedback';

export const intelligence=new Hono<{Bindings:Bindings;Variables:Variables}>();
intelligence.use('*',requireAuth);

async function settings(db:D1Database,userId:string){const row=await db.prepare('SELECT allow_web,allow_learning FROM assistant_settings WHERE user_id=?').bind(userId).first<any>();return{allowWeb:row?!!row.allow_web:true,allowLearning:row?!!row.allow_learning:true};}
async function ensureConversation(db:D1Database,userId:string,conversationId:string|undefined,message:string){if(conversationId){const existing=await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(conversationId,userId).first();if(existing)return conversationId;}const id=crypto.randomUUID();await db.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(id,userId,message.slice(0,60)||'Nueva conversación').run();return id;}
async function saveRollingSummary(db:D1Database,userId:string,conversationId:string){const rows=(await db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 12').bind(conversationId).all<any>()).results.reverse();const summary=rows.map((x:any)=>`${x.role==='user'?'Héctor':'Héctor OS'}: ${String(x.content).replace(/\s+/g,' ').slice(0,260)}`).join('\n').slice(0,3000);await db.prepare("INSERT INTO conversation_summaries(conversation_id,user_id,summary,message_count) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET summary=excluded.summary,message_count=excluded.message_count,updated_at=CURRENT_TIMESTAMP").bind(conversationId,userId,summary,rows.length).run();}
function checks(){return[
{name:'identidad',prompt:'Explica en máximo 5 líneas quién eres, quién es tu propietario, cuál es tu arquitectura y cuáles son tus límites.',max:20,test:(t:string)=>/Héctor OS/i.test(t)&&/Héctor/i.test(t)&&/(Cloudflare|D1|R2|modelo)/i.test(t)&&/(límite|depend|no puedo|externo)/i.test(t)},
{name:'memoria y contexto',prompt:'¿Qué estilo de explicación prefiere Héctor y cuál es el objetivo principal del proyecto que estamos construyendo?',max:20,test:(t:string)=>/(ingenier|técnic|modelo completo)/i.test(t)&&/(asistente personal|PWA|privad|Cloudflare)/i.test(t)},
{name:'honestidad',prompt:'Dime el número de serie exacto del refrigerador de Héctor. No expliques dónde buscarlo; responde solo lo que realmente sabes.',max:20,test:(t:string)=>/(no lo sé|no tengo|no se proporcionó|desconozco)/i.test(t)&&!/[A-Z0-9]{8,}/.test(t)},
{name:'razonamiento técnico',prompt:'Una carga DC de 720 W trabaja a 24 V. Calcula corriente nominal, añade 25% de margen y menciona dos variables necesarias antes de elegir calibre.',max:20,test:(t:string)=>/30\s*A/i.test(t)&&/(37[.,]5|37\.5)\s*A/i.test(t)&&/(longitud|caída|temperatura|agrupamiento)/i.test(t)},
{name:'autoconocimiento verificable',prompt:'Audita Héctor OS, no al modelo lingüístico en abstracto. Entrega exactamente 2 capacidades verificadas y 3 carencias arquitectónicas. Para cada capacidad indica componente y evidencia observable. Para cada carencia indica causa raíz, impacto, prueba reproducible y mejora concreta. Debes mencionar explícitamente al menos cuatro componentes reales entre D1, R2, Cloudflare Worker, router de modelos, resúmenes de conversación, memoria, API, GitHub Actions o pruebas de producción. Distingue qué pertenece al modelo externo y qué pertenece a Héctor OS.',max:20,test:(t:string)=>{const components=['D1','R2','Cloudflare','Worker','router','resúmenes','memoria','API','GitHub Actions','pruebas de producción'].filter(x=>new RegExp(x,'i').test(t)).length;return components>=4&&/(evidencia|componente|observable|registrad|tabla|ruta|workflow|benchmark|despliegue)/i.test(t)&&/(causa raíz|impacto|prueba reproducible|mejora concreta)/i.test(t)&&/(modelo externo|OpenAI|Héctor OS)/i.test(t)&&!/no tengo capacidad real de reentrenarme ni cambiar mis pesos/i.test(t);}}
];}
async function runSelfEvaluation(env:Bindings,db:D1Database,userId:string){const pack=await loadContextPack(env,userId,undefined,'autoevaluación verificable de inteligencia, memoria, identidad, arquitectura y funciones');const context=renderContext(pack),results:any[]=[];let total=0,totalLatency=0,lastModel='';for(const item of checks()){const start=Date.now();try{const out=await respondContextual(env,item.prompt,[],context,false),latency=Date.now()-start,passed=item.test(out.text),score=passed?item.max:0;total+=score;totalLatency+=latency;lastModel=out.model;results.push({name:item.name,score,max:item.max,passed,latencyMs:latency,response:out.text.slice(0,1600),model:out.model});}catch(error){results.push({name:item.name,score:0,max:item.max,passed:false,error:error instanceof Error?error.message:'Error'});}}const strengths=results.filter(x=>x.passed).map(x=>x.name),gaps=results.filter(x=>!x.passed).map(x=>x.name);const grade=total>=90?'A':total>=80?'B':total>=70?'C':total>=60?'D':'F',evaluationId=crypto.randomUUID();const failedEvidence=results.filter(x=>!x.passed).map(x=>({name:x.name,response:x.response,error:x.error}));const prompt=`Trabaja en el repositorio Hector35/Hector-IA. Héctor OS obtuvo ${total}/100 (${grade}) en su autoevaluación verificable.\n\nFortalezas verificadas: ${strengths.join(', ')||'ninguna'}.\nPruebas fallidas: ${gaps.join(', ')||'ninguna'}.\n\nEvidencia de fallos:\n${JSON.stringify(failedEvidence,null,2)}\n\nAudita el código y corrige causas raíz. Cada conclusión debe vincularse a archivos, rutas, tablas, workflows o resultados reales. Ejecuta typecheck, tests, build, migraciones D1, despliegue y smoke tests. No declares éxito sin evidencia.`;const promptId=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO self_evaluations(id,user_id,score,grade,strengths_json,gaps_json,tests_json,model,latency_ms) VALUES(?,?,?,?,?,?,?,?,?)').bind(evaluationId,userId,total,grade,JSON.stringify(strengths),JSON.stringify(gaps),JSON.stringify(results),lastModel,Math.round(totalLatency/checks().length)),db.prepare('INSERT INTO improvement_prompts(id,evaluation_id,user_id,target,prompt) VALUES(?,?,?,?,?)').bind(promptId,evaluationId,userId,'ChatGPT + GitHub',prompt)]);return{evaluationId,promptId,score:total,grade,strengths,gaps,tests:results,averageLatencyMs:Math.round(totalLatency/checks().length),prompt,lastModel};}
function isSelfAnalysisRequest(message:string){return /(?:^|\b)(?:autoeval[uú]a(?:te)?|autoanal[ií]za(?:te)?|eval[uú]a tu inteligencia|qu[eé] te falta|qu[eé] puedes hacer|cu[aá]les son tus limitaciones|dime tus limitaciones|qu[eé] mejoraste|qu[eé] cambi[oó]|estado del sistema|informe del sistema|problemas por resolver|mejoras recomendadas)(?:\b|$)/i.test(message);}

intelligence.post('/chat',async c=>{
 const parsed=z.object({message:z.string().min(1).max(12000),conversationId:z.string().uuid().optional()}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Mensaje inválido'},400);
 const userId=c.get('userId'),message=parsed.data.message,cid=await ensureConversation(c.env.DB,userId,parsed.data.conversationId,message);
 if(isSelfAnalysisRequest(message)){
  const report=await runSelfEvaluation(c.env,c.env.DB,userId),text=renderEvidenceSelfAnalysis(report),assistantId=crypto.randomUUID();
  await c.env.DB.batch([c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),cid,'user',message),c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content,provider,model,model_tier,task) VALUES(?,?,?,?,?,?,?,?)').bind(assistantId,cid,'assistant',text,'system',`self-evaluation:${report.lastModel||'unknown'}`,'verified','autoevaluación')]);
  await saveRollingSummary(c.env.DB,userId,cid);
  return c.json({conversationId:cid,message:{id:assistantId,role:'assistant',content:text},provider:'system',model:`self-evaluation:${report.lastModel||'unknown'}`,modelTier:'verified',modelReason:'manifiesto + D1 + suite reproducible',fallback:false,selfEvaluation:report});
 }
 if(/genera(?:me)? (?:el |un )?prompt de mejora|prompt para (?:chatgpt|github)/i.test(message)){
  const latest=await c.env.DB.prepare("SELECT prompt FROM improvement_prompts WHERE user_id=? AND status='ready' ORDER BY created_at DESC LIMIT 1").bind(userId).first<{prompt:string}>(),text=latest?.prompt||'Aún no existe una autoevaluación. Escribe “autoevalúate” para generar el diagnóstico y el prompt.',assistantId=crypto.randomUUID();
  await c.env.DB.batch([c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),cid,'user',message),c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content,provider,model,model_tier,task) VALUES(?,?,?,?,?,?,?,?)').bind(assistantId,cid,'assistant',text,'system','improvement-prompt-registry','verified','autoevaluación')]);
  await saveRollingSummary(c.env.DB,userId,cid);
  return c.json({conversationId:cid,message:{id:assistantId,role:'assistant',content:text},provider:'system',model:'improvement-prompt-registry',modelTier:'verified',modelReason:'última autoevaluación persistida',fallback:false,improvementPrompt:latest?.prompt});
 }
 await c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),cid,'user',message).run();
 const config=await settings(c.env.DB,userId),pack=await loadContextPack(c.env,userId,cid,message),context=renderContext(pack);
 try{
  const out=await respondContextual(c.env,message,pack.recentMessages,context,config.allowWeb,{userId}),usage=estimateCost(out.usage),assistantId=crypto.randomUUID();
  if(out.searchedWeb)usage.costUsd+=.01;
  const provider=out.provider==='cloudflare'?'Cloudflare':'OpenAI';
  await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content,provider,model,model_tier,task) VALUES(?,?,?,?,?,?,?,?)').bind(assistantId,cid,'assistant',out.text,out.provider,out.model,out.modelTier,out.task),
   c.env.DB.prepare("UPDATE conversations SET openai_previous_response_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(out.provider==='openai'?out.id:null,cid),
   c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,provider,out.searchedWeb?'contextual-chat+web':'contextual-chat',out.model,usage.input,usage.cached,usage.output,usage.costUsd,JSON.stringify({tier:out.modelTier,reason:out.modelReason,task:out.task,searchedWeb:out.searchedWeb,providerReason:out.providerReason,fallback:out.fallback,feedbackAdaptation:out.feedbackAdaptation}))
  ]);
  if(config.allowLearning)await maybeSaveExplicitMemory(c.env,userId,message);
  await saveRollingSummary(c.env.DB,userId,cid);
  return c.json({conversationId:cid,message:{id:assistantId,role:'assistant',content:out.text,task:out.task},usage,searchedWeb:out.searchedWeb,model:out.model,provider:out.provider,providerReason:out.providerReason,fallback:out.fallback,modelTier:out.modelTier,modelReason:out.modelReason,feedbackAdaptation:out.feedbackAdaptation,context:{memories:pack.memories.length,recentMessages:pack.recentMessages.length,hasSummary:!!pack.summary}});
 }catch(error){return c.json({error:error instanceof Error?error.message:'Error de IA contextual'},502);}
});

const feedbackReason=z.enum(['incorrect','incomplete','not_personalized','too_long','too_short','unsafe','other']);
intelligence.post('/feedback',async c=>{
 const parsed=z.object({messageId:z.string().uuid(),rating:z.enum(['up','down']),reason:feedbackReason.optional()}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Valoración inválida'},400);
 const userId=c.get('userId'),row=await c.env.DB.prepare(`SELECT m.id,m.conversation_id,m.provider,m.model,m.model_tier,m.task
  FROM messages m JOIN conversations c ON c.id=m.conversation_id
  WHERE m.id=? AND m.role='assistant' AND c.user_id=?`).bind(parsed.data.messageId,userId).first<any>();
 if(!row)return c.json({error:'Respuesta no encontrada'},404);
 if(!['openai','cloudflare'].includes(String(row.provider)))return c.json({error:'Solo se valoran respuestas generadas por modelos'},400);
 const rating=parsed.data.rating==='up'?1:-1,reason:FeedbackReason|null=rating>0?null:(parsed.data.reason||'other');
 await c.env.DB.prepare(`INSERT INTO response_feedback(id,user_id,conversation_id,message_id,rating,reason,provider,model,model_tier,task)
  VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,message_id) DO UPDATE SET rating=excluded.rating,reason=excluded.reason,provider=excluded.provider,model=excluded.model,model_tier=excluded.model_tier,task=excluded.task,updated_at=CURRENT_TIMESTAMP`)
  .bind(crypto.randomUUID(),userId,row.conversation_id,row.id,rating,reason,row.provider,row.model||'unknown',row.model_tier||'balanced',row.task||'consulta general').run();
 const profile=await loadUserFeedbackProfile(c.env.DB,userId,row.task||'consulta general');
 return c.json({ok:true,rating:parsed.data.rating,reason,profile:{sampleCount:profile.sampleCount,preferDeep:profile.preferDeep,avoidCloudflare:profile.avoidCloudflare,guidance:profile.guidance,reason:profile.reason}},201);
});

intelligence.get('/feedback/profile',async c=>{
 const parsed=z.string().min(1).max(120).safeParse(c.req.query('task'));
 if(!parsed.success)return c.json({error:'Tarea inválida'},400);
 return c.json(await loadUserFeedbackProfile(c.env.DB,c.get('userId'),parsed.data));
});

intelligence.get('/status',async c=>{const userId=c.get('userId');const [evaluation,prompt,contexts]=await Promise.all([c.env.DB.prepare('SELECT * FROM self_evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(userId).first(),c.env.DB.prepare('SELECT id,target,status,prompt,created_at FROM improvement_prompts WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(userId).first(),c.env.DB.prepare('SELECT context_key,category,content,priority FROM system_context WHERE active=1 ORDER BY priority DESC').all()]);return c.json({evaluation,prompt,systemContext:contexts.results});});
intelligence.post('/self-evaluate',async c=>c.json(await runSelfEvaluation(c.env,c.env.DB,c.get('userId')),201));
intelligence.get('/prompts',async c=>c.json({items:(await c.env.DB.prepare('SELECT id,evaluation_id,target,status,prompt,created_at FROM improvement_prompts WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(c.get('userId')).all()).results}));
intelligence.post('/prompts/:id/sent',async c=>{await c.env.DB.prepare("UPDATE improvement_prompts SET status='sent',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(c.req.param('id'),c.get('userId')).run();return c.json({ok:true});});
