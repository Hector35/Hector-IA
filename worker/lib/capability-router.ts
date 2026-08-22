import type {Bindings} from '../types';
import {listCapabilityRoutes,markCapabilityRouteResult,type HectorAgentCapabilityRoute,type HectorAgentCredential} from './hector-agent-resilience';
import {resolveCredential} from './credential-broker';

export type CapabilityFailureClass='temporary'|'rate_limit'|'credential'|'capability_missing'|'policy'|'permanent';
export type RouteExecutionResult<T=unknown>={ok:true;value:T;evidence?:Record<string,unknown>}|{ok:false;error:string;status?:number;failureClass?:CapabilityFailureClass;evidence?:Record<string,unknown>};
export type CapabilityCredential={usable:boolean;state:string;credential:HectorAgentCredential|null;material:unknown};

export function classifyCapabilityFailure(input:{status?:number|null;error?:string|null;code?:string|null}):CapabilityFailureClass{
  const status=Number(input.status||0),text=`${input.code||''} ${input.error||''}`.toLowerCase();
  if(/policy|prohibited|security boundary|cross_site_mutation_denied|not allowed by provider|permission denied by policy/.test(text))return'policy';
  if(status===429||/rate.?limit|too many requests|quota temporarily/.test(text))return'rate_limit';
  if(status===401||status===403||/credential|token|oauth|unauthor|forbidden|expired|refresh_required/.test(text))return'credential';
  if(status===404||/not found|missing tool|capability.*missing|no existe una ruta|unsupported adapter/.test(text))return'capability_missing';
  if(status>=500||status===408||/timeout|temporar|network|fetch failed|unavailable|connection/.test(text))return'temporary';
  return'permanent';
}

export function mayFallback(kind:CapabilityFailureClass){return kind==='temporary'||kind==='rate_limit'||kind==='credential'||kind==='capability_missing';}

async function trace(env:Bindings,input:{id:string;userId:string;requestId?:string|null;source:string;capability:string;route?:HectorAgentCapabilityRoute|null;status:'started'|'completed'|'failed'|'waiting';failureClass?:CapabilityFailureClass|null;latencyMs?:number|null;evidence?:Record<string,unknown>;error?:string|null;completed?:boolean}){
  if(input.status==='started'){
    await env.DB.prepare(`INSERT INTO capability_execution_traces(id,user_id,request_id,source,capability,route_id,provider,route_kind,status,evidence_json)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(input.id,input.userId,input.requestId||null,input.source,input.capability,input.route?.id||null,input.route?.provider||null,input.route?.route_kind||null,'started',JSON.stringify(input.evidence||{})).run();return;
  }
  await env.DB.prepare(`UPDATE capability_execution_traces SET status=?,failure_class=?,latency_ms=?,evidence_json=?,error=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`)
    .bind(input.status,input.failureClass||null,input.latencyMs??null,JSON.stringify(input.evidence||{}),(input.error||null)?.slice(0,5000)||null,input.id,input.userId).run();
}

export async function executeCapabilityWithFallback<T>(env:Bindings,input:{userId:string;capability:string;requestId?:string|null;source?:string;invoke:(route:HectorAgentCapabilityRoute,credential:CapabilityCredential)=>Promise<RouteExecutionResult<T>>}){
  const routes=await listCapabilityRoutes(env,input.userId,input.capability),attempts:any[]=[];
  if(!routes.length)return{ok:false as const,failureClass:'capability_missing' as const,error:'No hay rutas configuradas para la capacidad',attempts};
  for(const route of routes){
    const traceId=crypto.randomUUID(),started=Date.now();
    await trace(env,{id:traceId,userId:input.userId,requestId:input.requestId,source:input.source||'bridge',capability:input.capability,route,status:'started'});
    let credential:CapabilityCredential;
    try{credential=route.credential_id?await resolveCredential(env,input.userId,route.credential_id):{usable:true,state:'not_required',credential:null,material:null};}
    catch{credential={usable:false,state:'blocked',credential:null,material:null};}
    if(!credential.usable){
      const failureClass:'credential'='credential',error=`Credencial no utilizable: ${credential.state}`;
      attempts.push({routeId:route.id,provider:route.provider,ok:false,failureClass,error});
      await markCapabilityRouteResult(env,{routeId:route.id,userId:input.userId,ok:false,error});
      await trace(env,{id:traceId,userId:input.userId,source:input.source||'bridge',capability:input.capability,route,status:'failed',failureClass,latencyMs:Date.now()-started,error});
      continue;
    }
    let result:RouteExecutionResult<T>;
    try{result=await input.invoke(route,credential);}catch(e){result={ok:false,error:e instanceof Error?e.message:'route_failed'};}
    if(result.ok){
      await markCapabilityRouteResult(env,{routeId:route.id,userId:input.userId,ok:true});
      await trace(env,{id:traceId,userId:input.userId,source:input.source||'bridge',capability:input.capability,route,status:'completed',latencyMs:Date.now()-started,evidence:result.evidence});
      attempts.push({routeId:route.id,provider:route.provider,ok:true});
      return{ok:true as const,value:result.value,route:{id:route.id,provider:route.provider,kind:route.route_kind},attempts,traceId};
    }
    const failureClass=result.failureClass||classifyCapabilityFailure({status:result.status,error:result.error});
    attempts.push({routeId:route.id,provider:route.provider,ok:false,failureClass,error:result.error,status:result.status});
    await markCapabilityRouteResult(env,{routeId:route.id,userId:input.userId,ok:false,error:result.error});
    await trace(env,{id:traceId,userId:input.userId,source:input.source||'bridge',capability:input.capability,route,status:'failed',failureClass,latencyMs:Date.now()-started,evidence:result.evidence,error:result.error});
    if(!mayFallback(failureClass))return{ok:false as const,failureClass,error:result.error,attempts,traceId};
  }
  const last=attempts[attempts.length-1];
  return{ok:false as const,failureClass:(last?.failureClass||'capability_missing') as CapabilityFailureClass,error:last?.error||'Todas las rutas fallaron',attempts};
}
