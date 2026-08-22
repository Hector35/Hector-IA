import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {executeCapabilityWithFallback,classifyCapabilityFailure,type RouteExecutionResult} from '../lib/capability-router';
import {isSafeContextEndpoint,normalizeCapability,parseStoredJson} from '../lib/context-hub';
import type {HectorAgentCapabilityRoute} from '../lib/hector-agent-resilience';

export const hectorCapabilities=new Hono<{Bindings:Bindings;Variables:Variables}>();
hectorCapabilities.use('*',requireAuth);

const executeSchema=z.object({capability:z.string().trim().min(2).max(120),input:z.unknown().default({})});

function publicHttps(value:string){
  try{
    const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;
    const host=url.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.local')||host==='::1'||host.startsWith('127.')||host.startsWith('10.')||host.startsWith('192.168.')||host.startsWith('169.254.'))return null;
    const match=host.match(/^172\.(\d+)\./);if(match&&Number(match[1])>=16&&Number(match[1])<=31)return null;
    return url;
  }catch{return null;}
}

function forwardedHeaders(c:any){
  const headers=new Headers({'Content-Type':'application/json','Accept':'application/json'});
  const authorization=c.req.header('Authorization');if(authorization)headers.set('Authorization',authorization);
  const cookie=c.req.header('Cookie');if(cookie)headers.set('Cookie',cookie);
  const requestId=c.req.header('X-Request-ID');if(requestId)headers.set('X-Request-ID',requestId);
  return headers;
}

function credentialHeaders(route:HectorAgentCapabilityRoute,credential:any,url:URL){
  const headers=new Headers({'Content-Type':'application/json','Accept':'application/json'}),material=credential?.material as any;
  if(!route.credential_id)return headers;
  const metadata=parseStoredJson<Record<string,unknown>>(credential?.credential?.metadata_json||'{}',{}),allowed=Array.isArray(metadata.allowedHosts)?metadata.allowedHosts.map(String):[];
  if(!allowed.includes(url.hostname))throw new Error(`policy: credential host ${url.hostname} is not in allowedHosts`);
  if(material&&typeof material==='object'&&material.headers&&typeof material.headers==='object')for(const [key,value] of Object.entries(material.headers))if(typeof value==='string')headers.set(key,value);
  if(material&&typeof material==='object'){
    const token=typeof material.access_token==='string'?material.access_token:typeof material.token==='string'?material.token:null;
    if(token){const header=typeof material.header==='string'?material.header:'Authorization',scheme=typeof material.token_type==='string'?material.token_type:typeof material.scheme==='string'?material.scheme:'Bearer';headers.set(header,header.toLowerCase()==='authorization'?`${scheme} ${token}`.trim():token);}
  }
  return headers;
}

async function invokeRoute(c:any,route:HectorAgentCapabilityRoute,credential:any,input:unknown):Promise<RouteExecutionResult>{
  if(!route.endpoint_ref)return{ok:false,error:'capability_missing: route has no endpoint',failureClass:'capability_missing'};
  if(route.route_kind==='worker'||route.route_kind==='deterministic'){
    if(!isSafeContextEndpoint(route.endpoint_ref))return{ok:false,error:'policy: unsafe same-origin endpoint',failureClass:'policy'};
    const url=new URL(route.endpoint_ref,c.req.url),headers=forwardedHeaders(c),response=await fetch(url.toString(),{method:'POST',headers,body:JSON.stringify(input??{}),redirect:'manual',cache:'no-store'});
    const text=await response.text(),payload=(()=>{try{return JSON.parse(text)}catch{return{text:text.slice(0,12000)}}})();
    return response.ok?{ok:true,value:payload,evidence:{httpStatus:response.status,endpoint:route.endpoint_ref}}:{ok:false,error:(payload as any)?.error||`HTTP ${response.status}`,status:response.status,evidence:{endpoint:route.endpoint_ref}};
  }
  if(route.route_kind==='api'){
    const url=publicHttps(route.endpoint_ref);if(!url)return{ok:false,error:'policy: external API endpoint must be public HTTPS',failureClass:'policy'};
    let headers:Headers;try{headers=credentialHeaders(route,credential,url)}catch(e){return{ok:false,error:e instanceof Error?e.message:'credential host rejected',failureClass:'policy'};}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(url.toString(),{method:'POST',headers,body:JSON.stringify(input??{}),redirect:'manual',signal:controller.signal});
      const text=await response.text(),payload=(()=>{try{return JSON.parse(text)}catch{return{text:text.slice(0,12000)}}})();
      return response.ok?{ok:true,value:payload,evidence:{httpStatus:response.status,host:url.hostname}}:{ok:false,error:(payload as any)?.error||`HTTP ${response.status}`,status:response.status,evidence:{host:url.hostname}};
    }catch(e){return{ok:false,error:e instanceof Error?e.message:'external_api_failed',failureClass:classifyCapabilityFailure({error:e instanceof Error?e.message:''})};}
    finally{clearTimeout(timer);}
  }
  if(route.route_kind==='github_action'){
    const token=c.env.GITHUB_RUNNER_TOKEN?.trim();if(!token)return{ok:false,error:'credential: GITHUB_RUNNER_TOKEN unavailable',failureClass:'credential'};
    const response=await fetch(`https://api.github.com/repos/Hector35/Hector-IA/actions/workflows/${encodeURIComponent(route.endpoint_ref)}/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Hector-Capability-Router'},body:JSON.stringify({ref:'main',inputs:{payload:JSON.stringify(input??{}).slice(0,60000)}})});
    return response.ok?{ok:true,value:{queued:true,workflow:route.endpoint_ref},evidence:{httpStatus:response.status}}:{ok:false,error:`GitHub workflow HTTP ${response.status}`,status:response.status};
  }
  return{ok:false,error:`capability_missing: ${route.route_kind} adapter not configured in Worker`,failureClass:'capability_missing'};
}

hectorCapabilities.get('/list',async c=>{
  const uid=c.get('userId');
  const [tools,routes,credentials]=await Promise.all([
    c.env.DB.prepare('SELECT id,capability,title,description,handler_type,endpoint_ref,http_method,priority,risk,requires_approval,enabled FROM context_hub_tools WHERE user_id=? AND enabled=1 ORDER BY capability,priority').bind(uid).all(),
    c.env.DB.prepare('SELECT id,capability,provider,route_kind,endpoint_ref,priority,risk,requires_approval,failure_count,cooldown_until,last_error,last_success_at FROM hector_agent_capability_routes WHERE user_id=? AND enabled=1 ORDER BY capability,priority,failure_count').bind(uid).all(),
    c.env.DB.prepare('SELECT id,provider,auth_type,scopes_json,status,refreshable,expires_at,last_verified_at,updated_at FROM hector_agent_credentials WHERE user_id=? ORDER BY provider,updated_at DESC').bind(uid).all()
  ]);
  return c.json({ok:true,broker:'hector-universal-capability-router',tools:tools.results,routes:routes.results,credentials:credentials.results});
});

hectorCapabilities.post('/execute',async c=>{
  const parsed=executeSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Ejecución inválida',details:parsed.error.flatten()},400);
  const capability=normalizeCapability(parsed.data.capability),requestId=c.req.header('X-Request-ID')||crypto.randomUUID();
  const result=await executeCapabilityWithFallback(c.env,{userId:c.get('userId'),capability,requestId,source:c.get('authMethod')==='external_token'?'mcp':'bridge',invoke:(route,credential)=>invokeRoute(c,route,credential,parsed.data.input)});
  if(result.ok)return c.json({ok:true,capability,result:result.value,route:result.route,attempts:result.attempts,traceId:result.traceId});
  return c.json({ok:false,capability,error:result.error,failureClass:result.failureClass,attempts:result.attempts},result.failureClass==='policy'?403:result.failureClass==='credential'?401:502);
});

hectorCapabilities.get('/traces',async c=>{
  const n=Number(c.req.query('limit')||100),limit=Number.isFinite(n)?Math.min(300,Math.max(1,Math.trunc(n))):100;
  const rows=await c.env.DB.prepare('SELECT id,request_id,source,capability,route_id,provider,route_kind,status,failure_class,latency_ms,evidence_json,error,created_at,completed_at FROM capability_execution_traces WHERE user_id=? ORDER BY created_at DESC LIMIT ?').bind(c.get('userId'),limit).all<any>();
  return c.json({items:(rows.results||[]).map((x:any)=>({...x,evidence:parseStoredJson(x.evidence_json,{})}))});
});
