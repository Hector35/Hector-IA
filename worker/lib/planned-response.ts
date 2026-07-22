import type {Bindings} from '../types';
import {renderBootstrap} from '../intelligence/bootstrap';
import {callCloudflare,callHuggingFaceQwen,type ProviderName} from './providers';
import {assessProviderResponse,recordProviderQuality,type ProviderQualityAssessment} from './provider-quality';
import {aggregateUsage,candidateInstructions,judgeInput,judgeInstructions,type CandidateRole,type DeliberationProfile} from './deliberation';
import {estimateModelCost} from './model-pricing';
import type {ExecutionPlan} from './execution-plan';
import type {FeedbackRoutingProfile} from './feedback-routing';

export type PlannedAIUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number}};
type AIResponse={id:string;output_text?:string;output?:Array<{type:string;content?:Array<{type:string;text?:string}>}>;usage?:PlannedAIUsage;error?:{message:string}};
export type PlannedChatTurn={role:'user'|'assistant';content:string};
export type PlannedExecutionMetadata={feedback:FeedbackRoutingProfile;budgetDecision:unknown};
type CoreResult={id:string;text:string;usage?:PlannedAIUsage;searchedWeb:boolean;model:string;provider:ProviderName;requestedProvider:ProviderName;providerReason:string;fallback:boolean;qualityScore:number;qualityAccepted:boolean;cognitiveMode:'single'|'ensemble'|'ensemble-degraded';deliberationPasses:number;deliberationReason:string};

function sensitive(task:string){return /salud|riesgo|finanzas|legal|seguridad/i.test(task);}
function instructions(plan:ExecutionPlan,renderedContext:string,guidance:string[]){return `${renderBootstrap()}\n\nEJECUCIÓN AUTORIZADA POR PLAN COGNITIVO\n- Plan: ${plan.hash.slice(0,12)}\n- Tarea: ${plan.task}\n- Modelo: ${plan.route.model}\n- Nivel: ${plan.route.tier}\n- Proveedor: ${plan.provider.requested}\n- Cognición: ${plan.cognition.mode}, ${plan.cognition.passes} pasada(s)\n- Política: ${plan.policySummary}\n\nREGLAS\n- Responde en español salvo petición contraria.\n- Sé directo, técnico y verificable.\n- Distingue hechos, inferencias y supuestos.\n- No inventes acciones, datos, fuentes ni resultados.\n- No cambies modelo, nivel, proveedor o deliberación fuera del plan.\n- No reveles razonamiento privado.\n${guidance.length?`\nCORRECCIONES DEL PROPIETARIO\n${guidance.map(item=>`- ${item}`).join('\n')}\n`:''}\nCONTEXTO DINÁMICO\n${renderedContext}`;}
function conversation(history:PlannedChatTurn[],input:string){const recent=history.slice(-16).map(item=>({role:item.role,content:item.content})),last=recent[recent.length-1];return last?.role==='user'&&last.content===input?recent:[...recent,{role:'user' as const,content:input}];}
async function callResponses(env:Bindings,body:Record<string,unknown>){const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json<AIResponse>();if(!response.ok)throw new Error(data.error?.message||'Error del proveedor de IA');const text=data.output_text||data.output?.flatMap(item=>item.content||[]).map(item=>item.text||'').join('')||'No pude generar una respuesta.';return{data,text,searchedWeb:data.output?.some(item=>item.type==='web_search_call')||false};}
async function quality(env:Bindings,plan:ExecutionPlan,started:number,requested:ProviderName,actual:ProviderName,model:string,fallback:boolean,assessment:ProviderQualityAssessment,reasons:string[]=[]){try{await recordProviderQuality(env.DB,{requestedProvider:requested,actualProvider:actual,model,routeTier:plan.route.tier,task:plan.task,accepted:assessment.accepted,score:assessment.score,fallback,latencyMs:Date.now()-started,reasons:[plan.hash.slice(0,12),...reasons,...assessment.reasons]});}catch{}}
function tools(plan:ExecutionPlan){return plan.route.needsWeb?[{type:'web_search',search_context_size:'high'}]:undefined;}
function best(input:string,candidates:Array<{role:CandidateRole;out:Awaited<ReturnType<typeof callResponses>>}>){return candidates.map(candidate=>({candidate,assessment:assessProviderResponse(input,candidate.out.text)})).sort((a,b)=>b.assessment.score-a.assessment.score)[0];}
function decorate(result:CoreResult,plan:ExecutionPlan,metadata:PlannedExecutionMetadata){return{...result,modelTier:plan.route.tier,modelReason:plan.policySummary,task:plan.task,feedbackAdaptation:{sampleCount:metadata.feedback.sampleCount,preferDeep:metadata.feedback.preferDeep,avoidCloudflare:metadata.feedback.avoidCloudflare,guidanceApplied:metadata.feedback.guidance.length,reason:metadata.feedback.reason},budgetDecision:metadata.budgetDecision};}

async function fallback(env:Bindings,input:string,system:string,plan:ExecutionPlan,openAIInput:unknown,started:number,reason:string):Promise<CoreResult>{
 const out=await callResponses(env,{model:plan.route.model,instructions:system,input:openAIInput,store:true,reasoning:{effort:plan.route.reasoning}}),assessment=assessProviderResponse(input,out.text);
 await quality(env,plan,started,'cloudflare','openai',plan.route.model,true,assessment,[reason]);
 return{id:out.data.id,text:out.text,usage:out.data.usage,searchedWeb:false,model:plan.route.model,provider:'openai',requestedProvider:'cloudflare',providerReason:reason,fallback:true,qualityScore:assessment.score,qualityAccepted:assessment.accepted,cognitiveMode:'single',deliberationPasses:1,deliberationReason:plan.cognition.reason};
}

async function ensemble(env:Bindings,input:string,system:string,plan:ExecutionPlan,openAIInput:unknown,started:number):Promise<CoreResult>{
 const profile:DeliberationProfile={mode:'ensemble',reason:plan.cognition.reason,candidateCount:2,highStakes:sensitive(plan.task)},roles:CandidateRole[]=['architect','adversary'],enabledTools=tools(plan);
 const settled=await Promise.allSettled(roles.map(role=>{const body:Record<string,unknown>={model:plan.route.model,instructions:candidateInstructions(system,role,plan.task,profile.highStakes),input:openAIInput,store:false,reasoning:{effort:'high'}};if(enabledTools)body.tools=enabledTools;return callResponses(env,body).then(out=>({role,out}));}));
 const candidates=settled.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
 if(!candidates.length)throw new Error('No se obtuvo ninguna solución candidata autorizada');
 const candidateUsage=candidates.map(candidate=>candidate.out.data.usage),searchedWeb=candidates.some(candidate=>candidate.out.searchedWeb),fallbackCandidate=best(input,candidates);
 if(candidates.length===1){await quality(env,plan,started,'openai','openai',plan.route.model,true,fallbackCandidate.assessment,['una rama del plan falló']);return{id:fallbackCandidate.candidate.out.data.id,text:fallbackCandidate.candidate.out.text,usage:aggregateUsage(candidateUsage) as PlannedAIUsage,searchedWeb,model:plan.route.model,provider:'openai',requestedProvider:'openai',providerReason:plan.provider.reason,fallback:true,qualityScore:fallbackCandidate.assessment.score,qualityAccepted:fallbackCandidate.assessment.accepted,cognitiveMode:'ensemble-degraded',deliberationPasses:1,deliberationReason:plan.cognition.reason};}
 const criticModel=env.OPENAI_MODEL_CRITIC||plan.route.model;
 if(!plan.allowedModels.includes(criticModel))throw new Error('El modelo crítico no está autorizado por el plan');
 try{
  const final=await callResponses(env,{model:criticModel,instructions:judgeInstructions(system,plan.task,profile.highStakes),input:judgeInput(input,candidates.map(candidate=>({role:candidate.role,text:candidate.out.text}))),store:true,reasoning:{effort:'high'}}),finalAssessment=assessProviderResponse(input,final.text),useFinal=finalAssessment.accepted||finalAssessment.score>=fallbackCandidate.assessment.score,chosen=useFinal?final:fallbackCandidate.candidate.out,assessment=useFinal?finalAssessment:fallbackCandidate.assessment,model=useFinal?criticModel:plan.route.model;
  await quality(env,plan,started,'openai','openai',model,!useFinal,assessment,[useFinal?'síntesis autorizada':'síntesis descartada por calidad']);
  return{id:chosen.data.id,text:chosen.text,usage:aggregateUsage([...candidateUsage,final.data.usage]) as PlannedAIUsage,searchedWeb:searchedWeb||final.searchedWeb,model,provider:'openai',requestedProvider:'openai',providerReason:plan.provider.reason,fallback:!useFinal,qualityScore:assessment.score,qualityAccepted:assessment.accepted,cognitiveMode:'ensemble',deliberationPasses:3,deliberationReason:plan.cognition.reason};
 }catch(error){
  await quality(env,plan,started,'openai','openai',plan.route.model,true,fallbackCandidate.assessment,[`juez no disponible: ${error instanceof Error?error.message:'error'}`]);
  return{id:fallbackCandidate.candidate.out.data.id,text:fallbackCandidate.candidate.out.text,usage:aggregateUsage(candidateUsage) as PlannedAIUsage,searchedWeb,model:plan.route.model,provider:'openai',requestedProvider:'openai',providerReason:plan.provider.reason,fallback:true,qualityScore:fallbackCandidate.assessment.score,qualityAccepted:fallbackCandidate.assessment.accepted,cognitiveMode:'ensemble-degraded',deliberationPasses:2,deliberationReason:plan.cognition.reason};
 }
}

export async function executePlannedContextual(env:Bindings,input:string,history:PlannedChatTurn[],renderedContext:string,plan:ExecutionPlan,metadata:PlannedExecutionMetadata){
 const started=Date.now(),system=instructions(plan,renderedContext,metadata.feedback.guidance),openAIInput=conversation(history,input);let result:CoreResult;
 if(plan.provider.requested==='huggingface'){
  if(plan.cognition.mode!=='single')throw new Error('Héctor Qwen provisional solo admite una inferencia por plan');
  const out=await callHuggingFaceQwen(env,system,openAIInput),assessment=assessProviderResponse(input,out.text);
  await quality(env,plan,started,'huggingface','huggingface',out.model,false,assessment);
  result={id:out.id,text:out.text,usage:out.usage,searchedWeb:false,model:out.model,provider:'huggingface',requestedProvider:'huggingface',providerReason:plan.provider.reason,fallback:false,qualityScore:assessment.score,qualityAccepted:assessment.accepted,cognitiveMode:'single',deliberationPasses:1,deliberationReason:plan.cognition.reason};
  return decorate(result,plan,metadata);
 }
 if(plan.provider.requested==='cloudflare'){
  try{
   if(plan.cognition.mode!=='single')throw new Error('Cloudflare no puede ejecutar un ensemble autorizado');
   const out=await callCloudflare(env,system,input),assessment=assessProviderResponse(input,out.text);
   if(!assessment.accepted)result=await fallback(env,input,system,plan,openAIInput,started,`Fallback de calidad: ${assessment.reasons.join(', ')||assessment.score}`);
   else{await quality(env,plan,started,'cloudflare','cloudflare',out.model,false,assessment);result={id:out.id,text:out.text,usage:out.usage,searchedWeb:false,model:out.model,provider:'cloudflare',requestedProvider:'cloudflare',providerReason:plan.provider.reason,fallback:false,qualityScore:assessment.score,qualityAccepted:true,cognitiveMode:'single',deliberationPasses:1,deliberationReason:plan.cognition.reason};}
  }catch(error){result=await fallback(env,input,system,plan,openAIInput,started,`Fallback: ${error instanceof Error?error.message:'Workers AI falló'}`);}
  return decorate(result,plan,metadata);
 }
 if(plan.cognition.mode==='ensemble')result=await ensemble(env,input,system,plan,openAIInput,started);
 else{
  const body:Record<string,unknown>={model:plan.route.model,instructions:system,input:openAIInput,store:true,reasoning:{effort:plan.route.reasoning}},enabledTools=tools(plan);if(enabledTools)body.tools=enabledTools;
  const out=await callResponses(env,body),assessment=assessProviderResponse(input,out.text);
  await quality(env,plan,started,'openai','openai',plan.route.model,false,assessment);
  result={id:out.data.id,text:out.text,usage:out.data.usage,searchedWeb:out.searchedWeb,model:plan.route.model,provider:'openai',requestedProvider:'openai',providerReason:plan.provider.reason,fallback:false,qualityScore:assessment.score,qualityAccepted:assessment.accepted,cognitiveMode:'single',deliberationPasses:1,deliberationReason:plan.cognition.reason};
 }
 return decorate(result,plan,metadata);
}

export function estimatePlannedCost(usage?:PlannedAIUsage,model?:string){return estimateModelCost(usage,model);}
