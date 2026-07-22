import {budgetAction,isBudgetProtectedTask,summarizeBudgetDecision,type CognitiveBudgetStatus,type CognitiveCostProjection} from './cognitive-budget';
import {neutralFeedbackRoutingProfile,type FeedbackRoutingProfile} from './feedback-routing';
import type {BenchmarkPolicy} from './benchmark-promotion';

export type PolicyTier='fast'|'balanced'|'deep';
export type PolicyRoute={model:string;tier:PolicyTier;reason:string;reasoning:'low'|'medium'|'high';task:string;needsWeb:boolean};
export type PolicyOptions={reasoning?:'auto'|'high';deliberation?:'auto'|'force'|'off';userId?:string};
export type PolicyModels={fast:string;balanced:string;deep:string};
export type PolicyEvidence={source:'base'|'explicit'|'benchmark'|'feedback'|'budget'|'provider';outcome:'applied'|'ignored'|'protected';reason:string};
export type PolicyDecision={route:PolicyRoute;options:PolicyOptions;benchmarkApplied:boolean;feedbackApplied:boolean;budgetDecision:ReturnType<typeof summarizeBudgetDecision>|null;evidence:PolicyEvidence[];summary:string};
export type ObservedPolicyDecision={summary:string;final:{model:string;tier:string;provider:string};benchmarkApplied:boolean;evidence:PolicyEvidence[]};

const clone=(route:PolicyRoute):PolicyRoute=>({...route});
const manualControl=(options:PolicyOptions)=>options.reasoning!==undefined||options.deliberation!==undefined;
const deepRoute=(route:PolicyRoute,models:PolicyModels,reason:string):PolicyRoute=>({...route,model:models.deep,tier:'deep',reasoning:'high',reason});
const downgrade=(route:PolicyRoute,models:PolicyModels,reason:string):PolicyRoute=>route.tier==='deep'?{...route,model:models.balanced,tier:'balanced',reasoning:'medium',reason:`${route.reason}; ${reason}: profundo → balanceado`}:route.tier==='balanced'?{...route,model:models.fast,tier:'fast',reasoning:'low',reason:`${route.reason}; ${reason}: balanceado → rápido`}:{...route,reason:`${route.reason}; ${reason}: ya usa la ruta mínima`};

export function resolvePreBudgetPolicy(input:{baseRoute:PolicyRoute;models:PolicyModels;options:PolicyOptions;benchmark:BenchmarkPolicy|null;feedback:FeedbackRoutingProfile}):PolicyDecision{
 let route=clone(input.baseRoute),options={...input.options},benchmarkApplied=false,feedbackApplied=false;
 const evidence:PolicyEvidence[]=[{source:'base',outcome:'applied',reason:route.reason}];
 if(options.reasoning==='high'){route=deepRoute(route,input.models,'nivel de razonamiento alto solicitado explícitamente');evidence.push({source:'explicit',outcome:'applied',reason:'el propietario solicitó razonamiento alto'});}
 const promoted=input.benchmark?.strategy==='adaptive'&&input.benchmark.status==='promoted';
 if(promoted&&!manualControl(input.options)){route=deepRoute(route,input.models,`promoción por benchmark: ${input.benchmark?.reason||'estrategia adaptativa validada'}`);options={...options,reasoning:'high',deliberation:'force'};benchmarkApplied=true;evidence.push({source:'benchmark',outcome:'applied',reason:input.benchmark?.reason||'estrategia adaptativa promovida'});}else if(promoted){evidence.push({source:'benchmark',outcome:'ignored',reason:'el control manual del propietario tiene precedencia'});}
 if(input.feedback.preferDeep&&route.tier!=='deep'){route=deepRoute(route,input.models,`aprendizaje del libro mayor: ${input.feedback.reason}`);feedbackApplied=true;evidence.push({source:'feedback',outcome:'applied',reason:input.feedback.reason});}else if(input.feedback.preferDeep){evidence.push({source:'feedback',outcome:'ignored',reason:'la ruta ya usa razonamiento profundo'});}
 return{route,options,benchmarkApplied,feedbackApplied,budgetDecision:null,evidence,summary:explainPolicy(evidence,route)};
}

export function resolveEntryPolicy(input:{baseRoute:PolicyRoute;models:PolicyModels;options:PolicyOptions;benchmark:BenchmarkPolicy|null}){return resolvePreBudgetPolicy({...input,feedback:neutralFeedbackRoutingProfile()});}

export function resolveBudgetPolicy(input:{decision:PolicyDecision;models:PolicyModels;budget:CognitiveBudgetStatus;projection:CognitiveCostProjection|null;inputText:string}):PolicyDecision{
 const explicitHigh=input.decision.options.reasoning==='high'||input.decision.options.deliberation==='force',sensitive=isBudgetProtectedTask(input.inputText,input.decision.route.task),action=budgetAction(input.budget,sensitive,explicitHigh,input.projection),evidence=[...input.decision.evidence];let route=input.decision.route;
 if(action.action==='degrade'){route=downgrade(route,input.models,'protección presupuestaria predictiva');evidence.push({source:'budget',outcome:'applied',reason:action.reason});}else if(action.action==='allow-protected'){evidence.push({source:'budget',outcome:'protected',reason:action.reason});}else{evidence.push({source:'budget',outcome:'ignored',reason:action.reason});}
 return{...input.decision,route,budgetDecision:summarizeBudgetDecision(input.budget,action,input.projection),evidence,summary:explainPolicy(evidence,route)};
}

export function finalizeObservedPolicy(input:{entry:PolicyDecision;model:string;tier:string;provider:string;providerReason:string;feedback?:{preferDeep?:boolean;reason?:string}|null;budget?:{action?:string;reason?:string}|null}):ObservedPolicyDecision{
 const evidence=[...input.entry.evidence];
 if(input.feedback?.preferDeep)evidence.push({source:'feedback',outcome:input.tier==='deep'?'applied':'ignored',reason:input.feedback.reason||'el libro mayor pidió mayor profundidad'});
 if(input.budget?.action)evidence.push({source:'budget',outcome:input.budget.action==='degrade'?'applied':input.budget.action==='allow-protected'?'protected':'ignored',reason:input.budget.reason||input.budget.action});
 evidence.push({source:'provider',outcome:'applied',reason:input.providerReason});
 const route:PolicyRoute={...input.entry.route,model:input.model,tier:(['fast','balanced','deep'].includes(input.tier)?input.tier:'balanced') as PolicyTier,reasoning:input.tier==='deep'?'high':input.tier==='fast'?'low':'medium'};
 return{summary:explainPolicy(evidence,route),final:{model:input.model,tier:input.tier,provider:input.provider},benchmarkApplied:input.entry.benchmarkApplied,evidence};
}

export function explainPolicy(evidence:PolicyEvidence[],route:PolicyRoute){const applied=evidence.filter(item=>item.outcome==='applied').map(item=>item.reason),protectedItems=evidence.filter(item=>item.outcome==='protected').map(item=>item.reason),ignored=evidence.filter(item=>item.outcome==='ignored').map(item=>item.reason);return[`Ruta final ${route.tier} (${route.model}).`,applied.length?`Aplicado: ${applied.join(' → ')}.`:'',protectedItems.length?`Protegido: ${protectedItems.join(' · ')}.`:'',ignored.length?`Ignorado por precedencia: ${ignored.join(' · ')}.`:''].filter(Boolean).join(' ');}
