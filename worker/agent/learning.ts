import type {Bindings} from '../types';
import {buildPlan} from './planner';

export type ExperienceEvidence={kind:string;label?:string;value?:unknown;verified?:boolean};
export type ExperienceUsage={provider?:string;model?:string;inputTokens?:number;cachedInputTokens?:number;outputTokens?:number;estimatedCostUsd?:number};
export type RecordExperienceInput={jobId:string;executionId?:string;userId:string;objective:string;status:string;result?:string;error?:string;skills:string[];plan?:unknown;actions?:unknown[];tools?:unknown[];evidence?:ExperienceEvidence[];verified?:boolean;verification?:unknown;attempts:number;durationMs:number;usage?:ExperienceUsage};

type EventRow={message:string;progress:number;created_at:string};
type UsageRow={provider:string;model:string;input_units:number;cached_input_units:number;output_units:number;estimated_cost_usd:number;metadata_json:string};

const normalizeWhitespace=(value:string)=>value.replace(/\s+/g,' ').trim();
export function normalizeObjective(value:string){return normalizeWhitespace(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s_-]/g,'').slice(0,1000);}
function json(value:unknown,fallback:'{}'|'[]'){try{return JSON.stringify(value??JSON.parse(fallback));}catch{return fallback;}}
function finite(value:number|undefined){return typeof value==='number'&&Number.isFinite(value)?value:null;}
function parse(value:string|undefined,fallback:unknown){try{return JSON.parse(value||'');}catch{return fallback;}}

async function executionSnapshot(env:Bindings,input:RecordExperienceInput){
 const events=(await env.DB.prepare('SELECT message,progress,created_at FROM work_events WHERE job_id=? ORDER BY created_at,id').bind(input.jobId).all<EventRow>()).results||[];
 const usage=await env.DB.prepare('SELECT provider,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json FROM api_usage WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(input.userId).first<UsageRow>();
 const metadata=parse(usage?.metadata_json,{}) as Record<string,unknown>;
 const actions=input.actions||events.map(item=>({action:item.message,progress:item.progress,at:item.created_at}));
 const evidence=input.evidence||events.filter(item=>item.progress>=80).map(item=>({kind:'work-event',label:item.message,value:{progress:item.progress,at:item.created_at},verified:item.progress>=100}));
 const verified=input.verified??(input.status==='completed'&&evidence.some(item=>item.verified===true));
 return{
  plan:input.plan||{agent:buildPlan(input.objective),execution:{hash:metadata.planHash||null,version:metadata.planVersion||null}},
  actions,
  tools:input.tools||input.skills.map(skill=>({skill})),
  evidence,
  verified,
  verification:input.verification||metadata.planVerification||{},
  usage:input.usage||usage?{provider:input.usage?.provider||usage?.provider,model:input.usage?.model||usage?.model,inputTokens:input.usage?.inputTokens??usage?.input_units,cachedInputTokens:input.usage?.cachedInputTokens??usage?.cached_input_units,outputTokens:input.usage?.outputTokens??usage?.output_units,estimatedCostUsd:input.usage?.estimatedCostUsd??usage?.estimated_cost_usd}:undefined
 };
}

export async function recordExperience(env:Bindings,input:RecordExperienceInput){
 const id=crypto.randomUUID(),executionId=input.executionId||`${input.jobId}:${Math.max(1,input.attempts)}`;
 const objective=normalizeWhitespace(input.objective).slice(0,12000),objectiveNormalized=normalizeObjective(objective),snapshot=await executionSnapshot(env,input);
 await env.DB.prepare(`INSERT OR REPLACE INTO agent_experiences(id,job_id,execution_id,user_id,objective,objective_normalized,status,result,error_text,skills_json,plan_json,actions_json,tools_json,evidence_json,verified,verification_json,attempts,duration_ms,provider,model,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM agent_experiences WHERE user_id=? AND execution_id=?),CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)`).bind(
  id,input.jobId,executionId,input.userId,objective,objectiveNormalized,input.status,input.result||null,input.error||(input.status==='completed'?null:input.result||null),json(input.skills,'[]'),json(snapshot.plan,'{}'),json(snapshot.actions,'[]'),json(snapshot.tools,'[]'),json(snapshot.evidence,'[]'),snapshot.verified?1:0,json(snapshot.verification,'{}'),Math.max(1,Math.trunc(input.attempts)||1),Math.max(0,Math.trunc(input.durationMs)||0),snapshot.usage?.provider||null,snapshot.usage?.model||null,finite(snapshot.usage?.inputTokens),finite(snapshot.usage?.cachedInputTokens),finite(snapshot.usage?.outputTokens),finite(snapshot.usage?.estimatedCostUsd),input.userId,executionId
 ).run();
 return id;
}

export async function repeatedFailures(env:Bindings,userId:string){const rows=(await env.DB.prepare("SELECT objective,result,error_text,skills_json,COUNT(*) AS occurrences FROM agent_experiences WHERE user_id=? AND status!='completed' GROUP BY objective,result,error_text,skills_json HAVING COUNT(*)>=2 ORDER BY occurrences DESC LIMIT 10").bind(userId).all<any>()).results;return rows.map(x=>({objective:x.objective,result:x.result,error:x.error_text,skills:parse(x.skills_json,[]),occurrences:x.occurrences}));}

export function learningCandidate(input:{objective:string;result:string;skills:string[];status:string;verified?:boolean;evidence?:ExperienceEvidence[]}){if(input.status!=='completed'||!input.verified)return null;const evidence=(input.evidence||[]).filter(item=>item.verified!==false);if(!evidence.length)return null;return{title:`Patrón aprendido: ${input.skills.join(' + ')||'general'}`,trigger:input.objective.slice(0,240),procedure:input.result.slice(0,2000),confidence:.6,status:'candidate' as const,evidence};}
