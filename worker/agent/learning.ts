import type {Bindings} from '../types';

export type ExperienceEvidence={kind:string;label?:string;value?:unknown;verified?:boolean};
export type ExperienceUsage={provider?:string;model?:string;inputTokens?:number;cachedInputTokens?:number;outputTokens?:number;estimatedCostUsd?:number};
export type RecordExperienceInput={
 jobId:string;
 executionId?:string;
 userId:string;
 objective:string;
 status:string;
 result?:string;
 error?:string;
 skills:string[];
 plan?:unknown;
 actions?:unknown[];
 tools?:unknown[];
 evidence?:ExperienceEvidence[];
 verified?:boolean;
 verification?:unknown;
 attempts:number;
 durationMs:number;
 usage?:ExperienceUsage;
};

const normalizeWhitespace=(value:string)=>value.replace(/\s+/g,' ').trim();
export function normalizeObjective(value:string){
 return normalizeWhitespace(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s_-]/g,'').slice(0,1000);
}
function json(value:unknown,fallback:'{}'|'[]'){
 try{return JSON.stringify(value??JSON.parse(fallback));}catch{return fallback;}
}
function finite(value:number|undefined){return typeof value==='number'&&Number.isFinite(value)?value:null;}

export async function recordExperience(env:Bindings,input:RecordExperienceInput){
 const id=crypto.randomUUID(),executionId=input.executionId||`${input.jobId}:${Math.max(1,input.attempts)}`;
 const objective=normalizeWhitespace(input.objective).slice(0,12000),objectiveNormalized=normalizeObjective(objective);
 await env.DB.prepare(`INSERT INTO agent_experiences(
  id,job_id,execution_id,user_id,objective,objective_normalized,status,result,error_text,skills_json,
  plan_json,actions_json,tools_json,evidence_json,verified,verification_json,attempts,duration_ms,
  provider,model,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,updated_at
 ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(user_id,execution_id) DO UPDATE SET
  status=excluded.status,result=excluded.result,error_text=excluded.error_text,skills_json=excluded.skills_json,
  plan_json=excluded.plan_json,actions_json=excluded.actions_json,tools_json=excluded.tools_json,
  evidence_json=excluded.evidence_json,verified=excluded.verified,verification_json=excluded.verification_json,
  attempts=excluded.attempts,duration_ms=excluded.duration_ms,provider=excluded.provider,model=excluded.model,
  input_tokens=excluded.input_tokens,cached_input_tokens=excluded.cached_input_tokens,
  output_tokens=excluded.output_tokens,estimated_cost_usd=excluded.estimated_cost_usd,updated_at=CURRENT_TIMESTAMP`).bind(
  id,input.jobId,executionId,input.userId,objective,objectiveNormalized,input.status,input.result||null,input.error||null,
  json(input.skills,'[]'),json(input.plan,'{}'),json(input.actions,'[]'),json(input.tools,'[]'),json(input.evidence,'[]'),
  input.verified?1:0,json(input.verification,'{}'),Math.max(1,Math.trunc(input.attempts)||1),Math.max(0,Math.trunc(input.durationMs)||0),
  input.usage?.provider||null,input.usage?.model||null,finite(input.usage?.inputTokens),finite(input.usage?.cachedInputTokens),
  finite(input.usage?.outputTokens),finite(input.usage?.estimatedCostUsd)
 ).run();
 return id;
}

export async function repeatedFailures(env:Bindings,userId:string){
 const rows=(await env.DB.prepare("SELECT objective,result,error_text,skills_json,COUNT(*) AS occurrences FROM agent_experiences WHERE user_id=? AND status!='completed' GROUP BY objective,result,error_text,skills_json HAVING COUNT(*)>=2 ORDER BY occurrences DESC LIMIT 10").bind(userId).all<any>()).results;
 return rows.map(x=>({objective:x.objective,result:x.result,error:x.error_text,skills:JSON.parse(x.skills_json||'[]'),occurrences:x.occurrences}));
}

export function learningCandidate(input:{objective:string;result:string;skills:string[];status:string;verified?:boolean;evidence?:ExperienceEvidence[]}){
 if(input.status!=='completed'||!input.verified)return null;
 const evidence=(input.evidence||[]).filter(item=>item.verified!==false);
 if(!evidence.length)return null;
 return{title:`Patrón aprendido: ${input.skills.join(' + ')||'general'}`,trigger:input.objective.slice(0,240),procedure:input.result.slice(0,2000),confidence:.6,status:'candidate' as const,evidence};
}
