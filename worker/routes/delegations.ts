import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack,renderContext} from '../lib/context';
import {respondContextual} from '../lib/openai';

export const delegations=new Hono<{Bindings:Bindings;Variables:Variables}>();
delegations.use('*',requireAuth);

const createSchema=z.object({
  sourceConversationId:z.string().uuid(),
  target:z.string().min(1).max(120),
  instruction:z.string().min(8).max(12000),
  maxIterations:z.number().int().min(1).max(12).default(3),
  stopOnSuccess:z.boolean().default(true)
});

function normalize(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function score(query:string,title:string){const q=new Set(normalize(query).split(' ').filter(Boolean)),t=normalize(title);let points=t===normalize(query)?100:t.includes(normalize(query))?50:0;for(const token of q)if(t.includes(token))points+=8;return points;}

export async function resolveConversation(env:Bindings,userId:string,target:string){
  const alias=await env.DB.prepare('SELECT c.id,c.title,a.alias FROM conversation_aliases a JOIN conversations c ON c.id=a.conversation_id WHERE a.user_id=? AND lower(a.alias)=lower(?) LIMIT 1').bind(userId,target.trim()).first<any>();
  if(alias)return alias;
  const rows=(await env.DB.prepare('SELECT id,title,updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 60').bind(userId).all<any>()).results||[];
  const ranked=rows.map((x:any)=>({...x,matchScore:score(target,x.title||'')})).filter((x:any)=>x.matchScore>0).sort((a:any,b:any)=>b.matchScore-a.matchScore);
  if(!ranked.length)return null;
  if(ranked.length>1&&ranked[0].matchScore===ranked[1].matchScore)return{ambiguous:true,candidates:ranked.slice(0,5)};
  return ranked[0];
}

async function appendMessage(env:Bindings,conversationId:string,role:'user'|'assistant',content:string){
  await env.DB.batch([
    env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),conversationId,role,content),
    env.DB.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(conversationId)
  ]);
}
async function appendTurn(env:Bindings,delegationId:string,iteration:number,actor:string,action:string,content:string,metadata:Record<string,unknown>={}){
  await env.DB.prepare('INSERT INTO conversation_delegation_turns(id,delegation_id,iteration,actor,action,content,metadata_json) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),delegationId,iteration,actor,action,content,JSON.stringify(metadata)).run();
}

export async function createDelegation(env:Bindings,input:{userId:string;sourceConversationId:string;target:string;instruction:string;maxIterations:number;stopOnSuccess:boolean}){
  const source=await env.DB.prepare('SELECT id,title FROM conversations WHERE id=? AND user_id=?').bind(input.sourceConversationId,input.userId).first<any>();
  if(!source)throw new Error('Conversación de origen no encontrada');
  const target=await resolveConversation(env,input.userId,input.target) as any;
  if(!target)throw new Error('No encontré una conversación con ese nombre o alias');
  if(target.ambiguous)return{ambiguous:true,candidates:target.candidates};
  if(target.id===source.id)throw new Error('La conversación destino debe ser diferente');
  const id=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO conversation_delegations(id,user_id,source_conversation_id,target_conversation_id,target_label,objective,current_instruction,status,max_iterations,stop_on_success) VALUES(?,?,?,?,?,?,?,'queued',?,?)").bind(id,input.userId,source.id,target.id,target.alias||target.title,input.instruction,input.instruction,input.maxIterations,+input.stopOnSuccess),
    env.DB.prepare('INSERT INTO conversation_delegation_turns(id,delegation_id,iteration,actor,action,content) VALUES(?,?,0,?,?,?)').bind(crypto.randomUUID(),id,'source','delegate',input.instruction)
  ]);
  await appendMessage(env,source.id,'assistant',`Delegación creada hacia **${target.alias||target.title}**. Máximo ${input.maxIterations} iteraciones. El informe regresará automáticamente a esta conversación.`);
  return{id,status:'queued',target:{id:target.id,title:target.title,alias:target.alias||null},maxIterations:input.maxIterations};
}

function parseReview(text:string){
  const candidate=text.match(/\{[\s\S]*\}/)?.[0];
  if(candidate){try{const data=JSON.parse(candidate);if(['complete','repair','continue','stop'].includes(data.decision))return data;}catch{} }
  const lower=text.toLowerCase();
  return{decision:/completad|aprobad|terminad/.test(lower)?'complete':/corrig|fall|error/.test(lower)?'repair':'continue',reason:text.slice(0,1200),nextInstruction:''};
}

export async function processNextDelegation(env:Bindings){
  const row=await env.DB.prepare("SELECT * FROM conversation_delegations WHERE status IN ('queued','running') ORDER BY updated_at ASC LIMIT 1").first<any>();
  if(!row)return;
  const iteration=Number(row.current_iteration)+1;
  if(iteration>Number(row.max_iterations)){
    await env.DB.prepare("UPDATE conversation_delegations SET status='max_iterations',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();return;
  }
  await env.DB.prepare("UPDATE conversation_delegations SET status='running',current_iteration=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(iteration,row.id).run();
  try{
    const targetPack=await loadContextPack(env,row.user_id,row.target_conversation_id,row.current_instruction);
    const targetPrompt=[
      'TAREA DELEGADA DESDE OTRA CONVERSACIÓN DE HÉCTOR OS',
      `Iteración ${iteration}/${row.max_iterations}`,
      `Objetivo original: ${row.objective}`,
      `Orden actual: ${row.current_instruction}`,
      'Ejecuta o analiza la tarea usando el contexto de esta conversación. Devuelve un informe verificable con: estado, trabajo realizado, evidencia, pruebas, errores, riesgos y siguiente paso. No declares éxito sin evidencia.'
    ].join('\n\n');
    await appendMessage(env,row.target_conversation_id,'user',targetPrompt);
    const report=await respondContextual(env,targetPrompt,targetPack.recentMessages,renderContext(targetPack),true);
    await appendMessage(env,row.target_conversation_id,'assistant',report.text);
    await appendTurn(env,row.id,iteration,'target','report',report.text,{model:report.model,provider:report.provider});

    const sourcePack=await loadContextPack(env,row.user_id,row.source_conversation_id,report.text);
    const reviewPrompt=[
      'ERES EL SUPERVISOR DE UNA DELEGACIÓN ENTRE CONVERSACIONES.',
      `Objetivo original: ${row.objective}`,
      `Iteración ${iteration}/${row.max_iterations}`,
      `Informe del chat destino:\n${report.text}`,
      'Evalúa el informe contra el objetivo. Responde JSON puro con este formato:',
      '{"decision":"complete|repair|continue|stop","reason":"motivo verificable","nextInstruction":"orden concreta para la siguiente iteración","missingEvidence":["..."]}',
      'Usa complete solo cuando el objetivo esté satisfecho con evidencia. Usa repair si hay fallos. Usa continue si falta una fase distinta.'
    ].join('\n\n');
    await appendMessage(env,row.source_conversation_id,'user',`Informe automático recibido desde **${row.target_label}**:\n\n${report.text}`);
    const reviewOut=await respondContextual(env,reviewPrompt,sourcePack.recentMessages,renderContext(sourcePack),false);
    const review=parseReview(reviewOut.text);
    await appendMessage(env,row.source_conversation_id,'assistant',reviewOut.text);
    await appendTurn(env,row.id,iteration,'source','review',reviewOut.text,{decision:review.decision,model:reviewOut.model});

    const done=review.decision==='complete'||review.decision==='stop'||iteration>=Number(row.max_iterations);
    const nextInstruction=String(review.nextInstruction||'').trim()||`Revisa el informe anterior, corrige cualquier carencia señalada por el supervisor y entrega nueva evidencia. Motivo: ${String(review.reason||'').slice(0,1200)}`;
    await env.DB.prepare('UPDATE conversation_delegations SET status=?,current_instruction=?,last_report=?,last_review=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(done?(review.decision==='complete'?'completed':review.decision==='stop'?'stopped':'max_iterations'):'queued',nextInstruction,report.text,reviewOut.text,row.id).run();
  }catch(error){
    const message=error instanceof Error?error.message:'Error desconocido';
    await env.DB.prepare("UPDATE conversation_delegations SET status='blocked',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(message,row.id).run();
    await appendTurn(env,row.id,iteration,'system','error',message);
    await appendMessage(env,row.source_conversation_id,'assistant',`La delegación hacia **${row.target_label}** quedó bloqueada: ${message}`);
  }
}

delegations.get('/',async c=>c.json({items:(await c.env.DB.prepare(`SELECT d.*,s.title source_title,t.title target_title,a.alias target_alias FROM conversation_delegations d JOIN conversations s ON s.id=d.source_conversation_id JOIN conversations t ON t.id=d.target_conversation_id LEFT JOIN conversation_aliases a ON a.user_id=d.user_id AND a.conversation_id=d.target_conversation_id WHERE d.user_id=? ORDER BY d.created_at DESC LIMIT 100`).bind(c.get('userId')).all()).results}));
delegations.get('/:id',async c=>{const uid=c.get('userId'),id=c.req.param('id');const item=await c.env.DB.prepare('SELECT * FROM conversation_delegations WHERE id=? AND user_id=?').bind(id,uid).first();if(!item)return c.json({error:'Delegación no encontrada'},404);const turns=(await c.env.DB.prepare('SELECT iteration,actor,action,content,metadata_json,created_at FROM conversation_delegation_turns WHERE delegation_id=? ORDER BY iteration,created_at').bind(id).all()).results;return c.json({item,turns});});
delegations.post('/',async c=>{const parsed=createSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Delegación inválida',details:parsed.error.flatten()},400);try{const result=await createDelegation(c.env,{userId:c.get('userId'),...parsed.data});return c.json(result,result.ambiguous?409:201);}catch(error){return c.json({error:error instanceof Error?error.message:'No se pudo crear la delegación'},400);}});
delegations.post('/:id/pause',async c=>{await c.env.DB.prepare("UPDATE conversation_delegations SET status='paused',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(c.req.param('id'),c.get('userId')).run();return c.json({ok:true});});
delegations.post('/:id/resume',async c=>{await c.env.DB.prepare("UPDATE conversation_delegations SET status='queued',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status IN ('paused','blocked','max_iterations')").bind(c.req.param('id'),c.get('userId')).run();return c.json({ok:true});});
delegations.put('/aliases/:conversationId',async c=>{const parsed=z.object({alias:z.string().min(1).max(50)}).safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Alias inválido'},400);const uid=c.get('userId'),cid=c.req.param('conversationId');const exists=await c.env.DB.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(cid,uid).first();if(!exists)return c.json({error:'Conversación no encontrada'},404);await c.env.DB.prepare("INSERT INTO conversation_aliases(id,user_id,conversation_id,alias) VALUES(?,?,?,?) ON CONFLICT(user_id,conversation_id) DO UPDATE SET alias=excluded.alias,updated_at=CURRENT_TIMESTAMP").bind(crypto.randomUUID(),uid,cid,parsed.data.alias.trim()).run();return c.json({conversationId:cid,alias:parsed.data.alias.trim()});});
