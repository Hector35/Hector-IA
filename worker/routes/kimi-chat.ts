import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack,renderContext} from '../lib/context';
import {renderBootstrap} from '../intelligence/bootstrap';
import {callCloudflare} from '../lib/providers';
import {callKimiK2_5,hasKimiEndpoint,kimiStatus} from '../lib/kimi-k2-runtime';
import {enforceResponseContract} from '../lib/response-contract';

export const kimiChat=new Hono<{Bindings:Bindings;Variables:Variables}>();
kimiChat.use('/kimi-chat',requireAuth);
kimiChat.use('/kimi-status',requireAuth);

async function ensureConversation(db:D1Database,userId:string,conversationId:string|undefined,message:string){
  if(conversationId){
    const existing=await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(conversationId,userId).first();
    if(existing)return conversationId;
  }
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(id,userId,message.slice(0,60)||'Chat Kimi K2.5').run();
  return id;
}

async function saveRollingSummary(db:D1Database,userId:string,conversationId:string){
  const rows=(await db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 12').bind(conversationId).all<any>()).results.reverse();
  const summary=rows.map((item:any)=>`${item.role==='user'?'Héctor':'Hector ASI'}: ${String(item.content).replace(/\s+/g,' ').slice(0,260)}`).join('\n').slice(0,3000);
  await db.prepare("INSERT INTO conversation_summaries(conversation_id,user_id,summary,message_count) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET summary=excluded.summary,message_count=excluded.message_count,updated_at=CURRENT_TIMESTAMP").bind(conversationId,userId,summary,rows.length).run();
}

function instructions(context:string){
  return `${renderBootstrap()}

RUNTIME OPERATIVO
- Modelo solicitado: moonshotai/Kimi-K2.5.
- Arquitectura: MoE multimodal de 1T parámetros totales y 32B activos por token.
- Contexto máximo del modelo: 256K tokens.
- Usa razonamiento, herramientas y capacidades agentivas cuando aporten valor.
- El objetivo entrenable separado es moonshotai/Kimi-K2-Base; no afirmes que K2.5 contiene pesos personalizados de Héctor.
- Responde como Hector ASI, en español salvo petición contraria.
- Distingue hechos, inferencias, acciones realizadas y límites.
- Si el runtime reporta fallback, no afirmes que respondió Kimi.

CONTEXTO DINÁMICO
${context}`;
}

kimiChat.get('/kimi-status',c=>c.json(kimiStatus(c.env)));

kimiChat.post('/kimi-chat',async c=>{
  const parsed=z.object({
    message:z.string().min(1).max(12000),
    conversationId:z.string().uuid().optional(),
    reasoning:z.enum(['auto','high']).optional(),
    deliberation:z.enum(['auto','force','off']).optional()
  }).safeParse(await c.req.json());
  if(!parsed.success)return c.json({error:'Mensaje inválido'},400);

  const message=parsed.data.message.trim();
  const userId=c.get('userId');
  const conversationId=await ensureConversation(c.env.DB,userId,parsed.data.conversationId,message);
  await c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),conversationId,'user',message).run();

  const pack=await loadContextPack(c.env,userId,conversationId,message);
  const system=instructions(renderContext(pack));
  const history=pack.recentMessages
    .filter(item=>item.role==='user'||item.role==='assistant')
    .map(item=>({role:item.role as 'user'|'assistant',content:item.content}));

  const endpointConfigured=hasKimiEndpoint(c.env);
  let out:{text:string;id:string;model:string;usage?:{input_tokens?:number;output_tokens?:number}};
  let provider='Kimi K2.5 endpoint';
  let fallback=false;
  let reason='Kimi K2.5 respondió desde el endpoint configurado';

  try{
    if(endpointConfigured){
      try{
        out=await callKimiK2_5(c.env,system,history);
      }catch(error){
        fallback=true;
        provider='Cloudflare';
        reason=`Kimi K2.5 falló y se aplicó fallback: ${error instanceof Error?error.message:'error desconocido'}`;
        out=await callCloudflare(c.env,`${system}\n\nKimi K2.5 no estuvo disponible. Responde como fallback identificado y no lo suplantes.`,message);
      }
    }else{
      fallback=true;
      provider='Cloudflare';
      reason='Kimi K2.5 está integrado, pero falta configurar KIMI_K2_BASE_URL y KIMI_K2_TOKEN';
      out=await callCloudflare(c.env,`${system}\n\nKimi K2.5 todavía no tiene endpoint conectado. Responde como fallback identificado y no lo suplantes.`,message);
    }

    const contract=enforceResponseContract(message,out.text);
    const assistantMessageId=crypto.randomUUID();
    const status=kimiStatus(c.env);
    const effectiveKimi=!fallback&&endpointConfigured;
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(assistantMessageId,conversationId,'assistant',contract.text),
      c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(
        crypto.randomUUID(),userId,provider,'kimi-k2.5-chat',out.model,Number(out.usage?.input_tokens||0),0,Number(out.usage?.output_tokens||0),0,
        JSON.stringify({runtimeId:'hector-kimi',requestedModel:status.model,trainingTarget:status.trainingTarget.repository,tier:effectiveKimi?'open-multimodal-moe-1t':'kimi-pending-fallback',reason,fallback,endpointConfigured,contractApplied:contract.applied,contractReasons:contract.reasons})
      )
    ]);
    await saveRollingSummary(c.env.DB,userId,conversationId);
    return c.json({
      conversationId,
      message:{id:assistantMessageId,role:'assistant',content:contract.text},
      provider,
      model:out.model,
      requestedModel:status.model,
      trainingTarget:status.trainingTarget,
      runtimeId:'hector-kimi',
      runtime:status,
      fallback,
      fallbackReason:fallback?reason:undefined,
      modelTier:effectiveKimi?'open-multimodal-moe-1t':'kimi-pending-fallback',
      usage:out.usage,
      contract:{applied:contract.applied,reasons:contract.reasons}
    });
  }catch(error){
    return c.json({error:error instanceof Error?error.message:'Kimi K2.5 no respondió',runtime:kimiStatus(c.env)},502);
  }
});
