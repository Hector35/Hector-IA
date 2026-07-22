import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {latestActions,normalizeDriftIncident,restoreExecutionPlan,retryLocked} from '../lib/plan-drift-incidents';
import {aggregateDriftContainment} from '../lib/plan-drift-containment';
import {executePlannedContextual,estimatePlannedCost} from '../lib/planned-response';
import {loadContextPack,renderContext} from '../lib/context';
import {loadFeedbackRoutingProfile} from '../lib/feedback-routing';
import {verifyExecutionPlan} from '../lib/execution-plan';
import {enforceResponseContract} from '../lib/response-contract';
import {assessProviderResponse} from '../lib/provider-quality';

export const planDriftIncidents=new Hono<{Bindings:Bindings;Variables:Variables}>();
planDriftIncidents.use('*',requireAuth);

async function recordAction(env:Bindings,userId:string,incidentId:string,action:string,reason:string,extra:Record<string,unknown>={}){
 await env.DB.prepare("INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,'system','policy-drift-action','governance',0,0,0,0,?)").bind(crypto.randomUUID(),userId,JSON.stringify({incidentId,action,reason,...extra})).run();
}

async function saveRollingSummary(db:D1Database,userId:string,conversationId:string){const rows=(await db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 12').bind(conversationId).all<any>()).results.reverse();const summary=rows.map((x:any)=>`${x.role==='user'?'Héctor':'Héctor OS'}: ${String(x.content).replace(/\s+/g,' ').slice(0,260)}`).join('\n').slice(0,3000);await db.prepare("INSERT INTO conversation_summaries(conversation_id,user_id,summary,message_count) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET summary=excluded.summary,message_count=excluded.message_count,updated_at=CURRENT_TIMESTAMP").bind(conversationId,userId,summary,rows.length).run();}

planDriftIncidents.get('/',async c=>{
 const userId=c.get('userId');
 const [drifts,actions]=await Promise.all([
  c.env.DB.prepare("SELECT id,model,estimated_cost_usd,metadata_json,created_at FROM api_usage WHERE user_id=? AND service='policy-drift-blocked' ORDER BY created_at DESC LIMIT 100").bind(userId).all(),
  c.env.DB.prepare("SELECT metadata_json,created_at FROM api_usage WHERE user_id=? AND service='policy-drift-action' ORDER BY created_at DESC LIMIT 300").bind(userId).all()
 ]);
 const actionMap=latestActions((actions.results||[]) as any[]),items=(drifts.results||[]).map(row=>normalizeDriftIncident(row,actionMap)).filter((item):item is NonNullable<typeof item>=>!!item),containment=aggregateDriftContainment(items);
 return c.json({items,active:items.filter(item=>item.status==='active'||item.status==='retry-failed').length,containment,containedCauses:containment.filter(group=>group.status==='contained').length});
});

planDriftIncidents.post('/:id/action',async c=>{
 const parsed=z.object({action:z.enum(['acknowledged','recovery-requested']),reason:z.string().trim().min(3).max(400)}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Acción inválida'},400);
 const userId=c.get('userId'),incident=await c.env.DB.prepare("SELECT id FROM api_usage WHERE id=? AND user_id=? AND service='policy-drift-blocked'").bind(c.req.param('id'),userId).first();
 if(!incident)return c.json({error:'Incidente no encontrado'},404);
 await recordAction(c.env,userId,c.req.param('id'),parsed.data.action,parsed.data.reason);
 return c.json({ok:true,status:parsed.data.action});
});

planDriftIncidents.post('/:id/retry',async c=>{
 const parsed=z.object({reason:z.string().trim().min(3).max(400).default('Reintento automático solicitado desde el chat')}).safeParse(await c.req.json().catch(()=>({})));
 if(!parsed.success)return c.json({error:'Motivo inválido'},400);
 const userId=c.get('userId'),incidentId=c.req.param('id'),row=await c.env.DB.prepare("SELECT id,metadata_json FROM api_usage WHERE id=? AND user_id=? AND service='policy-drift-blocked'").bind(incidentId,userId).first<any>();
 if(!row)return c.json({error:'Incidente no encontrado'},404);
 let metadata:any={};try{metadata=JSON.parse(String(row.metadata_json||'{}'));}catch{return c.json({error:'Metadata del incidente corrupta'},409);}
 const actions=(await c.env.DB.prepare("SELECT metadata_json,created_at FROM api_usage WHERE user_id=? AND service='policy-drift-action' ORDER BY created_at DESC LIMIT 300").bind(userId).all()).results as any[],latest=latestActions(actions).get(incidentId);
 if(retryLocked(latest))return c.json({error:latest?.status==='recovered'?'El incidente ya fue recuperado':'Ya existe un reintento en curso'},409);
 const conversationId=String(metadata.conversationId||''),userMessageId=String(metadata.userMessageId||''),expectedHash=String(metadata.planHash||''),plan=await restoreExecutionPlan(metadata.executionPlan,expectedHash);
 if(!conversationId||!userMessageId||!plan)return c.json({error:'Este incidente no conserva un plan original recuperable'},409);
 const original=await c.env.DB.prepare("SELECT m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND m.conversation_id=? AND m.role='user' AND c.user_id=?").bind(userMessageId,conversationId,userId).first<{content:string}>();
 if(!original?.content)return c.json({error:'No se encontró el mensaje original'},409);
 await recordAction(c.env,userId,incidentId,'retrying',parsed.data.reason,{planHash:plan.hash});
 try{
  const pack=await loadContextPack(c.env,userId,conversationId,original.content),context=renderContext(pack),feedback=await loadFeedbackRoutingProfile(c.env.DB,userId,plan.task),started=Date.now(),out=await executePlannedContextual(c.env,original.content,pack.recentMessages,context,plan,{feedback,budgetDecision:null}),verification=verifyExecutionPlan(plan,{model:out.model,tier:out.modelTier,provider:out.provider,requestedProvider:out.requestedProvider,cognitiveMode:out.cognitiveMode,deliberationPasses:out.deliberationPasses,fallback:out.fallback}),usage=estimatePlannedCost(out.usage,out.model);if(out.searchedWeb)usage.costUsd+=.01;
  if(!verification.ok){await recordAction(c.env,userId,incidentId,'retry-failed','El reintento volvió a desviarse del plan original',{verification,model:out.model});return c.json({error:'El reintento volvió a desviarse del plan original',verification},409);}
  const contract=enforceResponseContract(original.content,out.text),visibleText=contract.text,quality=assessProviderResponse(original.content,visibleText),assistantMessageId=crypto.randomUUID(),latencyMs=Date.now()-started;
  await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(assistantMessageId,conversationId,'assistant',visibleText),
   c.env.DB.prepare("UPDATE conversations SET openai_previous_response_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(out.provider==='openai'?out.id:null,conversationId,userId),
   c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,out.provider==='cloudflare'?'Cloudflare':'OpenAI','policy-drift-recovery',out.model,usage.input,usage.cached,usage.output,usage.costUsd,JSON.stringify({incidentId,planHash:plan.hash,verification,task:plan.task,qualityScore:quality.score,qualityAccepted:quality.accepted,latencyMs,contractApplied:contract.applied,contractReasons:contract.reasons}))
  ]);
  await recordAction(c.env,userId,incidentId,'recovered','Reintento completado con el plan original',{assistantMessageId,conversationId,verification});
  await saveRollingSummary(c.env.DB,userId,conversationId);
  return c.json({ok:true,status:'recovered',conversationId,message:{id:assistantMessageId,role:'assistant',content:visibleText},model:out.model,provider:out.provider,verification,usage});
 }catch(error){const message=error instanceof Error?error.message:'Falló el reintento';await recordAction(c.env,userId,incidentId,'retry-failed',message);return c.json({error:message},502);}
});
