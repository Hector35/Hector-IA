import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack,renderContext} from '../lib/context';
import {renderBootstrap} from '../intelligence/bootstrap';
import {callCloudflare} from '../lib/providers';
import {callKimiK2_5,hasKimiEndpoint,kimiStatus} from '../lib/kimi-k2-runtime';
import {callQwen397,hasQwen397Endpoint,probeQwen397,qwen397Status} from '../lib/qwen397-runtime';
import {enforceResponseContract} from '../lib/response-contract';
import {buildCognitiveRepairPrompt,createCognitiveRuntimePlan,createCognitiveRuntimeTelemetry,renderCognitiveContract,verifyCognitiveResponse,type CognitiveAttemptTelemetry,type CognitiveRuntimePlan} from '../lib/cognitive-runtime';
import {executeReadOnlyTool,parseReadOnlyToolCall,renderReadOnlyToolProtocol,renderReadOnlyToolResult,type ReadOnlyToolExecution} from '../lib/bounded-read-tools';
import {estimateModelCost} from '../lib/model-pricing';
import {persistResponseTrace} from './response-traces';

export const qwen397Chat=new Hono<{Bindings:Bindings;Variables:Variables}>();
qwen397Chat.use('/qwen397-chat',requireAuth);
qwen397Chat.use('/qwen397-status',requireAuth);
qwen397Chat.use('/qwen397-probe',requireAuth);

type ProviderKind='qwen397'|'kimi'|'cloudflare';
type ChatTurn={role:'user'|'assistant';content:string};
type RoutedOutput={text:string;id:string;model:string;usage?:{input_tokens?:number;output_tokens?:number};endpointSource?:string;selectionPolicy?:string;billingMode?:string;latencyMs?:number};
type FallbackResult={out:RoutedOutput;provider:string;providerKind:Exclude<ProviderKind,'qwen397'>;fallbackLevel:1|2;reason:string};
type LiveAttestation={attested:boolean;requestedModel:string;effectiveModel:string;endpointSource:string|null;selectionPolicy:string|null;billingMode:string|null;latencyMs:number;estimatedCostUsd:number;createdAt:string};
type ToolRuntime={version:'1.0.0';maximumCalls:2;calls:Array<Pick<ReadOnlyToolExecution,'id'|'name'|'success'|'sideEffects'|'durationMs'|'error'>>;exhausted:boolean};

async function latestAttestation(db:D1Database,userId:string):Promise<LiveAttestation|null>{
 try{
  const row=await db.prepare("SELECT model,estimated_cost_usd,metadata_json,created_at FROM api_usage WHERE user_id=? AND service='qwen397-live-probe' ORDER BY created_at DESC LIMIT 1").bind(userId).first<any>();
  if(!row)return null;
  const metadata=JSON.parse(String(row.metadata_json||'{}'));
  if(metadata.attested!==true)return null;
  return{attested:true,requestedModel:String(metadata.requestedModel||''),effectiveModel:String(metadata.effectiveModel||row.model||''),endpointSource:metadata.endpointSource||null,selectionPolicy:metadata.selectionPolicy||null,billingMode:metadata.billingMode||null,latencyMs:Number(metadata.latencyMs||0),estimatedCostUsd:Number(row.estimated_cost_usd||0),createdAt:String(row.created_at||'')};
 }catch{return null;}
}

async function ensureConversation(db:D1Database,userId:string,conversationId:string|undefined,message:string){if(conversationId){const existing=await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(conversationId,userId).first();if(existing)return conversationId;}const id=crypto.randomUUID();await db.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').bind(id,userId,message.slice(0,60)||'Chat Qwen 397B').run();return id;}
async function saveRollingSummary(db:D1Database,userId:string,conversationId:string){const rows=(await db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 12').bind(conversationId).all<any>()).results.reverse();const summary=rows.map((item:any)=>`${item.role==='user'?'Héctor':'Héctor OS'}: ${String(item.content).replace(/\s+/g,' ').slice(0,260)}`).join('\n').slice(0,3000);await db.prepare("INSERT INTO conversation_summaries(conversation_id,user_id,summary,message_count) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET summary=excluded.summary,message_count=excluded.message_count,updated_at=CURRENT_TIMESTAMP").bind(conversationId,userId,summary,rows.length).run();}
function instructions(context:string,runtimePlan:CognitiveRuntimePlan){return `${renderBootstrap()}\n\nRUNTIME PRINCIPAL\n- Modelo solicitado: Qwen/Qwen3.5-397B-A17B.\n- MoE multimodal: 397B totales, 17B activos.\n- No afirmes que respondió Qwen si el runtime reporta fallback.\n- No afirmes pesos personalizados hasta que un checkpoint supere Benchmark V2.\n- Responde en español salvo petición contraria.\n- Distingue hechos, inferencias, acciones y límites.\n- No reveles razonamiento privado; entrega resultados y evidencia verificable.\n\nCONTEXTO DINÁMICO\n${context}${renderCognitiveContract(runtimePlan)}${renderReadOnlyToolProtocol()}`;}
function combineUsage(first:RoutedOutput['usage'],second:RoutedOutput['usage']){return{input_tokens:Number(first?.input_tokens||0)+Number(second?.input_tokens||0),output_tokens:Number(first?.output_tokens||0)+Number(second?.output_tokens||0)};}
function combineOutput(first:RoutedOutput,second:RoutedOutput):RoutedOutput{return{...second,usage:combineUsage(first.usage,second.usage),latencyMs:Number(first.latencyMs||0)+Number(second.latencyMs||0)};}
function compactTurns(turns:ChatTurn[]){return turns.slice(-10).map(turn=>`${turn.role==='user'?'USUARIO':'ASISTENTE'}: ${turn.content}`).join('\n\n').slice(0,16000);}
async function callWithProvider(env:Bindings,providerKind:ProviderKind,system:string,turns:ChatTurn[]){if(providerKind==='qwen397')return callQwen397(env,system,turns);if(providerKind==='kimi')return callKimiK2_5(env,system,turns);return callCloudflare(env,system,compactTurns(turns));}
async function fallbackAfterQwen(env:Bindings,system:string,history:ChatTurn[],message:string,baseReason:string):Promise<FallbackResult>{if(hasKimiEndpoint(env)){try{const out=await callKimiK2_5(env,`${system}\n\nQwen no estuvo disponible. Responde como fallback Kimi identificado.`,history);return{out,provider:'Kimi K2.5 endpoint',providerKind:'kimi',fallbackLevel:1,reason:`${baseReason}; se usó Kimi K2.5`};}catch(error){const kimiError=error instanceof Error?error.message:'error desconocido';const out=await callCloudflare(env,`${system}\n\nQwen y Kimi no estuvieron disponibles. Responde como fallback Workers AI identificado.`,message);return{out,provider:'Cloudflare Workers AI',providerKind:'cloudflare',fallbackLevel:2,reason:`${baseReason}; Kimi falló: ${kimiError}; se usó Workers AI`};}}const out=await callCloudflare(env,`${system}\n\nQwen no estuvo disponible y Kimi no está configurado. Responde como fallback Workers AI identificado.`,message);return{out,provider:'Cloudflare Workers AI',providerKind:'cloudflare',fallbackLevel:2,reason:`${baseReason}; Kimi no está configurado; se usó Workers AI`};}
async function repairWithProvider(env:Bindings,providerKind:ProviderKind,system:string,history:ChatTurn[],prompt:string){return callWithProvider(env,providerKind,`${system}\n\nMODO DE REPARACIÓN COGNITIVA: corrige únicamente los criterios fallidos. No solicites herramientas nuevas durante la reparación.`,[...history,{role:'user',content:prompt}]);}
async function runReadOnlyToolLoop(env:Bindings,userId:string,providerKind:ProviderKind,system:string,initialHistory:ChatTurn[],initial:RoutedOutput){
 const maximumCalls=2 as const,calls:ReadOnlyToolExecution[]=[],history=[...initialHistory];let out=initial;
 for(let index=0;index<maximumCalls;index++){
  const call=parseReadOnlyToolCall(out.text);if(!call)break;
  const execution=await executeReadOnlyTool(env,userId,call);calls.push(execution);
  history.push({role:'assistant',content:out.text},{role:'user',content:renderReadOnlyToolResult(execution,index+1,maximumCalls)});
  out=combineOutput(out,await callWithProvider(env,providerKind,system,history));
 }
 const pending=parseReadOnlyToolCall(out.text),exhausted=Boolean(pending);
 if(exhausted)out={...out,text:'No pude completar la cadena porque alcanzó el límite seguro de dos herramientas de sólo lectura. Divide la solicitud en pasos o pide una herramienta específica.'};
 const telemetry:ToolRuntime={version:'1.0.0',maximumCalls,calls:calls.map(({id,name,success,sideEffects,durationMs,error})=>({id,name,success,sideEffects,durationMs,error})),exhausted};
 return{out,history,telemetry};
}

qwen397Chat.get('/qwen397-status',async c=>c.json({...qwen397Status(c.env),liveAttestation:await latestAttestation(c.env.DB,c.get('userId'))}));

qwen397Chat.post('/qwen397-probe',async c=>{
 const userId=c.get('userId'),status=qwen397Status(c.env);
 try{
  const out=await probeQwen397(c.env),pricing=estimateModelCost(out.usage,out.model),attestation={attested:true,requestedModel:out.requestedModel,effectiveModel:out.model,endpointSource:out.endpointSource,selectionPolicy:out.selectionPolicy,billingMode:out.billingMode,latencyMs:out.latencyMs,estimatedCostUsd:pricing.costUsd,createdAt:new Date().toISOString()};
  await c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,'Qwen exact endpoint','qwen397-live-probe',out.model,pricing.input,pricing.cached,pricing.output,pricing.costUsd,JSON.stringify({...attestation,explicitUserAction:true,probeTokenVerified:true})).run();
  return c.json({runtime:status,liveAttestation:attestation});
 }catch(error){return c.json({error:error instanceof Error?error.message:'La prueba viva de Qwen 397B falló',runtime:status,liveAttestation:null},502);}
});

qwen397Chat.post('/qwen397-chat',async c=>{
 const parsed=z.object({message:z.string().min(1).max(12000),conversationId:z.string().uuid().optional(),reasoning:z.enum(['auto','high']).optional(),deliberation:z.enum(['auto','force','off']).optional()}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Mensaje inválido'},400);
 const message=parsed.data.message.trim(),userId=c.get('userId'),conversationId=await ensureConversation(c.env.DB,userId,parsed.data.conversationId,message),runtimePlan=createCognitiveRuntimePlan({prompt:message,tier:'deep',mode:parsed.data.deliberation==='off'?'single':'ensemble',reasoning:parsed.data.reasoning==='high'?'high':'medium'});
 await c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),conversationId,'user',message).run();
 const pack=await loadContextPack(c.env,userId,conversationId,message),system=instructions(renderContext(pack),runtimePlan),history=pack.recentMessages.filter(item=>item.role==='user'||item.role==='assistant').map(item=>({role:item.role as 'user'|'assistant',content:item.content}));
 const qwenConfigured=hasQwen397Endpoint(c.env),kimiConfigured=hasKimiEndpoint(c.env);let out:RoutedOutput;let provider='Qwen 397B endpoint',providerKind:ProviderKind='qwen397',fallback=false,reason='Qwen 397B respondió con contenido válido',fallbackLevel:0|1|2=0;
 try{
  if(qwenConfigured){try{out=await callQwen397(c.env,system,history);}catch(error){const routed=await fallbackAfterQwen(c.env,system,history,message,`Qwen falló: ${error instanceof Error?error.message:'error desconocido'}`);out=routed.out;provider=routed.provider;providerKind=routed.providerKind;fallback=true;fallbackLevel=routed.fallbackLevel;reason=routed.reason;}}
  else{const routed=await fallbackAfterQwen(c.env,system,history,message,'Qwen no tiene endpoint, HUGGINGFACE_TOKEN ni secreto dedicado configurados');out=routed.out;provider=routed.provider;providerKind=routed.providerKind;fallback=true;fallbackLevel=routed.fallbackLevel;reason=routed.reason;}
  const toolRun=await runReadOnlyToolLoop(c.env,userId,providerKind,system,history,out);out=toolRun.out;if(toolRun.telemetry.calls.length)reason=`${reason}; ${toolRun.telemetry.calls.length} herramienta(s) de sólo lectura ejecutada(s)`;
  const attempts:CognitiveAttemptTelemetry[]=[];let verification=verifyCognitiveResponse({prompt:message,text:out.text,plan:runtimePlan,searchedWeb:false});attempts.push({attempt:1,phase:'solve',provider,model:out.model,verification});
  if(!verification.accepted&&runtimePlan.maxAttempts>1&&!toolRun.telemetry.exhausted){try{const repairPrompt=buildCognitiveRepairPrompt({prompt:message,draft:out.text,verification,plan:runtimePlan}),repaired=await repairWithProvider(c.env,providerKind,system,toolRun.history,repairPrompt);out=combineOutput(out,repaired);verification=verifyCognitiveResponse({prompt:message,text:out.text,plan:runtimePlan,searchedWeb:false});attempts.push({attempt:2,phase:'repair',provider,model:out.model,verification});reason=`${reason}; reparación cognitiva ejecutada`;}catch(error){reason=`${reason}; reparación cognitiva no disponible: ${error instanceof Error?error.message:'error desconocido'}`;}}
  const cognitiveRuntime=createCognitiveRuntimeTelemetry(runtimePlan,attempts),contract=enforceResponseContract(message,out.text),assistantMessageId=crypto.randomUUID(),status=qwen397Status(c.env),effectiveQwen=!fallback&&qwenConfigured&&providerKind==='qwen397',pricing=effectiveQwen?estimateModelCost(out.usage,out.model):{input:Number(out.usage?.input_tokens||0),cached:0,cacheWrite:0,output:Number(out.usage?.output_tokens||0),costUsd:0,pricingModel:out.model,pricingKnown:false,pricingSource:'fallback-not-priced',longContext:false};
  await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO messages(id,conversation_id,role,content) VALUES(?,?,?,?)').bind(assistantMessageId,conversationId,'assistant',contract.text),
   c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,provider,'qwen397-chat',out.model,pricing.input,pricing.cached,pricing.output,pricing.costUsd,JSON.stringify({runtimeId:'hector-qwen397',requestedModel:status.model,effectiveModel:out.model,fallback,fallbackLevel,reason,qwenConfigured,kimiConfigured,kimiModel:kimiStatus(c.env).model,contractApplied:contract.applied,contractReasons:contract.reasons,cognitiveRuntime,toolRuntime:toolRun.telemetry,endpointSource:status.endpointSource,selectionPolicy:status.selectionPolicy,billingMode:status.billingMode,pricingModel:pricing.pricingModel,pricingKnown:pricing.pricingKnown,pricingSource:pricing.pricingSource,latencyMs:out.latencyMs||0}))
  ]);
  let trace:{id:string;recommendation:string;reasoningLevel:string}|undefined;try{trace=await persistResponseTrace(c.env,{userId,conversationId,messageId:assistantMessageId,requestedProvider:'huggingface',actualProvider:providerKind==='cloudflare'?'cloudflare':'huggingface',model:out.model,routeTier:'deep',task:'chat principal Qwen 397B',modelReason:'Qwen3.5-397B-A17B con herramientas de lectura, contrato cognitivo y reparación acotada',providerReason:reason,searchedWeb:false,fallback,qualityScore:verification.score,qualityAccepted:verification.accepted,latencyMs:out.latencyMs||0,estimatedCostUsd:pricing.costUsd,memories:pack.memories,context:{memories:pack.memories.length,recentMessages:pack.recentMessages.length,hasSummary:!!pack.summary,priorSummaries:pack.priorSummaries.length,projectState:pack.projectState.length,contractApplied:contract.applied,contractReasons:contract.reasons,cognitiveRuntime,toolRuntime:toolRun.telemetry}});}catch{}
  await saveRollingSummary(c.env.DB,userId,conversationId);
  return c.json({conversationId,message:{id:assistantMessageId,role:'assistant',content:contract.text},provider,model:out.model,requestedModel:status.model,runtimeId:'hector-qwen397',runtime:status,fallback,fallbackLevel,fallbackReason:fallback?reason:undefined,modelTier:effectiveQwen?'open-multimodal-moe-397b':'qwen397-fallback',usage:{...out.usage,estimatedCostUsd:pricing.costUsd},qualityScore:verification.score,qualityAccepted:verification.accepted,cognitiveRuntime,toolRuntime:toolRun.telemetry,trace:trace||null,contract:{applied:contract.applied,reasons:contract.reasons}});
 }catch(error){return c.json({error:error instanceof Error?error.message:'Qwen 397B no respondió',runtime:qwen397Status(c.env)},502);}
});
