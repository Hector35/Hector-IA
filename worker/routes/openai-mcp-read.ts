import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {sha256} from '../lib/crypto';
import {estimateModelCost} from '../lib/model-pricing';
import {buildMcpReadResponseBody,extractMcpReadEvidence,extractOpenAIResponseText,hasSuccessfulMcpRead,type OpenAIMcpReadResponse} from '../lib/openai-mcp-read';

export const openaiMcpRead=new Hono<{Bindings:Bindings;Variables:Variables}>();
openaiMcpRead.use('*',requireAuth);

const requestSchema=z.object({message:z.string().trim().min(1).max(8000),conversationId:z.string().uuid().optional()});
const MCP_TOKEN_SCOPES=['mcp','context','tools','jobs','bridge'] as const;

function randomMachineToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));let binary='';
 for(const value of bytes)binary+=String.fromCharCode(value);
 return`htr_${btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;
}
function cleanMessage(message:string){return message.replace(/^\s*\/mcp(?:\s+|$)/i,'').trim()||'Resume mi estado actual en Héctor OS usando la fuente de verdad.';}
async function ensureConversation(db:D1Database,userId:string,conversationId:string|undefined,message:string){
 if(conversationId){const existing=await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(conversationId,userId).first();if(existing)return conversationId;}
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(id,userId,message.slice(0,60)||'Consulta MCP').run();
 return id;
}
async function callResponses(env:Bindings,body:Record<string,unknown>){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data:OpenAIMcpReadResponse=await response.json<OpenAIMcpReadResponse>().catch(()=>({error:{message:'OpenAI devolvió una respuesta no JSON'}}));
 if(!response.ok)throw new Error(String(data.error?.message||`OpenAI Responses HTTP ${response.status}`).slice(0,700));
 return data;
}

openaiMcpRead.get('/status',c=>c.json({
 ok:true,
 configured:Boolean(c.env.OPENAI_API_KEY),
 mode:'read-only',
 model:c.env.OPENAI_MODEL_FAST||c.env.OPENAI_MODEL||'gpt-5.6-luna',
 mcpEndpoint:'/mcp-read',
 command:'/mcp'
}));

openaiMcpRead.post('/chat',async c=>{
 if(c.get('authMethod')!=='session')return c.json({error:'La consulta MCP por IA solo se inicia desde una sesión interactiva autenticada'},403);
 const parsed=requestSchema.safeParse(await c.req.json().catch(()=>null));
 if(!parsed.success)return c.json({error:'Mensaje inválido'},400);
 if(!c.env.OPENAI_API_KEY)return c.json({error:'OPENAI_API_KEY no está configurada en el Worker'},503);

 const userId=c.get('userId'),message=cleanMessage(parsed.data.message),tokenId=crypto.randomUUID(),rawToken=randomMachineToken(),tokenHash=await sha256(rawToken),expiresAt=new Date(Date.now()+5*60_000).toISOString();
 await c.env.DB.prepare('INSERT INTO external_access_tokens(id,user_id,name,token_hash,scopes_json,expires_at) VALUES(?,?,?,?,?,?)').bind(tokenId,userId,'OpenAI MCP read ephemeral',tokenHash,JSON.stringify(MCP_TOKEN_SCOPES),expiresAt).run();

 try{
  const serverUrl=new URL('/mcp-read',c.req.url).toString(),model=c.env.OPENAI_MODEL_FAST||c.env.OPENAI_MODEL||'gpt-5.6-luna';
  const body=buildMcpReadResponseBody({model,message,serverUrl,bearerToken:rawToken}) as unknown as Record<string,unknown>;
  const data=await callResponses(c.env,body),evidence=extractMcpReadEvidence(data),text=extractOpenAIResponseText(data);
  if(!hasSuccessfulMcpRead(evidence))return c.json({error:'La respuesta no acreditó una lectura MCP exitosa',responseId:data.id||null,evidence},502);
  if(!text)return c.json({error:'OpenAI ejecutó el MCP pero no devolvió texto utilizable',responseId:data.id||null,evidence},502);

  const conversationId=await ensureConversation(c.env.DB,userId,parsed.data.conversationId,message),assistantMessageId=crypto.randomUUID(),actualModel=data.model||model,pricing=estimateModelCost(data.usage,actualModel);
  await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),conversationId,'user',message),
   c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(assistantMessageId,conversationId,'assistant',text),
   c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,'OpenAI','responses-mcp-read',actualModel,pricing.input,pricing.cached,pricing.output,pricing.costUsd,JSON.stringify({responseId:data.id||null,mcpEndpoint:'/mcp-read',mcpListed:evidence.listed,mcpCalls:evidence.calls.map(call=>({name:call.name,status:call.status})),pricingModel:pricing.pricingModel,pricingKnown:pricing.pricingKnown,pricingSource:pricing.pricingSource,store:false}))
  ]);
  return c.json({
   conversationId,
   message:{id:assistantMessageId,role:'assistant',content:text},
   provider:'OpenAI Responses + Héctor MCP',
   model:actualModel,
   runtime:'hector-mcp-read',
   mcp:{endpoint:'/mcp-read',readOnly:true,listed:evidence.listed,calls:evidence.calls},
   usage:data.usage||null,
   estimatedCostUsd:pricing.costUsd,
   responseId:data.id||null
  });
 }catch(error){
  return c.json({error:error instanceof Error?error.message:'Falló la consulta OpenAI → MCP read'},502);
 }finally{
  try{await c.env.DB.prepare('DELETE FROM external_access_tokens WHERE id=? AND user_id=?').bind(tokenId,userId).run();}catch{}
 }
});
