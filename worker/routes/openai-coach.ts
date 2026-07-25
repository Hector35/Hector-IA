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

type StoredTurn={id:string;role:'user'|'assistant';content:string;created_at:string};

type OpenAITurn={role:'developer'|'user'|'assistant';content:string};

const reviewInput=z.object({
  conversationId:z.string().uuid(),
  messageId:z.string().uuid().optional(),
  feedback:z.string().min(1).max(6000),
  scope:z.enum(['message','conversation']).default('message'),
  applyCorrection:z.boolean().default(true)
});

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
  const columns=(await db.prepare('PRAGMA table_info(training_feedback)').all<any>()).results;
  const existing=new Set(columns.map((column:any)=>String(column.name)));
  const additions=[
    ['review_scope',"TEXT NOT NULL DEFAULT 'message'"],
    ['source_context_json','TEXT'],
    ['corrected_message_id','TEXT'],
    ['user_accepted','INTEGER NOT NULL DEFAULT 0'],
    ['decided_at','TEXT']
  ] as const;
  for(const [name,type] of additions){
    if(!existing.has(name))await db.prepare(`ALTER TABLE training_feedback ADD COLUMN ${name} ${type}`).run();
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_training_feedback_user_created ON training_feedback(user_id,created_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_training_feedback_status ON training_feedback(status,created_at DESC)').run();
}

function outputText(data:any){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const chunks=(data?.output||[])
    .flatMap((item:any)=>item?.content||[])
    .filter((part:any)=>part?.type==='output_text'&&typeof part?.text==='string')
    .map((part:any)=>part.text);
  return chunks.join('\n').trim();
}

async function callOpenAI(env:Bindings,input:OpenAITurn[],structured:boolean){
  const key=env.OPENAI_API_KEY?.trim();
  if(!key)throw new Error('Falta configurar OPENAI_API_KEY en el Worker');
  const model=env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL||'gpt-5';
  const body:any={model,store:false,input,max_output_tokens:structured?2400:1800};
  if(structured){
    body.text={format:{
      type:'json_schema',
      name:'hector_feedback_review',
      description:'Diagnóstico y corrección de una respuesta de Héctor OS para aprendizaje supervisado.',
      strict:true,
      schema:{
        type:'object',
        additionalProperties:false,
        required:['diagnosis','missing','correctedResponse','trainingTags','confidence'],
        properties:{
          diagnosis:{type:'string'},
          missing:{type:'array',items:{type:'string'}},
          correctedResponse:{type:'string'},
          trainingTags:{type:'array',items:{type:'string'}},
          confidence:{type:'number',minimum:0,maximum:1}
        }
      }
    }};
  }
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const data=await response.json<any>();
  if(!response.ok)throw new Error(data?.error?.message||`OpenAI respondió ${response.status}`);
  const text=outputText(data);
  if(!text)throw new Error('OpenAI devolvió una respuesta vacía');
  return{text,model:data?.model||model,responseId:data?.id||null,usage:data?.usage||null};
}

async function ownedConversation(db:D1Database,userId:string,conversationId:string){
  return db.prepare('SELECT id,title FROM conversations WHERE id=? AND user_id=? AND COALESCE(is_internal,0)=0').bind(conversationId,userId).first<any>();
}

async function loadTurns(db:D1Database,conversationId:string,limit=40){
  const rows=(await db.prepare("SELECT id,role,content,created_at FROM messages WHERE conversation_id=? AND role IN ('user','assistant') ORDER BY created_at DESC LIMIT ?").bind(conversationId,limit).all<StoredTurn>()).results.reverse();
  let used=0;
  const kept:StoredTurn[]=[];
  for(let index=rows.length-1;index>=0;index--){
    const row=rows[index];
    const content=String(row.content||'').slice(0,12000);
    if(used+content.length>30000&&kept.length)break;
    used+=content.length;
    kept.unshift({...row,content});
  }
  return kept;
}

function sourceAround(turns:StoredTurn[],assistant:StoredTurn){
  const index=turns.findIndex(turn=>turn.id===assistant.id);
  const userPrompt=[...turns.slice(0,Math.max(0,index))].reverse().find(turn=>turn.role==='user');
  return{userPrompt:userPrompt?.content||'(no disponible)',assistantResponse:assistant.content};
}

function renderTranscript(turns:StoredTurn[]){
  return turns.map(turn=>`${turn.role==='user'?'USUARIO':'HÉCTOR'} [${turn.id}]\n${turn.content}`).join('\n\n');
}

async function recordUsage(env:Bindings,userId:string,service:string,out:any,metadata:any){
  await env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(
      crypto.randomUUID(),userId,'OpenAI',service,out.model,
      Number(out.usage?.input_tokens||0),
      Number(out.usage?.input_tokens_details?.cached_tokens||0),
      Number(out.usage?.output_tokens||0),0,
      JSON.stringify({responseId:out.responseId,explicitUserAction:true,store:false,...metadata})
    ).run();
}

openaiCoach.get('/openai-coach/status',c=>c.json({
  configured:Boolean(c.env.OPENAI_API_KEY?.trim()),
  model:c.env.OPENAI_MODEL_REASONING||c.env.OPENAI_MODEL||'gpt-5',
  mode:'explicit-only',
  storesAtOpenAI:false,
  supports:['direct-chat','message-review','conversation-review','human-approval']
}));

openaiCoach.post('/openai-coach/chat',async c=>{
  const parsed=z.object({
    message:z.string().min(1).max(12000),
    conversationId:z.string().uuid().optional(),
    includeConversation:z.boolean().default(true)
  }).safeParse(await c.req.json());
  if(!parsed.success)return c.json({error:'Mensaje inválido'},400);
  const userId=c.get('userId');
  let conversationId=parsed.data.conversationId;
  let history:StoredTurn[]=[];
  if(conversationId){
    const conversation=await ownedConversation(c.env.DB,userId,conversationId);
    if(!conversation)return c.json({error:'Conversación no encontrada'},404);
    if(parsed.data.includeConversation)history=await loadTurns(c.env.DB,conversationId,24);
  }
  try{
    const input:OpenAITurn[]=[{
      role:'developer',
      content:'Eres el maestro externo de Héctor OS. Conversa directamente con el usuario en español. Usa el contexto adjunto cuando exista, corrige errores con claridad y separa hechos, inferencias y límites cuando corresponda. No afirmes que los pesos fueron entrenados por esta conversación.'
    }];
    input.push(...history.map(turn=>({role:turn.role,content:turn.content}) as OpenAITurn));
    input.push({role:'user',content:parsed.data.message});
    const out=await callOpenAI(c.env,input,false);
    if(!conversationId){
      conversationId=crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(conversationId,userId,`OpenAI · ${parsed.data.message.slice(0,48)}`).run();
    }
    const userMessageId=crypto.randomUUID(),assistantMessageId=crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(userMessageId,conversationId,'user',parsed.data.message),
      c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(assistantMessageId,conversationId,'assistant',out.text),
      c.env.DB.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(conversationId)
    ]);
    await recordUsage(c.env,userId,'openai-coach-chat',out,{conversationId,includeConversation:parsed.data.includeConversation,historyTurns:history.length,userMessageId,assistantMessageId});
    return c.json({
      conversationId,
      userMessage:{id:userMessageId,role:'user',content:parsed.data.message},
      message:{id:assistantMessageId,role:'assistant',content:out.text},
      provider:'OpenAI',model:out.model,fallback:false,modelTier:'external-teacher',
      continuity:{included:parsed.data.includeConversation,turns:history.length}
    });
  }catch(error){return c.json({error:error instanceof Error?error.message:'OpenAI no respondió'},502);}
});

openaiCoach.post('/openai-coach/review',async c=>{
  const parsed=reviewInput.safeParse(await c.req.json());
  if(!parsed.success)return c.json({error:'Retroalimentación inválida',details:parsed.error.flatten()},400);
  const userId=c.get('userId');
  const conversation=await ownedConversation(c.env.DB,userId,parsed.data.conversationId);
  if(!conversation)return c.json({error:'Conversación no encontrada'},404);
  const turns=await loadTurns(c.env.DB,parsed.data.conversationId,50);
  const assistants=turns.filter(turn=>turn.role==='assistant');
  const assistant=parsed.data.messageId
    ?assistants.find(turn=>turn.id===parsed.data.messageId)
    :assistants.at(-1);
  if(!assistant)return c.json({error:'No hay una respuesta de Héctor para revisar'},404);
  const source=sourceAround(turns,assistant);
  const scopeContext=parsed.data.scope==='conversation'
    ?`CHAT COMPLETO A REVISAR\n${renderTranscript(turns)}`
    :`PREGUNTA ORIGINAL\n${source.userPrompt}\n\nRESPUESTA SELECCIONADA DE HÉCTOR [${assistant.id}]\n${source.assistantResponse}`;
  try{
    const out=await callOpenAI(c.env,[
      {
        role:'developer',
        content:'Actúa como crítico y maestro de datos para Héctor OS. Evalúa exactamente el alcance solicitado frente a la observación del usuario. Conserva lo correcto, identifica omisiones concretas y entrega una respuesta corregida completa para la pregunta asociada a la respuesta seleccionada. Las etiquetas deben describir capacidades entrenables, no temas superficiales. No inventes hechos ausentes; declara límites.'
      },
      {role:'user',content:`ALCANCE: ${parsed.data.scope==='conversation'?'CHAT COMPLETO':'MENSAJE ESPECÍFICO'}\n\n${scopeContext}\n\nRETROALIMENTACIÓN DEL USUARIO\n${parsed.data.feedback}`}
    ],true);
    const review=JSON.parse(out.text) as CoachResult;
    await ensureSchema(c.env.DB);
    const id=crypto.randomUUID();
    const correctedMessageId=parsed.data.applyCorrection?crypto.randomUUID():null;
    const statements=[
      c.env.DB.prepare(`INSERT INTO training_feedback(
        id,user_id,conversation_id,message_id,user_prompt,assistant_response,user_feedback,critique,corrected_response,
        training_tags_json,teacher_model,status,review_scope,source_context_json,corrected_message_id,user_accepted
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id,userId,parsed.data.conversationId,assistant.id,source.userPrompt,assistant.content,parsed.data.feedback,
        review.diagnosis,review.correctedResponse,JSON.stringify(review.trainingTags||[]),out.model,'candidate',parsed.data.scope,
        JSON.stringify({turnIds:turns.map(turn=>turn.id),turnCount:turns.length,scope:parsed.data.scope}),correctedMessageId,0
      ),
      c.env.DB.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(parsed.data.conversationId)
    ];
    if(correctedMessageId){
      statements.splice(1,0,c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(correctedMessageId,parsed.data.conversationId,'assistant',review.correctedResponse));
    }
    await c.env.DB.batch(statements);
    await recordUsage(c.env,userId,'openai-feedback-review',out,{
      trainingFeedbackId:id,conversationId:parsed.data.conversationId,messageId:assistant.id,
      correctedMessageId,scope:parsed.data.scope,turnCount:turns.length,applyCorrection:parsed.data.applyCorrection
    });
    return c.json({
      id,conversationId:parsed.data.conversationId,messageId:assistant.id,correctedMessageId,review,
      correctedMessage:correctedMessageId?{id:correctedMessageId,role:'assistant',content:review.correctedResponse,provider:'OpenAI',model:out.model,fallback:false,modelTier:'external-teacher-correction'}:null,
      provider:'OpenAI',model:out.model,status:'candidate',scope:parsed.data.scope,
      note:'La corrección ya quedó aplicada al chat. El ejemplo seguirá como candidato hasta que el usuario lo apruebe y los ciclos lo validen.'
    });
  }catch(error){return c.json({error:error instanceof Error?error.message:'No se pudo revisar la respuesta'},502);}
});

openaiCoach.post('/openai-coach/feedback/:id/decision',async c=>{
  const parsed=z.object({decision:z.enum(['approve','reject'])}).safeParse(await c.req.json());
  if(!parsed.success)return c.json({error:'Decisión inválida'},400);
  await ensureSchema(c.env.DB);
  const status=parsed.data.decision==='approve'?'human_approved':'rejected';
  const accepted=parsed.data.decision==='approve'?1:0;
  const result=await c.env.DB.prepare("UPDATE training_feedback SET status=?,user_accepted=?,decided_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status IN ('candidate','human_approved','rejected')")
    .bind(status,accepted,c.req.param('id'),c.get('userId')).run();
  if(!result.meta.changes)return c.json({error:'Ejemplo no encontrado'},404);
  return c.json({id:c.req.param('id'),status,userAccepted:Boolean(accepted)});
});

openaiCoach.get('/openai-coach/feedback',async c=>{
  await ensureSchema(c.env.DB);
  const rows=await c.env.DB.prepare(`SELECT
    id,conversation_id,message_id,user_prompt,assistant_response,user_feedback,critique,corrected_response,
    training_tags_json,teacher_model,status,review_scope,corrected_message_id,user_accepted,decided_at,created_at
    FROM training_feedback WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).bind(c.get('userId')).all<any>();
  return c.json({items:rows.results.map((row:any)=>({...row,trainingTags:JSON.parse(row.training_tags_json||'[]'),userAccepted:Boolean(row.user_accepted)}))});
});
