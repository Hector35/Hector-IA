import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadFeedbackRoutingProfile,type FeedbackRoutingProfile} from '../lib/feedback-routing';

export const responseTraces=new Hono<{Bindings:Bindings;Variables:Variables}>();
responseTraces.use('*',requireAuth);

export type TraceTier='fast'|'balanced'|'deep';
export type TraceProvider='cloudflare'|'openai';
export type TraceContext={memories:number;recentMessages:number;hasSummary:boolean;priorSummaries?:number;projectState?:number;contractApplied?:boolean;contractReasons?:string[];cognitiveMode?:string;deliberationPasses?:number;deliberationReason?:string;feedbackAdaptation?:FeedbackRoutingProfile};
export type PersistResponseTraceInput={
 userId:string;conversationId:string;messageId:string;requestedProvider:TraceProvider;actualProvider:TraceProvider;model:string;routeTier:TraceTier;task:string;modelReason:string;providerReason:string;searchedWeb:boolean;fallback:boolean;qualityScore:number;qualityAccepted:boolean;latencyMs:number;estimatedCostUsd:number;memories:string[];context:TraceContext;
};

export function reasoningForTier(tier:TraceTier){return tier==='deep'?'high':tier==='fast'?'low':'medium';}

export function recommendNextAction(input:Pick<PersistResponseTraceInput,'task'|'qualityAccepted'|'fallback'|'searchedWeb'|'memories'>){
 if(!input.qualityAccepted)return'Reintentar con inteligencia profunda, revisar la evidencia y corregir cualquier omisión antes de actuar.';
 if(input.fallback)return'Revisar la salud del proveedor original; la respuesta fue rescatada por el proveedor alternativo.';
 if(/ingeniería de software/i.test(input.task))return'Convertir el resultado en un proyecto verificable con pruebas, build y evidencia de ejecución.';
 if(/planificación|finanzas|salud|riesgo/i.test(input.task))return'Validar supuestos y datos críticos antes de ejecutar la decisión recomendada.';
 if(input.searchedWeb)return'Conservar las fuentes y volver a verificarlas cuando la información pueda cambiar.';
 if(!input.memories.length)return'Guardar las preferencias o hechos estables que deban influir en respuestas futuras.';
 return'Continuar con la siguiente acción concreta y registrar el resultado para mantener continuidad.';
}

export function normalizeTraceRow(row:any){
 let memories:string[]=[];let context:Record<string,unknown>={};
 try{const parsed=JSON.parse(String(row.memories_json||'[]'));if(Array.isArray(parsed))memories=parsed.filter(x=>typeof x==='string').slice(0,20);}catch{}
 try{const parsed=JSON.parse(String(row.context_json||'{}'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))context=parsed;}catch{}
 const {memories_json:_,context_json:__,...rest}=row;
 return{...rest,searched_web:!!row.searched_web,fallback:!!row.fallback,quality_accepted:!!row.quality_accepted,memories,context};
}

export async function persistResponseTrace(env:Bindings,input:PersistResponseTraceInput){
 const id=crypto.randomUUID(),quality=Math.max(0,Math.min(100,Math.round(input.qualityScore||0))),latency=Math.max(0,Math.round(input.latencyMs||0)),cost=Math.max(0,Number(input.estimatedCostUsd)||0),recommendation=recommendNextAction(input);
 await env.DB.prepare(`INSERT INTO response_traces(id,user_id,conversation_id,message_id,requested_provider,actual_provider,model,route_tier,reasoning_level,task,model_reason,provider_reason,searched_web,fallback,quality_score,quality_accepted,latency_ms,estimated_cost_usd,memories_json,context_json,recommendation)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,input.userId,input.conversationId,input.messageId,input.requestedProvider,input.actualProvider,input.model,input.routeTier,reasoningForTier(input.routeTier),input.task,input.modelReason,input.providerReason,+input.searchedWeb,+input.fallback,quality,+input.qualityAccepted,latency,cost,JSON.stringify(input.memories.slice(0,20)),JSON.stringify(input.context),recommendation).run();
 return{id,recommendation,reasoningLevel:reasoningForTier(input.routeTier)};
}

responseTraces.get('/',async c=>{
 const raw=Number(c.req.query('limit')||30),limit=Math.max(1,Math.min(100,Number.isFinite(raw)?raw:30));
 const rows=(await c.env.DB.prepare(`SELECT t.*,c.title conversation_title,substr(m.content,1,500) response_preview,f.rating feedback_rating,f.correction feedback_correction
 FROM response_traces t
 LEFT JOIN conversations c ON c.id=t.conversation_id AND c.user_id=t.user_id
 LEFT JOIN messages m ON m.id=t.message_id
 LEFT JOIN response_feedback f ON f.trace_id=t.id AND f.user_id=t.user_id
 WHERE t.user_id=? ORDER BY t.created_at DESC LIMIT ?`).bind(c.get('userId'),limit).all()).results||[];
 return c.json({items:rows.map(normalizeTraceRow)});
});

responseTraces.get('/:id',async c=>{
 const row=await c.env.DB.prepare(`SELECT t.*,c.title conversation_title,m.content response_content,f.rating feedback_rating,f.correction feedback_correction
 FROM response_traces t
 LEFT JOIN conversations c ON c.id=t.conversation_id AND c.user_id=t.user_id
 LEFT JOIN messages m ON m.id=t.message_id
 LEFT JOIN response_feedback f ON f.trace_id=t.id AND f.user_id=t.user_id
 WHERE t.id=? AND t.user_id=?`).bind(c.req.param('id'),c.get('userId')).first();
 if(!row)return c.json({error:'Traza no encontrada'},404);
 return c.json({trace:normalizeTraceRow(row)});
});

responseTraces.post('/:id/feedback',async c=>{
 const parsed=z.object({rating:z.union([z.literal(1),z.literal(-1)]),correction:z.string().trim().max(1200).optional()}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Retroalimentación inválida'},400);
 const userId=c.get('userId'),trace=await c.env.DB.prepare('SELECT id,task FROM response_traces WHERE id=? AND user_id=?').bind(c.req.param('id'),userId).first<{id:string;task:string}>();
 if(!trace)return c.json({error:'Traza no encontrada'},404);
 const correction=parsed.data.correction?.trim()||null;
 await c.env.DB.prepare(`INSERT INTO response_feedback(id,user_id,trace_id,rating,correction) VALUES(?,?,?,?,?)
 ON CONFLICT(user_id,trace_id) DO UPDATE SET rating=excluded.rating,correction=excluded.correction,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),userId,c.req.param('id'),parsed.data.rating,correction).run();
 let memoryId:string|undefined;
 if(correction){
  const duplicate=await c.env.DB.prepare('SELECT id FROM memories WHERE user_id=? AND lower(content)=lower(?) LIMIT 1').bind(userId,correction).first<{id:string}>();
  if(duplicate)memoryId=duplicate.id;else{memoryId=crypto.randomUUID();await c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,'correction',?,5,'response-feedback')").bind(memoryId,userId,correction).run();}
 }
 const adaptation=await loadFeedbackRoutingProfile(c.env.DB,userId,trace.task);
 return c.json({ok:true,rating:parsed.data.rating,correction,memoryId,adaptation});
});
