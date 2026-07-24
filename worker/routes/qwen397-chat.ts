import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack,renderContext} from '../lib/context';
import {renderBootstrap} from '../intelligence/bootstrap';
import {callCloudflare} from '../lib/providers';
import {callKimiK2_5,hasKimiEndpoint,kimiStatus} from '../lib/kimi-k2-runtime';
import {callQwen397,hasQwen397Endpoint,qwen397Status} from '../lib/qwen397-runtime';
import {enforceResponseContract} from '../lib/response-contract';

export const qwen397Chat=new Hono<{Bindings:Bindings;Variables:Variables}>();
qwen397Chat.use('/qwen397-chat',requireAuth);
qwen397Chat.use('/qwen397-status',requireAuth);

type RoutedOutput={text:string;id:string;model:string;usage?:{input_tokens?:number;output_tokens?:number}};
type FallbackResult={out:RoutedOutput;provider:string;fallbackLevel:1|2;reason:string};

async function ensureConversation(db:D1Database,userId:string,conversationId:string|undefined,message:string){
  if(conversationId){
    const existing=await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(conversationId,userId).first();
    if(existing)return conversationId;
  }
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(id,userId,message.slice(0,60)||'Chat Qwen 397B').run();
  return id;
}

async function saveRollingSummary(db:D1Database,userId:string,conversationId:string){
  const rows=(await db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 12').bind(conversationId).all<any>()).results.reverse();
  const summary=rows.map((item:any)=>`${item.role==='user'?'Héctor':'Hector ASI'}: ${String(item.content).replace(/\s+/g,' ').slice(0,260)}`).join('\n').slice(0,3000);
  await db.prepare("INSERT INTO conversation_summaries(conversation_id,user_id,summary,message_count) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET summary=excluded.summary,message_count=excluded.message_count,updated_at=CURRENT_TIMESTAMP").bind(conversationId,userId,summary,rows.length).run();
}

function instructions(context:string){
  return `${renderBootstrap()}

RUNTIME PRINCIPAL
- Modelo solicitado: Qwen/Qwen3.5-397B-A17B.
- Arquitectura: MoE multimodal de 397B parámetros totales y 17B activos por token.
- Contexto nativo: 262,144 tokens; el modelo admite ampliación bajo infraestructura compatible.
- Thinking está habilitado por defecto en Qwen3.5.
- Este modelo tiene pesos abiertos Apache 2.0 y es también el objetivo neuronal grande de Héctor.
- No afirmes que contiene pesos personalizados de Héctor hasta que un checkpoint adaptado supere el benchmark y sea promovido.
- Responde como Hector ASI, en español salvo petición contraria.
- Distingue hechos, inferencias, acciones realizadas y límites.
- Si el runtime reporta fallback, identifica el modelo efectivo y no afirmes que respondió Qwen.

CONTEXTO DINÁMICO
${context}`;
}

async function fallbackAfterQwen(env:Bindings,system:string,history:Array<{role:'user'|'assistant';content:string}>,message:string,baseReason:string):Promise<FallbackResult>{
  if(hasKimiEndpoint(env)){
    try{
      const out=await callKimiK2_5(env,`${system}\n\nQwen 397B no estuvo disponible. Responde como fallback Kimi identificado.`,history);
      return{out,provider:'Kimi K2.5 endpoint',fallbackLevel:1,reason:`${baseReason}; se usó Kimi K2.5`};
    }catch(error){
      const kimiError=error instanceof Error?error.message:'error desconocido';
      const out=await callCloudflare(env,`${system}\n\nQwen 397B y Kimi K2.5 no estuvieron disponibles. Responde como fallback Workers AI identificado.`,message);
      return{out,provider:'Cloudflare',fallbackLevel:2,reason:`${baseReason}; Kimi K2.5 falló: ${kimiError}; se usó Workers AI`};
    }
  }
  const out=await callCloudflare(env,`${system}\n\nQwen 397B no estuvo disponible y Kimi K2.5 no está configurado. Responde como fallback Workers AI identificado.`,message);
  return{out,provider:'Cloudflare',fallbackLevel:2,reason:`${baseReason}; Kimi K2.5 no está configurado; se usó Workers AI`};
}

qwen397Chat.get('/qwen397-status',c=>c.json(qwen397Status(c.env)));

qwen397Chat.post('/qwen397-chat',async c=>{
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

  const qwenConfigured=hasQwen397Endpoint(c.env);
  const kimiConfigured=hasKimiEndpoint(c.env);
  let out:RoutedOutput;
  let provider='Qwen 397B endpoint';
  let fallback=false;
  let reason='Qwen3.5-397B-A17B respondió desde el endpoint configurado';
  let fallbackLevel:0|1|2=0;

  try{
    if(qwenConfigured){
      try{
        out=await callQwen397(c.env,system,history);
      }catch(error){
        const qwenError=error instanceof Error?error.message:'error desconocido';
        const routed=await fallbackAfterQwen(c.env,system,history,message,`Qwen 397B falló: ${qwenError}`);
        out=routed.out;provider=routed.provider;fallback=true;fallbackLevel=routed.fallbackLevel;reason=routed.reason;
      }
    }else{
      const routed=await fallbackAfterQwen(c.env,system,history,message,'Qwen 397B no tiene endpoint y secreto configurados');
      out=routed.out;provider=routed.provider;fallback=true;fallbackLevel=routed.fallbackLevel;reason=routed.reason;
    }

    const contract=enforceResponseContract(message,out.text);
    const assistantMessageId=crypto.randomUUID();
    const status=qwen397Status(c.env);
    const effectiveQwen=!fallback&&qwenConfigured;
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(assistantMessageId,conversationId,'assistant',contract.text),
      c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(
        crypto.randomUUID(),userId,provider,'qwen3.5-397b-chat',out.model,Number(out.usage?.input_tokens||0),0,Number(out.usage?.output_tokens||0),0,
        JSON.stringify({runtimeId:'hector-qwen397',requestedModel:status.model,trainingTarget:status.repository,tier:effectiveQwen?'open-multimodal-moe-397b':'qwen397-fallback',reason,fallback,fallbackLevel,qwenConfigured,kimiConfigured,kimiModel:kimiStatus(c.env).model,contractApplied:contract.applied,contractReasons:contract.reasons})
      )
    ]);
    await saveRollingSummary(c.env.DB,userId,conversationId);
    return c.json({
      conversationId,
      message:{id:assistantMessageId,role:'assistant',content:contract.text},
      provider,
      model:out.model,
      requestedModel:status.model,
      trainingTarget:status,
      runtimeId:'hector-qwen397',
      runtime:status,
      fallback,
      fallbackLevel,
      fallbackReason:fallback?reason:undefined,
      modelTier:effectiveQwen?'open-multimodal-moe-397b':'qwen397-fallback',
      usage:out.usage,
      contract:{applied:contract.applied,reasons:contract.reasons}
    });
  }catch(error){
    return c.json({error:error instanceof Error?error.message:'Qwen 397B no respondió',runtime:qwen397Status(c.env)},502);
  }
});
