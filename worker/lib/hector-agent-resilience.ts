import type {Bindings} from '../types';

export type HectorAgentRouteKind='connector'|'api'|'github_action'|'worker'|'mcp'|'model'|'deterministic';
export type HectorAgentRisk='low'|'medium'|'high';
export type HectorAgentCredentialStatus='ready'|'refresh_required'|'expired'|'revoked'|'blocked';
export type HectorAgentCheckpointStatus='ready'|'waiting_external'|'waiting_approval'|'resumed'|'completed'|'cancelled';

export type HectorAgentCapabilityRoute={
 id:string;user_id:string;capability:string;provider:string;route_kind:HectorAgentRouteKind;endpoint_ref:string|null;credential_id:string|null;
 priority:number;enabled:number;requires_approval:number;risk:HectorAgentRisk;failure_count:number;cooldown_until:string|null;last_error:string|null;last_success_at:string|null;
};

export type HectorAgentCredential={
 id:string;user_id:string;provider:string;auth_type:string;secret_ref:string;scopes_json:string;status:HectorAgentCredentialStatus;refreshable:number;expires_at:string|null;last_verified_at:string|null;metadata_json:string;
};

function ms(value:string|null|undefined){
 if(!value)return null;
 const parsed=Date.parse(value.includes('T')?value:`${value.replace(' ','T')}Z`);
 return Number.isFinite(parsed)?parsed:null;
}

export function routeFailureCooldownSeconds(failureCount:number){
 const n=Math.max(1,Math.trunc(Number(failureCount)||1));
 return Math.min(900,15*(2**Math.min(6,n-1)));
}

export function credentialState(credential:HectorAgentCredential|null|undefined,now=Date.now()){
 if(!credential)return{usable:true as const,state:'not_required' as const};
 if(['revoked','blocked'].includes(credential.status))return{usable:false as const,state:credential.status};
 const expiry=ms(credential.expires_at),needsRefresh=credential.status==='refresh_required'||credential.status==='expired'||(expiry!==null&&expiry<=now);
 if(needsRefresh){
  if(credential.refreshable)return{usable:true as const,state:'refresh_required' as const};
  return{usable:false as const,state:'expired' as const};
 }
 return{usable:true as const,state:'ready' as const};
}

export function orderCapabilityRoutes(routes:HectorAgentCapabilityRoute[],now=Date.now()){
 return routes
  .filter(route=>Boolean(route.enabled))
  .filter(route=>{const until=ms(route.cooldown_until);return until===null||until<=now;})
  .sort((a,b)=>Number(a.priority)-Number(b.priority)||Number(a.failure_count)-Number(b.failure_count)||a.provider.localeCompare(b.provider));
}

export async function listCapabilityRoutes(env:Bindings,userId:string,capability:string){
 const rows=(await env.DB.prepare(`SELECT * FROM hector_agent_capability_routes WHERE user_id=? AND capability=? ORDER BY priority ASC,failure_count ASC,updated_at DESC`)
  .bind(userId,capability).all<HectorAgentCapabilityRoute>()).results as HectorAgentCapabilityRoute[];
 return orderCapabilityRoutes(rows);
}

export async function markCapabilityRouteResult(env:Bindings,input:{routeId:string;userId:string;ok:boolean;error?:string|null}){
 if(input.ok){
  return env.DB.prepare(`UPDATE hector_agent_capability_routes SET failure_count=0,cooldown_until=NULL,last_error=NULL,last_success_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`)
   .bind(input.routeId,input.userId).run();
 }
 const current=await env.DB.prepare('SELECT failure_count FROM hector_agent_capability_routes WHERE id=? AND user_id=?').bind(input.routeId,input.userId).first<{failure_count:number}>();
 if(!current)return null;
 const failures=Number(current.failure_count||0)+1,delay=routeFailureCooldownSeconds(failures);
 return env.DB.prepare(`UPDATE hector_agent_capability_routes SET failure_count=?,cooldown_until=datetime('now',?),last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`)
  .bind(failures,`+${delay} seconds`,(input.error||'route_failed').slice(0,1000),input.routeId,input.userId).run();
}

export async function saveResumeCheckpoint(env:Bindings,input:{
 workJobId:string;reason:string;state?:unknown;status?:HectorAgentCheckpointStatus;resumeAfter?:string|null;approvalId?:string|null;
}){
 const goal=await env.DB.prepare('SELECT id,user_id FROM hector_agent_goals WHERE work_job_id=? LIMIT 1').bind(input.workJobId).first<{id:string;user_id:string}>();
 if(!goal)return null;
 const id=crypto.randomUUID();
 await env.DB.prepare(`INSERT INTO hector_agent_resume_checkpoints(id,user_id,goal_id,work_job_id,reason,state_json,status,resume_after,approval_id) VALUES(?,?,?,?,?,?,?,?,?)`)
  .bind(id,goal.user_id,goal.id,input.workJobId,input.reason,JSON.stringify(input.state??{}),input.status??'ready',input.resumeAfter??null,input.approvalId??null).run();
 return id;
}

export async function completeResumeCheckpoints(env:Bindings,workJobId:string){
 return env.DB.prepare(`UPDATE hector_agent_resume_checkpoints SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE work_job_id=? AND status IN ('ready','waiting_external','resumed')`).bind(workJobId).run();
}

export async function checkpointForApproval(env:Bindings,input:{userId:string;goalId:string;workJobId:string;approvalId:string;reason:string;state?:unknown}){
 const id=crypto.randomUUID();
 await env.DB.prepare(`INSERT INTO hector_agent_resume_checkpoints(id,user_id,goal_id,work_job_id,reason,state_json,status,approval_id) VALUES(?,?,?,?,?,?,'waiting_approval',?)`)
  .bind(id,input.userId,input.goalId,input.workJobId,input.reason,JSON.stringify(input.state??{}),input.approvalId).run();
 return id;
}

export async function resolveApprovalCheckpoint(env:Bindings,input:{approvalId:string;approved:boolean}){
 return env.DB.prepare(`UPDATE hector_agent_resume_checkpoints SET status=?,resumed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE resumed_at END,updated_at=CURRENT_TIMESTAMP WHERE approval_id=? AND status='waiting_approval'`)
  .bind(input.approved?'resumed':'cancelled',input.approved?1:0,input.approvalId).run();
}
