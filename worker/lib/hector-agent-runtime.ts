import type {Bindings} from '../types';

export type HectorAgentRuntimeGuard={
 goalId:string;
 maxIterations:number;
 maxRuntimeSeconds:number;
 maxCostUsd:number;
 maxConsecutiveErrors:number;
 accumulatedRuntimeMs:number;
 accumulatedCostUsd:number;
 consecutiveErrors:number;
};

export type HectorAgentRunnerControl={
 isHectorAgent:boolean;
 status:string;
 paused:boolean;
 autoEnabled:boolean;
 lastError?:string|null;
 limitReason?:string|null;
};

type GuardRow={
 goal_id:string;max_iterations:number;max_runtime_seconds:number;max_cost_usd:number;max_consecutive_errors:number;
 accumulated_runtime_ms:number;accumulated_cost_usd:number;consecutive_errors:number;
};

export async function loadHectorAgentRuntimeGuard(env:Bindings,workJobId:string):Promise<HectorAgentRuntimeGuard|null>{
 const row=await env.DB.prepare(`SELECT g.id goal_id,s.max_iterations,s.max_runtime_seconds,s.max_cost_usd,s.max_consecutive_errors,
  g.accumulated_runtime_ms,g.accumulated_cost_usd,g.consecutive_errors
  FROM hector_agent_goals g JOIN hector_agent_settings s ON s.user_id=g.user_id
  WHERE g.work_job_id=? LIMIT 1`).bind(workJobId).first<GuardRow>();
 if(!row)return null;
 return{
  goalId:row.goal_id,
  maxIterations:Number(row.max_iterations),maxRuntimeSeconds:Number(row.max_runtime_seconds),maxCostUsd:Number(row.max_cost_usd),maxConsecutiveErrors:Number(row.max_consecutive_errors),
  accumulatedRuntimeMs:Number(row.accumulated_runtime_ms||0),accumulatedCostUsd:Number(row.accumulated_cost_usd||0),consecutiveErrors:Number(row.consecutive_errors||0)
 };
}

export function hectorAgentLimitReason(guard:HectorAgentRuntimeGuard,attemptCount:number,phase:'before'|'after'):string|null{
 const attempts=Math.max(0,Number(attemptCount)||0);
 if((phase==='before'&&attempts>guard.maxIterations)||(phase==='after'&&attempts>=guard.maxIterations))return `Límite de ${guard.maxIterations} ciclos alcanzado`;
 if(guard.accumulatedRuntimeMs>=guard.maxRuntimeSeconds*1000)return `Límite de tiempo acumulado alcanzado (${guard.maxRuntimeSeconds}s)`;
 if(guard.accumulatedCostUsd>=guard.maxCostUsd)return `Presupuesto del objetivo alcanzado (${guard.maxCostUsd.toFixed(2)} USD)`;
 if(guard.consecutiveErrors>=guard.maxConsecutiveErrors)return `Límite de ${guard.maxConsecutiveErrors} errores consecutivos alcanzado`;
 return null;
}

export function hectorAgentRunnerControlReason(control:HectorAgentRunnerControl):string|null{
 if(!control.isHectorAgent)return null;
 if(control.paused||!control.autoEnabled)return 'Héctor Agent detenido por el usuario';
 if(control.status==='blocked')return control.lastError||'Objetivo pausado o bloqueado desde Héctor Agent';
 return control.limitReason||null;
}

export async function recordHectorAgentCycle(env:Bindings,workJobId:string,input:{durationMs:number;costUsd:number;failed:boolean}):Promise<HectorAgentRuntimeGuard|null>{
 const row=await env.DB.prepare(`UPDATE hector_agent_goals SET
  accumulated_runtime_ms=accumulated_runtime_ms+?,
  accumulated_cost_usd=accumulated_cost_usd+?,
  consecutive_errors=CASE WHEN ? THEN consecutive_errors+1 ELSE 0 END,
  updated_at=CURRENT_TIMESTAMP
  WHERE work_job_id=?
  RETURNING id,accumulated_runtime_ms,accumulated_cost_usd,consecutive_errors`).bind(
   Math.max(0,Math.trunc(input.durationMs)||0),Math.max(0,Number(input.costUsd)||0),input.failed?1:0,workJobId
  ).first<{id:string;accumulated_runtime_ms:number;accumulated_cost_usd:number;consecutive_errors:number}>();
 if(!row)return null;
 const guard=await loadHectorAgentRuntimeGuard(env,workJobId);
 return guard?{...guard,accumulatedRuntimeMs:Number(row.accumulated_runtime_ms||0),accumulatedCostUsd:Number(row.accumulated_cost_usd||0),consecutiveErrors:Number(row.consecutive_errors||0)}:null;
}

export async function blockHectorAgentJob(env:Bindings,input:{workJobId:string;leaseToken:string;reason:string;result?:string|null}){
 await env.DB.prepare('UPDATE hector_agent_goals SET stop_reason=?,updated_at=CURRENT_TIMESTAMP WHERE work_job_id=?').bind(input.reason,input.workJobId).run();
 return env.DB.prepare(`UPDATE work_jobs SET status='blocked',result=COALESCE(?,result),last_error=?,next_retry_at=NULL,lease_token=NULL,lease_expires_at=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  WHERE id=? AND lease_token=?`).bind(input.result??null,input.reason,input.workJobId,input.leaseToken).run();
}
