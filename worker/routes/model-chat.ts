import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack,renderContext} from '../lib/context';
import {renderBootstrap} from '../intelligence/bootstrap';
import {callCloudflare,callHuggingFaceQwen} from '../lib/providers';
import {callHectorExperimental,hectorRuntimeCatalog,normalizeHectorRuntime,renderHectorRuntimeCatalog,requestedHectorRuntime,stripHectorRuntimeDirective,type HectorRuntimeId} from '../lib/custom-model-runtime';
import {enforceResponseContract} from '../lib/response-contract';

export const modelChat=new Hono<{Bindings:Bindings;Variables:Variables}>();
modelChat.use('*',requireAuth);

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

modelChat.get('/models',c=>c.json({items:hectorRuntimeCatalog(c.env),commands:{list:'/modelos',base:'/modelo base <mensaje>',qwen:'/modelo qwen <mensaje>',own:'/modelo propio <mensaje>'}}));

modelChat.post('/model-chat',async c=>{
 const parsed=z.object({message:z.string().min(1).max(12000),conversationId:z.string().uuid().optional(),runtime:z.enum(['auto','hector-base','hector-qwen','hector-experimental']).optional()}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Mensaje o modelo inválido'},400);
 const rawMessage=parsed.data.message.trim();
 if(/^\/modelos?\b/i.test(rawMessage))return c.json({message:{role:'assistant',content:renderHectorRuntimeCatalog(c.env)},provider:'system',model:'hector-runtime-catalog',runtimeId:'auto',catalog:hectorRuntimeCatalog(c.env)});
 const requested=normalizeHectorRuntime(parsed.data.runtime||requestedHectorRuntime(rawMessage)),runtime=chooseAvailableRuntime(c.env,requested),catalog=hectorRuntimeCatalog(c.env),selected=catalog.find(item=>item.id===runtime)!;
 if(!selected.available)return c.json({error:selected.reason||`${selected.label} no está disponible`,runtime:selected,catalog},409);
 const message=stripHectorRuntimeDirective(rawMessage),userId=c.get('userId'),conversationId=await ensureConversation(c.env.DB,userId,parsed.data.conversationId,message),userMessageId=crypto.randomUUID();
 await c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(userMessageId,conversationId,'user',message).run();
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
