import type {Bindings} from '../types';
import {renderBootstrap} from '../intelligence/bootstrap';
import {callCloudflare,type ProviderName} from './providers';
import {assessProviderResponse,recordProviderQuality,type ProviderQualityAssessment} from './provider-quality';
import {aggregateUsage,candidateInstructions,judgeInput,judgeInstructions,type CandidateRole} from './deliberation';
import {estimateModelCost} from './model-pricing';
import type {ExecutionPlan} from './execution-plan';
import type {FeedbackRoutingProfile} from './feedback-routing';

export type PlannedAIUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number}};
export type PlannedChatTurn={role:'user'|'assistant';content:string};
export type PlannedExecutionMetadata={feedback:FeedbackRoutingProfile;budgetDecision:unknown};
type CoreResult={id:string;text:string;usage?:PlannedAIUsage;searchedWeb:boolean;model:string;provider:ProviderName;requestedProvider:ProviderName;providerReason:string;fallback:boolean;qualityScore:number;qualityAccepted:boolean;cognitiveMode:'single'|'ensemble'|'ensemble-degraded';deliberationPasses:number;deliberationReason:string};
type OpenCandidate={role:CandidateRole;out:Awaited<ReturnType<typeof callCloudflare>>};

function sensitive(task:string){return /salud|riesgo|finanzas|legal|seguridad/i.test(task);}
function instructions(plan:ExecutionPlan,renderedContext:string,guidance:string[]){return `${renderBootstrap()}

RUNTIME CONVERSACIONAL AUTORIZADO
- Identidad: Héctor Base
- Proveedor permitido: Cloudflare Workers AI / reglas locales
- OpenAI: prohibido para responder el chat; reservado para generar datos, crítica y evaluación del entrenamiento
- Plan: ${plan.hash.slice(0,12)}
- Tarea: ${plan.task}
- Nivel solicitado: ${plan.route.tier}
- Cognición: ${plan.cognition.mode}, ${plan.cognition.passes} pasada(s)

REGLAS
- Responde en español salvo petición contraria.
- Sé directo, técnico y verificable.
- Distingue hechos, inferencias y supuestos.
- No inventes acciones, datos, fuentes ni resultados.
- No afirmes haber consultado internet: este chat no tiene navegación web activa.
- Para información actual que no puedas verificar, declara el límite y pide una fuente o abstente.
- En salud, finanzas, legal y seguridad, sé conservador y reconoce límites.
- No reveles razonamiento privado.
${guidance.length?`
CORRECCIONES DEL PROPIETARIO
${guidance.map(item=>`- ${item}`).join('\n')}
`:''}
CONTEXTO DINÁMICO
${renderedContext}`;}
function conversation(history:PlannedChatTurn[],input:string){const recent=history.slice(-16),last=recent[recent.length-1],items=last?.role==='user'&&last.content===input?recent:[...recent,{role:'user' as const,content:input}];return items.map(item=>`${item.role==='user'?'Usuario':'Héctor'}: ${item.content}`).join('\n');}
async function quality(env:Bindings,plan:ExecutionPlan,started:number,requested:ProviderName,model:string,fallback:boolean,assessment:ProviderQualityAssessment,reasons:string[]=[]){try{await recordProviderQuality(env.DB,{requestedProvider:requested,actualProvider:'cloudflare',model,routeTier:plan.route.tier,task:plan.task,accepted:assessment.accepted,score:assessment.score,fallback,latencyMs:Date.now()-started,reasons:[plan.hash.slice(0,12),'chat-open-model-only',...reasons,...assessment.reasons]});}catch{}}
function decorate(result:CoreResult,plan:ExecutionPlan,metadata:PlannedExecutionMetadata){return{...result,modelTier:plan.route.tier,modelReason:`${plan.policySummary} Runtime: Héctor Base únicamente; OpenAI reservado para entrenamiento y evaluación.`,task:plan.task,feedbackAdaptation:{sampleCount:metadata.feedback.sampleCount,preferDeep:metadata.feedback.preferDeep,avoidCloudflare:metadata.feedback.avoidCloudflare,guidanceApplied:metadata.feedback.guidance.length,reason:metadata.feedback.reason},budgetDecision:metadata.budgetDecision};}
function best(input:string,candidates:OpenCandidate[]){return candidates.map(candidate=>({candidate,assessment:assessProviderResponse(input,candidate.out.text)})).sort((a,b)=>b.assessment.score-a.assessment.score)[0];}
function requestedFallback(plan:ExecutionPlan){return plan.provider.requested!=='cloudflare';}

async function single(env:Bindings,input:string,system:string,plan:ExecutionPlan,started:number):Promise<CoreResult>{
 const out=await callCloudflare(env,system,input),assessment=assessProviderResponse(input,out.text),fallback=requestedFallback(plan);
 await quality(env,plan,started,plan.provider.requested,out.model,fallback,assessment,[assessment.accepted?'respuesta aceptada sin proveedor externo':'respuesta conservada sin fallback externo']);
 return{id:out.id,text:out.text,usage:out.usage,searchedWeb:false,model:out.model,provider:'cloudflare',requestedProvider:plan.provider.requested,providerReason:`${plan.provider.reason}; OpenAI no autorizado en chat`,fallback,qualityScore:assessment.score,qualityAccepted:assessment.accepted,cognitiveMode:'single',deliberationPasses:1,deliberationReason:plan.cognition.reason};
}

async function ensemble(env:Bindings,input:string,system:string,plan:ExecutionPlan,started:number):Promise<CoreResult>{
 const roles:CandidateRole[]=['architect','adversary'],settled=await Promise.allSettled(roles.map(role=>callCloudflare(env,candidateInstructions(system,role,plan.task,sensitive(plan.task)),input).then(out=>({role,out})))),candidates=settled.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
 if(!candidates.length)throw new Error('Héctor Base no produjo ninguna rama válida y el chat no usará OpenAI como fallback');
 const candidateUsage=candidates.map(candidate=>candidate.out.usage),fallbackCandidate=best(input,candidates),requestedChanged=requestedFallback(plan);
 if(candidates.length===1){await quality(env,plan,started,plan.provider.requested,fallbackCandidate.candidate.out.model,true,fallbackCandidate.assessment,['una rama abierta falló']);return{id:fallbackCandidate.candidate.out.id,text:fallbackCandidate.candidate.out.text,usage:aggregateUsage(candidateUsage) as PlannedAIUsage,searchedWeb:false,model:fallbackCandidate.candidate.out.model,provider:'cloudflare',requestedProvider:plan.provider.requested,providerReason:`${plan.provider.reason}; ensemble abierto degradado`,fallback:true,qualityScore:fallbackCandidate.assessment.score,qualityAccepted:fallbackCandidate.assessment.accepted,cognitiveMode:'ensemble-degraded',deliberationPasses:1,deliberationReason:plan.cognition.reason};}
 try{
  const final=await callCloudflare(env,judgeInstructions(system,plan.task,sensitive(plan.task)),judgeInput(input,candidates.map(candidate=>({role:candidate.role,text:candidate.out.text})))),finalAssessment=assessProviderResponse(input,final.text),useFinal=finalAssessment.accepted||finalAssessment.score>=fallbackCandidate.assessment.score,chosen=useFinal?final:fallbackCandidate.candidate.out,assessment=useFinal?finalAssessment:fallbackCandidate.assessment;
  await quality(env,plan,started,plan.provider.requested,chosen.model,requestedChanged||!useFinal,assessment,[useFinal?'síntesis abierta aceptada':'síntesis abierta descartada por calidad']);
  return{id:chosen.id,text:chosen.text,usage:aggregateUsage([...candidateUsage,final.usage]) as PlannedAIUsage,searchedWeb:false,model:chosen.model,provider:'cloudflare',requestedProvider:plan.provider.requested,providerReason:`${plan.provider.reason}; deliberación completa con Héctor Base`,fallback:requestedChanged||!useFinal,qualityScore:assessment.score,qualityAccepted:assessment.accepted,cognitiveMode:'ensemble',deliberationPasses:3,deliberationReason:plan.cognition.reason};
 }catch(error){await quality(env,plan,started,plan.provider.requested,fallbackCandidate.candidate.out.model,true,fallbackCandidate.assessment,[`juez abierto no disponible: ${error instanceof Error?error.message:'error'}`]);return{id:fallbackCandidate.candidate.out.id,text:fallbackCandidate.candidate.out.text,usage:aggregateUsage(candidateUsage) as PlannedAIUsage,searchedWeb:false,model:fallbackCandidate.candidate.out.model,provider:'cloudflare',requestedProvider:plan.provider.requested,providerReason:`${plan.provider.reason}; juez abierto no disponible`,fallback:true,qualityScore:fallbackCandidate.assessment.score,qualityAccepted:fallbackCandidate.assessment.accepted,cognitiveMode:'ensemble-degraded',deliberationPasses:2,deliberationReason:plan.cognition.reason};}
}

export async function executePlannedContextual(env:Bindings,input:string,history:PlannedChatTurn[],renderedContext:string,plan:ExecutionPlan,metadata:PlannedExecutionMetadata){const started=Date.now(),historyText=conversation(history,input),system=`${instructions(plan,renderedContext,metadata.feedback.guidance)}\n\nHISTORIAL RECIENTE\n${historyText}`,result=plan.cognition.mode==='ensemble'?await ensemble(env,input,system,plan,started):await single(env,input,system,plan,started);return decorate(result,plan,metadata);}
export function estimatePlannedCost(usage?:PlannedAIUsage,model?:string){return estimateModelCost(usage,model);}
