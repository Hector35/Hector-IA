import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack,renderContext} from '../lib/context';
import {renderBootstrap} from '../intelligence/bootstrap';
import {callCloudflare,callHuggingFaceQwen} from '../lib/providers';
import {callHectorExperimental,hasCustomModelEndpoint,hasQueuedCustomInference,hectorRuntimeCatalog,normalizeHectorRuntime,renderHectorRuntimeCatalog,requestedHectorRuntime,stripHectorRuntimeDirective,type HectorRuntimeId} from '../lib/custom-model-runtime';
import {enforceResponseContract} from '../lib/response-contract';
import {verifyGitHubActionsOidc} from '../lib/github-actions-oidc';

const CUSTOM_RUNTIME='hector-asi-qwen15-v10';
const BASE_MODEL='Qwen/Qwen2.5-1.5B-Instruct';
const BASE_REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306';
const ADAPTER_SHA256='e1170e7a2a4e2fb19ce66744720e178955ce02fea07531f1b187366c7fa8c502';
const WORKFLOW='hector-custom-model-chat.yml';

type PendingMetadata={
 status:'pending'|'running'|'completed'|'failed';
 conversationId:string;
 userMessageId:string;
 assistantMessageId:string;
 runtimeId:string;
 adapterSha256:string;
 dispatchMode?:'immediate'|'scheduled';
 dispatchedAt?:string;
 startedAt?:string;
 completedAt?:string;
 error?:string;
 runtime?:unknown;
 contractApplied?:boolean;
 contractReasons?:string[];
};

type PendingRow={id:string;user_id:string;service:string;metadata_json:string;created_at:string};

export const modelChat=new Hono<{Bindings:Bindings;Variables:Variables}>();
modelChat.use('/models',requireAuth);
modelChat.use('/model-chat',requireAuth);

async function ensureConversation(db:D1Database,userId:string,conversationId:string|undefined,message:string){
 if(conversationId){const existing=await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(conversationId,userId).first();if(existing)return conversationId;}
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(id,userId,message.slice(0,60)||'Chat de modelos').run();
 return id;
}

async function saveRollingSummary(db:D1Database,userId:string,conversationId:string){
 const rows=(await db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 12').bind(conversationId).all<any>()).results.reverse();
 const summary=rows.map((item:any)=>`${item.role==='user'?'Héctor':'Hector ASI'}: ${String(item.content).replace(/\s+/g,' ').slice(0,260)}`).join('\n').slice(0,3000);
 await db.prepare("INSERT INTO conversation_summaries(conversation_id,user_id,summary,message_count) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET summary=excluded.summary,message_count=excluded.message_count,updated_at=CURRENT_TIMESTAMP").bind(conversationId,userId,summary,rows.length).run();
}

function chooseAvailableRuntime(env:Bindings,requested:HectorRuntimeId){
 const catalog=hectorRuntimeCatalog(env);
 if(requested!=='auto')return requested;
 if(catalog.find(item=>item.id==='hector-qwen')?.available)return'hector-qwen' as const;
 return'hector-base' as const;
}

function instructions(runtime:HectorRuntimeId,context:string){return `${renderBootstrap()}

RUNTIME SELECCIONADO
- ${runtime}
- Responde como Hector ASI.
- Responde en español salvo petición contraria.
- Distingue hechos, inferencias y límites.
- No afirmes usar pesos personalizados si el runtime no tiene customWeights.
- No inventes navegación web ni acciones ejecutadas.

CONTEXTO DINÁMICO
${context}`;}

function metadata(row:PendingRow){return JSON.parse(row.metadata_json||'{}') as PendingMetadata;}
function freshEnough(createdAt:string){const normalized=/Z$/.test(createdAt)?createdAt:`${createdAt.replace(' ','T')}Z`;return Date.now()-Date.parse(normalized)<60*60*1000;}

async function pendingRow(db:D1Database,id:string){return db.prepare("SELECT id,user_id,service,metadata_json,created_at FROM api_usage WHERE id=? AND service LIKE 'custom-model-inference-%' LIMIT 1").bind(id).first<PendingRow>();}

async function authorizeWorkflow(header:string|undefined){
 try{await verifyGitHubActionsOidc(header);return true;}catch{return false;}
}

async function dispatchInference(env:Bindings,jobId:string){
 const token=env.GITHUB_RUNNER_TOKEN?.trim();
 if(!token)return false;
 try{
  const response=await fetch(`https://api.github.com/repos/Hector35/Hector-IA/actions/workflows/${WORKFLOW}/dispatches`,{
   method:'POST',
   headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Hector-ASI'},
   body:JSON.stringify({ref:'main',inputs:{job_id:jobId}})
  });
  return response.status===204;
 }catch{return false;}
}

async function queueCustomInference(env:Bindings,userId:string,conversationId:string,userMessageId:string,selected:ReturnType<typeof hectorRuntimeCatalog>[number]){
 const assistantMessageId=crypto.randomUUID(),jobId=crypto.randomUUID();
 const placeholder='Tu modelo propio está cargando **Qwen 1.5B + los pesos LoRA de Héctor** en cómputo gratuito. La respuesta aparecerá aquí automáticamente cuando termine.';
 const pending:PendingMetadata={status:'pending',conversationId,userMessageId,assistantMessageId,runtimeId:CUSTOM_RUNTIME,adapterSha256:ADAPTER_SHA256};
 await env.DB.batch([
  env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(assistantMessageId,conversationId,'assistant',placeholder),
  env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(jobId,userId,'GitHub Actions','custom-model-inference-pending',CUSTOM_RUNTIME,0,0,0,0,JSON.stringify(pending))
 ]);
 const dispatched=await dispatchInference(env,jobId);
 pending.dispatchMode=dispatched?'immediate':'scheduled';
 if(dispatched)pending.dispatchedAt=new Date().toISOString();
 await env.DB.prepare('UPDATE api_usage SET metadata_json=? WHERE id=?').bind(JSON.stringify(pending),jobId).run();
 await saveRollingSummary(env.DB,userId,conversationId);
 return{conversationId,message:{id:assistantMessageId,role:'assistant',content:placeholder},provider:'github-actions',model:CUSTOM_RUNTIME,runtimeId:'hector-experimental',runtime:selected,fallback:false,modelTier:'custom-queued',pending:true,jobId,dispatchMode:pending.dispatchMode};
}

modelChat.get('/models',c=>c.json({items:hectorRuntimeCatalog(c.env),commands:{list:'/modelos',base:'/modelo base <mensaje>',qwen:'/modelo qwen <mensaje>',own:'/modelo propio <mensaje>'}}));

modelChat.get('/model-jobs/pending',async c=>{
 if(!await authorizeWorkflow(c.req.header('Authorization')))return c.json({error:'No autorizado'},401);
 const row=await c.env.DB.prepare("SELECT id FROM api_usage WHERE service='custom-model-inference-pending' AND created_at>=datetime('now','-1 hour') ORDER BY created_at LIMIT 1").first<{id:string}>();
 return c.json({jobId:row?.id||null});
});

modelChat.get('/model-jobs/:id/input',async c=>{
 if(!await authorizeWorkflow(c.req.header('Authorization')))return c.json({error:'No autorizado'},401);
 const row=await pendingRow(c.env.DB,c.req.param('id'));
 if(!row||!freshEnough(row.created_at))return c.json({error:'Trabajo inexistente o vencido'},404);
 const state=metadata(row);
 if(!['pending','running'].includes(state.status))return c.json({error:'Trabajo no disponible'},409);
 const userMessage=await c.env.DB.prepare('SELECT content FROM messages WHERE id=? AND conversation_id=?').bind(state.userMessageId,state.conversationId).first<{content:string}>();
 if(!userMessage)return c.json({error:'Mensaje de origen no encontrado'},404);
 const pack=await loadContextPack(c.env,row.user_id,state.conversationId,userMessage.content),context=renderContext(pack);
 const rows=(await c.env.DB.prepare('SELECT id,role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 18').bind(state.conversationId).all<any>()).results.reverse();
 const history=rows.filter((item:any)=>item.id!==state.assistantMessageId&&(item.role==='user'||item.role==='assistant')).map((item:any)=>({role:item.role,content:item.content}));
 state.status='running';state.startedAt=state.startedAt||new Date().toISOString();
 await c.env.DB.prepare("UPDATE api_usage SET service='custom-model-inference-running',metadata_json=? WHERE id=?").bind(JSON.stringify(state),row.id).run();
 return c.json({jobId:row.id,runtimeId:CUSTOM_RUNTIME,baseModel:BASE_MODEL,baseRevision:BASE_REVISION,adapterSha256:ADAPTER_SHA256,maxNewTokens:256,messages:[{role:'system',content:instructions('hector-experimental',context)},...history]});
});

modelChat.post('/model-jobs/:id/result',async c=>{
 if(!await authorizeWorkflow(c.req.header('Authorization')))return c.json({error:'No autorizado'},401);
 const parsed=z.object({text:z.string().min(1).max(20000).optional(),error:z.string().min(1).max(2000).optional(),usage:z.object({inputTokens:z.number().int().nonnegative(),outputTokens:z.number().int().nonnegative()}).optional(),runtime:z.object({model:z.string(),baseModel:z.string(),baseRevision:z.string(),adapterSha256:z.string(),latencyMs:z.number().nonnegative(),hardware:z.string()}).optional()}).refine(value=>Boolean(value.text)!==Boolean(value.error),{message:'Se requiere texto o error'}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Resultado inválido'},400);
 const row=await pendingRow(c.env.DB,c.req.param('id'));
 if(!row||!freshEnough(row.created_at))return c.json({error:'Trabajo inexistente o vencido'},404);
 const state=metadata(row);
 if(state.status==='completed')return c.json({ok:true,duplicate:true});
 if(!['pending','running'].includes(state.status))return c.json({error:'Trabajo cerrado'},409);
 const userMessage=await c.env.DB.prepare('SELECT content FROM messages WHERE id=? AND conversation_id=?').bind(state.userMessageId,state.conversationId).first<{content:string}>();
 if(!userMessage)return c.json({error:'Mensaje de origen no encontrado'},404);
 let visible:string,contractApplied=false,contractReasons:string[]=[];
 if(parsed.data.error){visible=`El modelo propio no pudo completar esta respuesta: ${parsed.data.error}`;state.status='failed';state.error=parsed.data.error;}
 else{
  if(parsed.data.runtime?.adapterSha256!==ADAPTER_SHA256||parsed.data.runtime.baseRevision!==BASE_REVISION||parsed.data.runtime.model!==CUSTOM_RUNTIME)return c.json({error:'La evidencia neuronal no coincide con el modelo autorizado'},409);
  const contract=enforceResponseContract(userMessage.content,parsed.data.text!);visible=contract.text;contractApplied=contract.applied;contractReasons=contract.reasons;state.status='completed';state.runtime=parsed.data.runtime;state.contractApplied=contractApplied;state.contractReasons=contractReasons;
 }
 state.completedAt=new Date().toISOString();
 const usage=parsed.data.usage||{inputTokens:0,outputTokens:0};
 await c.env.DB.batch([
  c.env.DB.prepare('UPDATE messages SET content=? WHERE id=? AND conversation_id=?').bind(visible,state.assistantMessageId,state.conversationId),
  c.env.DB.prepare("UPDATE api_usage SET provider='GitHub Actions',service=?,model=?,input_units=?,output_units=?,metadata_json=? WHERE id=?").bind(state.status==='completed'?'selected-model-chat':'custom-model-inference-failed',CUSTOM_RUNTIME,usage.inputTokens,usage.outputTokens,JSON.stringify(state),row.id)
 ]);
 await saveRollingSummary(c.env.DB,row.user_id,state.conversationId);
 return c.json({ok:true,status:state.status,conversationId:state.conversationId,messageId:state.assistantMessageId});
});

modelChat.post('/model-chat',async c=>{
 const parsed=z.object({message:z.string().min(1).max(12000),conversationId:z.string().uuid().optional(),runtime:z.enum(['auto','hector-base','hector-qwen','hector-experimental']).optional()}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Mensaje o modelo inválido'},400);
 const rawMessage=parsed.data.message.trim();
 if(/^\/modelos?\s*$/i.test(rawMessage))return c.json({message:{role:'assistant',content:renderHectorRuntimeCatalog(c.env)},provider:'system',model:'hector-runtime-catalog',runtimeId:'auto',catalog:hectorRuntimeCatalog(c.env)});
 const requested=normalizeHectorRuntime(parsed.data.runtime||requestedHectorRuntime(rawMessage)),runtime=chooseAvailableRuntime(c.env,requested),catalog=hectorRuntimeCatalog(c.env),selected=catalog.find(item=>item.id===runtime)!;
 if(!selected.available)return c.json({error:selected.reason||`${selected.label} no está disponible`,runtime:selected,catalog},409);
 const message=stripHectorRuntimeDirective(rawMessage),userId=c.get('userId'),conversationId=await ensureConversation(c.env.DB,userId,parsed.data.conversationId,message),userMessageId=crypto.randomUUID();
 await c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(userMessageId,conversationId,'user',message).run();
 if(runtime==='hector-experimental'&&!hasCustomModelEndpoint(c.env)&&hasQueuedCustomInference(c.env))return c.json(await queueCustomInference(c.env,userId,conversationId,userMessageId,selected),202);
 const pack=await loadContextPack(c.env,userId,conversationId,message),context=renderContext(pack),system=instructions(runtime,context),history=pack.recentMessages.filter(item=>item.role==='user'||item.role==='assistant').map(item=>({role:item.role as 'user'|'assistant',content:item.content}));
 try{
  let out:{text:string;id:string;model:string;usage?:{input_tokens?:number;output_tokens?:number}},provider:string;
  if(runtime==='hector-base'){out=await callCloudflare(c.env,system,message);provider='cloudflare';}
  else if(runtime==='hector-qwen'){out=await callHuggingFaceQwen(c.env,system,history);provider='huggingface';}
  else{out=await callHectorExperimental(c.env,system,history);provider='custom';}
  const contract=enforceResponseContract(message,out.text),assistantMessageId=crypto.randomUUID();
  await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(assistantMessageId,conversationId,'assistant',contract.text),
   c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,provider,'selected-model-chat',out.model,Number(out.usage?.input_tokens||0),0,Number(out.usage?.output_tokens||0),0,JSON.stringify({runtimeId:runtime,customWeights:selected.customWeights,contractApplied:contract.applied,contractReasons:contract.reasons}))
  ]);
  await saveRollingSummary(c.env.DB,userId,conversationId);
  return c.json({conversationId,message:{id:assistantMessageId,role:'assistant',content:contract.text},provider,model:out.model,runtimeId:runtime,runtime:selected,fallback:false,modelTier:'selected',usage:out.usage,contract:{applied:contract.applied,reasons:contract.reasons}});
 }catch(error){return c.json({error:error instanceof Error?error.message:'El modelo seleccionado no respondió',runtime:selected},502);}
});
