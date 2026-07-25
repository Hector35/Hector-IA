import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';

export const openaiCoach=new Hono<{Bindings:Bindings;Variables:Variables}>();
openaiCoach.use('/openai-coach/*',requireAuth);

type CoachResult={
  diagnosis:string;
  missing:string[];
  correctedResponse:string;
  trainingTags:string[];
  confidence:number;
};

async function ensureSchema(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS training_feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    conversation_id TEXT,
    message_id TEXT,
    user_prompt TEXT,
    assistant_response TEXT,
    user_feedback TEXT NOT NULL,
    critique TEXT,
    corrected_response TEXT,
    training_tags_json TEXT NOT NULL DEFAULT '[]',
    teacher_model TEXT,
    status TEXT NOT NULL DEFAULT 'candidate',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_training_feedback_user_created ON training_feedback(user_id,created_at DESC)').run();
}

function outputText(data:any){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const chunks=(data?.output||[]).flatMap((item:any)=>item?.content||[]).filter((part:any)=>part?.type==='output_text'&&typeof part?.text==='string').map((part:any)=>part.text);
  return chunks.join('\n').trim();
}

async function callOpenAI(env:Bindings,input:any[],structured:boolean){
  const key=env.OPENAI_API_KEY?.trim();
  if(!key)throw new Error('Falta configurar OPENAI_API_KEY en el Worker');
  const model=env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL||'gpt-5';
  const body:any={model,store:false,input};
  if(structured){
    body.text={format:{type:'json_schema',name:'hector_feedback_review',strict:true,schema:{type:'object',additionalProperties:false,required:['diagnosis','missing','correctedResponse','trainingTags','confidence'],properties:{diagnosis:{type:'string'},missing:{type:'array',items:{type:'string'}},correctedResponse:{type:'string'},trainingTags:{type:'array',items:{type:'string'}},confidence:{type:'number',minimum:0,maximum:1}}}}};
  }
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json<any>();
  if(!response.ok)throw new Error(data?.error?.message||`OpenAI respondió ${response.status}`);
  const text=outputText(data);
  if(!text)throw new Error('OpenAI devolvió una respuesta vacía');
  return{text,model:data?.model||model,responseId:data?.id||null,usage:data?.usage||null};
}

openaiCoach.get('/openai-coach/status',c=>c.json({configured:Boolean(c.env.OPENAI_API_KEY?.trim()),model:c.env.OPENAI_MODEL_REASONING||c.env.OPENAI_MODEL||'gpt-5',mode:'explicit-only',storesAtOpenAI:false}));

openaiCoach.post('/openai-coach/chat',async c=>{
  const parsed=z.object({message:z.string().min(1).max(12000),conversationId:z.string().uuid().optional()}).safeParse(await c.req.json());
  if(!parsed.success)return c.json({error:'Mensaje inválido'},400);
  try{
    const out=await callOpenAI(c.env,[{role:'developer',content:'Eres el maestro externo de Héctor OS. Responde directamente al usuario en español, separa hechos, inferencias y límites cuando corresponda. No afirmes que entrenaste pesos por conversar.'},{role:'user',content:parsed.data.message}],false);
    await c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),c.get('userId'),'OpenAI','openai-coach-chat',out.model,Number(out.usage?.input_tokens||0),Number(out.usage?.input_tokens_details?.cached_tokens||0),Number(out.usage?.output_tokens||0),0,JSON.stringify({responseId:out.responseId,explicitUserAction:true,store:false,conversationId:parsed.data.conversationId||null})).run();
    return c.json({message:{id:out.responseId||crypto.randomUUID(),role:'assistant',content:out.text},provider:'OpenAI',model:out.model,fallback:false,modelTier:'external-teacher',conversationId:parsed.data.conversationId});
  }catch(error){return c.json({error:error instanceof Error?error.message:'OpenAI no respondió'},502);}
});

openaiCoach.post('/openai-coach/review',async c=>{
  const parsed=z.object({conversationId:z.string().uuid(),messageId:z.string().optional(),feedback:z.string().min(1).max(6000)}).safeParse(await c.req.json());
  if(!parsed.success)return c.json({error:'Retroalimentación inválida'},400);
  const userId=c.get('userId');
  const conversation=await c.env.DB.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(parsed.data.conversationId,userId).first();
  if(!conversation)return c.json({error:'Conversación no encontrada'},404);
  const assistant=parsed.data.messageId
    ?await c.env.DB.prepare("SELECT id,content,created_at FROM messages WHERE id=? AND conversation_id=? AND role='assistant'").bind(parsed.data.messageId,parsed.data.conversationId).first<any>()
    :await c.env.DB.prepare("SELECT id,content,created_at FROM messages WHERE conversation_id=? AND role='assistant' ORDER BY created_at DESC LIMIT 1").bind(parsed.data.conversationId).first<any>();
  if(!assistant)return c.json({error:'No hay una respuesta de Héctor para revisar'},404);
  const userPrompt=await c.env.DB.prepare("SELECT content FROM messages WHERE conversation_id=? AND role='user' AND created_at<=? ORDER BY created_at DESC LIMIT 1").bind(parsed.data.conversationId,assistant.created_at).first<any>();
  try{
    const out=await callOpenAI(c.env,[{role:'developer',content:'Actúa como crítico y maestro de datos para Héctor OS. Evalúa la respuesta frente a la observación del usuario. Conserva lo correcto, identifica omisiones concretas y entrega una versión corregida completa. Las etiquetas deben describir capacidades entrenables, no temas superficiales.'},{role:'user',content:`PREGUNTA ORIGINAL\n${userPrompt?.content||'(no disponible)'}\n\nRESPUESTA DE HÉCTOR\n${assistant.content}\n\nRETROALIMENTACIÓN DEL USUARIO\n${parsed.data.feedback}`}],true);
    const review=JSON.parse(out.text) as CoachResult;
    await ensureSchema(c.env.DB);
    const id=crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO training_feedback(id,user_id,conversation_id,message_id,user_prompt,assistant_response,user_feedback,critique,corrected_response,training_tags_json,teacher_model,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,userId,parsed.data.conversationId,assistant.id,userPrompt?.content||null,assistant.content,parsed.data.feedback,review.diagnosis,review.correctedResponse,JSON.stringify(review.trainingTags||[]),out.model,'candidate'),
      c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,'OpenAI','openai-feedback-review',out.model,Number(out.usage?.input_tokens||0),Number(out.usage?.input_tokens_details?.cached_tokens||0),Number(out.usage?.output_tokens||0),0,JSON.stringify({responseId:out.responseId,explicitUserAction:true,store:false,trainingFeedbackId:id,conversationId:parsed.data.conversationId,messageId:assistant.id}))
    ]);
    return c.json({id,conversationId:parsed.data.conversationId,messageId:assistant.id,review,provider:'OpenAI',model:out.model,status:'candidate',note:'Corrección disponible de inmediato; el ejemplo aún debe pasar validación antes de entrar a entrenamiento.'});
  }catch(error){return c.json({error:error instanceof Error?error.message:'No se pudo revisar la respuesta'},502);}
});

openaiCoach.get('/openai-coach/feedback',async c=>{
  await ensureSchema(c.env.DB);
  const rows=await c.env.DB.prepare('SELECT id,conversation_id,message_id,user_prompt,assistant_response,user_feedback,critique,corrected_response,training_tags_json,teacher_model,status,created_at FROM training_feedback WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('userId')).all<any>();
  return c.json({items:rows.results.map((row:any)=>({...row,trainingTags:JSON.parse(row.training_tags_json||'[]')}))});
});
