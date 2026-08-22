import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack} from '../lib/context';
import {listCapabilityRoutes} from '../lib/hector-agent-resilience';
import {
  CONTEXT_HUB_BUILTINS,
  CONTEXT_RECORD_TYPES,
  contextRecordIsCurrent,
  isSafeContextEndpoint,
  memoryKindForRecord,
  normalizeCapability,
  normalizeContextRecordType,
  parseStoredJson,
  type ContextRecordType,
  type ContextToolHandler,
  type ContextToolRisk
} from '../lib/context-hub';

export const contextHub=new Hono<{Bindings:Bindings;Variables:Variables}>();
contextHub.use('*',requireAuth);

const recordType=z.enum(CONTEXT_RECORD_TYPES);
const nullableIso=z.string().datetime({offset:true}).nullable().optional();
const rememberSchema=z.object({
  recordType:recordType.default('fact'),
  subject:z.string().trim().min(1).max(240).nullable().optional(),
  content:z.string().trim().min(2).max(12000),
  confidence:z.number().min(0).max(1).default(0.9),
  validFrom:nullableIso,
  validUntil:nullableIso,
  sourceType:z.string().trim().min(1).max(80).default('manual'),
  sourceRef:z.string().trim().max(500).nullable().optional(),
  tags:z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  metadata:z.record(z.string(),z.unknown()).default({}),
  importance:z.number().int().min(1).max(5).default(3)
}).refine(v=>!v.validFrom||!v.validUntil||Date.parse(v.validFrom)<Date.parse(v.validUntil),{message:'validUntil debe ser posterior a validFrom'});

const recallSchema=z.object({
  query:z.string().trim().min(2).max(4000),
  limit:z.number().int().min(1).max(30).default(12),
  types:z.array(recordType).max(CONTEXT_RECORD_TYPES.length).optional()
});

const searchSchema=z.object({query:z.string().trim().min(2).max(2000),limit:z.number().int().min(1).max(50).default(20)});
const snapshotSchema=z.object({
  name:z.string().trim().min(1).max(180),
  content:z.string().min(1).max(1_000_000),
  contentType:z.string().trim().min(3).max(120).default('text/plain; charset=utf-8'),
  summary:z.string().trim().min(2).max(4000).optional(),
  tags:z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  metadata:z.record(z.string(),z.unknown()).default({})
});

const toolSchema=z.object({
  capability:z.string().trim().min(2).max(120),
  title:z.string().trim().min(2).max(120),
  description:z.string().trim().min(2).max(1000),
  handlerType:z.enum(['http_same_origin','github_workflow','resilience_route']),
  endpointRef:z.string().trim().min(1).max(500),
  httpMethod:z.enum(['GET','POST','PUT','PATCH','DELETE']).default('POST'),
  priority:z.number().int().min(0).max(10000).default(100),
  risk:z.enum(['low','medium','high']).default('low'),
  requiresApproval:z.boolean().default(false),
  enabled:z.boolean().default(true),
  inputSchema:z.record(z.string(),z.unknown()).default({}),
  metadata:z.record(z.string(),z.unknown()).default({})
});

const toolPatchSchema=z.object({
  title:z.string().trim().min(2).max(120).optional(),
  description:z.string().trim().min(2).max(1000).optional(),
  priority:z.number().int().min(0).max(10000).optional(),
  risk:z.enum(['low','medium','high']).optional(),
  requiresApproval:z.boolean().optional(),
  enabled:z.boolean().optional(),
  inputSchema:z.record(z.string(),z.unknown()).optional(),
  metadata:z.record(z.string(),z.unknown()).optional()
}).refine(v=>Object.keys(v).length>0,'Sin cambios');

const executeSchema=z.object({capability:z.string().trim().min(2).max(120),toolId:z.string().trim().max(120).optional(),input:z.unknown().default({})});
const resumeSchema=z.object({runId:z.string().uuid().optional(),goalId:z.string().uuid().optional(),checkpointId:z.string().uuid().optional()})
  .refine(v=>Boolean(v.runId||(v.goalId&&v.checkpointId)),{message:'Indica runId o goalId + checkpointId'});

type HubRecord={
  id:string;user_id:string;memory_id:string|null;record_type:ContextRecordType;subject:string|null;content:string;confidence:number;
  valid_from:string|null;valid_until:string|null;source_type:string;source_ref:string|null;tags_json:string;metadata_json:string;status:string;
  supersedes_id:string|null;created_at:string;updated_at:string;
};

type ResolvedTool={
  id:string|null;capability:string;title:string;description:string;handler_type:ContextToolHandler;endpoint_ref:string;http_method:string;
  priority:number;risk:ContextToolRisk;requires_approval:number;enabled:number;input_schema_json:string;metadata_json:string;source:'builtin'|'registry'|'fallback-router';
};

function asRecord(row:HubRecord){
  return{
    id:row.id,type:row.record_type,subject:row.subject,content:row.content,confidence:Number(row.confidence),validFrom:row.valid_from,validUntil:row.valid_until,
    source:{type:row.source_type,ref:row.source_ref},tags:parseStoredJson<string[]>(row.tags_json,[]),metadata:parseStoredJson<Record<string,unknown>>(row.metadata_json,{}),
    status:row.status,supersedesId:row.supersedes_id,createdAt:row.created_at,updatedAt:row.updated_at
  };
}

function builtinTool(capability:string){return CONTEXT_HUB_BUILTINS.find(tool=>tool.capability===normalizeCapability(capability));}
function primitive(value:unknown){return typeof value==='string'||typeof value==='number'||typeof value==='boolean';}

async function remember(c:any,input:z.infer<typeof rememberSchema>){
  const userId=c.get('userId'),type=normalizeContextRecordType(input.recordType);
  const duplicate=await c.env.DB.prepare(`SELECT * FROM context_hub_records WHERE user_id=? AND record_type=? AND lower(content)=lower(?) AND status='active' LIMIT 1`)
    .bind(userId,type,input.content).first<HubRecord>();
  if(duplicate)return{item:asRecord(duplicate),deduplicated:true};
  const id=crypto.randomUUID(),memoryKind=memoryKindForRecord(type);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,?,?,?,'context-hub')")
      .bind(id,userId,memoryKind,input.content,input.importance),
    c.env.DB.prepare(`INSERT INTO context_hub_records(id,user_id,memory_id,record_type,subject,content,confidence,valid_from,valid_until,source_type,source_ref,tags_json,metadata_json,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`)
      .bind(id,userId,id,type,input.subject??null,input.content,input.confidence,input.validFrom??null,input.validUntil??null,input.sourceType,input.sourceRef??null,JSON.stringify(input.tags),JSON.stringify(input.metadata)),
    c.env.DB.prepare("INSERT INTO audit_log(id,user_id,action,resource_type,resource_id,metadata_json) VALUES(?,?,'context_remember','context_hub_record',?,?)")
      .bind(crypto.randomUUID(),userId,id,JSON.stringify({type,sourceType:input.sourceType}))
  ]);
  const row=await c.env.DB.prepare('SELECT * FROM context_hub_records WHERE id=? AND user_id=?').bind(id,userId).first<HubRecord>();
  return{item:row?asRecord(row):{id,type,content:input.content},deduplicated:false};
}

async function recall(c:any,input:z.infer<typeof recallSchema>){
  const userId=c.get('userId'),pack=await loadContextPack(c.env,userId,undefined,input.query),ranked=pack.memories.slice(0,Math.max(input.limit,12));
  if(!ranked.length)return{query:input.query,items:[],selectedCount:0};
  const placeholders=ranked.map(()=>'?').join(',');
  const rows=(await c.env.DB.prepare(`SELECT * FROM context_hub_records WHERE user_id=? AND content IN (${placeholders}) ORDER BY updated_at DESC`)
    .bind(userId,...ranked).all<HubRecord>()).results||[];
  const allowed=input.types?new Set(input.types):null,now=Date.now(),remaining=[...rows],items:any[]=[];
  for(const content of ranked){
    const index=remaining.findIndex(row=>row.content===content&&contextRecordIsCurrent(row,now)&&(!allowed||allowed.has(row.record_type)));
    if(index<0)continue;
    const [row]=remaining.splice(index,1);items.push({...asRecord(row),rank:items.length+1});
    if(items.length>=input.limit)break;
  }
  return{query:input.query,items,selectedCount:items.length,semanticMemory:true};
}

async function currentState(c:any){
  const userId=c.get('userId');
  const [goals,checkpoints,schedules,projects,files,records,toolRuns]=await Promise.all([
    c.env.DB.prepare(`SELECT g.id,g.title,g.objective,w.kind,w.status,w.progress,w.result,w.last_error,w.next_retry_at,w.updated_at
      FROM hector_agent_goals g JOIN work_jobs w ON w.id=g.work_job_id WHERE g.user_id=? ORDER BY w.updated_at DESC LIMIT 25`).bind(userId).all(),
    c.env.DB.prepare("SELECT id,goal_id,work_job_id,reason,status,resume_after,approval_id,updated_at FROM hector_agent_resume_checkpoints WHERE user_id=? AND status IN ('ready','waiting_external','waiting_approval','resumed') ORDER BY updated_at DESC LIMIT 25").bind(userId).all(),
    c.env.DB.prepare('SELECT id,title,kind,cadence,autonomy_mode,enabled,next_run_at,last_run_at,run_count,failure_count,updated_at FROM scheduled_tasks WHERE user_id=? ORDER BY updated_at DESC LIMIT 25').bind(userId).all(),
    c.env.DB.prepare('SELECT id,name,template,status,created_at,updated_at FROM app_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 25').bind(userId).all(),
    c.env.DB.prepare('SELECT id,name,content_type,size_bytes,created_at FROM files WHERE user_id=? ORDER BY created_at DESC LIMIT 25').bind(userId).all(),
    c.env.DB.prepare("SELECT * FROM context_hub_records WHERE user_id=? AND status='active' AND record_type IN ('state','project','task','decision','preference') AND (valid_until IS NULL OR valid_until>CURRENT_TIMESTAMP) ORDER BY updated_at DESC LIMIT 40").bind(userId).all<HubRecord>(),
    c.env.DB.prepare("SELECT id,capability,status,approval_id,error,created_at,updated_at FROM context_hub_tool_runs WHERE user_id=? AND status NOT IN ('completed','cancelled') ORDER BY updated_at DESC LIMIT 25").bind(userId).all()
  ]);
  return{generatedAt:new Date().toISOString(),goals:goals.results,checkpoints:checkpoints.results,schedules:schedules.results,projects:projects.results,files:files.results,records:(records.results||[]).map(asRecord),toolRuns:toolRuns.results};
}

async function history(c:any,limit:number){
  const userId=c.get('userId'),each=Math.min(100,Math.max(20,limit));
  const [records,events,audit,runs]=await Promise.all([
    c.env.DB.prepare('SELECT id,record_type,subject,content,source_type,source_ref,created_at,updated_at FROM context_hub_records WHERE user_id=? ORDER BY updated_at DESC LIMIT ?').bind(userId,each).all<any>(),
    c.env.DB.prepare(`SELECT e.id,e.message,e.progress,e.created_at,w.kind,w.id work_job_id FROM work_events e JOIN work_jobs w ON w.id=e.job_id WHERE w.user_id=? ORDER BY e.created_at DESC LIMIT ?`).bind(userId,each).all<any>(),
    c.env.DB.prepare('SELECT id,action,resource_type,resource_id,metadata_json,created_at FROM audit_log WHERE user_id=? ORDER BY created_at DESC LIMIT ?').bind(userId,each).all<any>(),
    c.env.DB.prepare('SELECT id,capability,status,result_json,error,created_at,updated_at FROM context_hub_tool_runs WHERE user_id=? ORDER BY updated_at DESC LIMIT ?').bind(userId,each).all<any>()
  ]);
  const timeline=[
    ...(records.results||[]).map((x:any)=>({type:'memory',id:x.id,at:x.updated_at,title:x.subject||x.record_type,detail:x.content,source:x.source_type,sourceRef:x.source_ref})),
    ...(events.results||[]).map((x:any)=>({type:'work',id:x.id,at:x.created_at,title:x.kind,detail:x.message,progress:x.progress,workJobId:x.work_job_id})),
    ...(audit.results||[]).map((x:any)=>({type:'audit',id:x.id,at:x.created_at,title:x.action,detail:x.resource_type,resourceId:x.resource_id,metadata:parseStoredJson(x.metadata_json,{})})),
    ...(runs.results||[]).map((x:any)=>({type:'tool',id:x.id,at:x.updated_at,title:x.capability,detail:x.status,result:parseStoredJson(x.result_json,null),error:x.error}))
  ].sort((a:any,b:any)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,limit);
  return{items:timeline,count:timeline.length};
}

async function searchEverything(c:any,input:z.infer<typeof searchSchema>){
  const userId=c.get('userId'),term=`%${input.query.toLowerCase()}%`,pack=await loadContextPack(c.env,userId,undefined,input.query);
  const [records,files,goals,messages,projects,tools,routes]=await Promise.all([
    c.env.DB.prepare(`SELECT * FROM context_hub_records WHERE user_id=? AND status='active' AND (lower(content) LIKE ? OR lower(COALESCE(subject,'')) LIKE ? OR lower(tags_json) LIKE ?) ORDER BY updated_at DESC LIMIT ?`).bind(userId,term,term,term,input.limit).all<HubRecord>(),
    c.env.DB.prepare('SELECT id,name,content_type,size_bytes,created_at FROM files WHERE user_id=? AND lower(name) LIKE ? ORDER BY created_at DESC LIMIT ?').bind(userId,term,input.limit).all(),
    c.env.DB.prepare(`SELECT g.id,g.title,g.objective,w.status,w.progress,w.result,w.updated_at FROM hector_agent_goals g JOIN work_jobs w ON w.id=g.work_job_id WHERE g.user_id=? AND (lower(g.title) LIKE ? OR lower(g.objective) LIKE ? OR lower(COALESCE(w.result,'')) LIKE ?) ORDER BY w.updated_at DESC LIMIT ?`).bind(userId,term,term,term,input.limit).all(),
    c.env.DB.prepare(`SELECT m.id,m.conversation_id,m.role,m.content,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=? AND lower(m.content) LIKE ? ORDER BY m.created_at DESC LIMIT ?`).bind(userId,term,input.limit).all(),
    c.env.DB.prepare('SELECT id,name,template,status,updated_at FROM app_projects WHERE user_id=? AND (lower(name) LIKE ? OR lower(template) LIKE ?) ORDER BY updated_at DESC LIMIT ?').bind(userId,term,term,input.limit).all(),
    c.env.DB.prepare('SELECT id,capability,title,description,handler_type,endpoint_ref,risk,requires_approval,enabled,priority FROM context_hub_tools WHERE user_id=? AND (lower(capability) LIKE ? OR lower(title) LIKE ? OR lower(description) LIKE ?) ORDER BY priority LIMIT ?').bind(userId,term,term,term,input.limit).all(),
    c.env.DB.prepare('SELECT id,capability,provider,route_kind,endpoint_ref,priority,enabled,requires_approval,risk,failure_count,cooldown_until,last_error,last_success_at FROM hector_agent_capability_routes WHERE user_id=? AND (lower(capability) LIKE ? OR lower(provider) LIKE ? OR lower(COALESCE(endpoint_ref,\'\')) LIKE ?) ORDER BY priority LIMIT ?').bind(userId,term,term,term,input.limit).all()
  ]);
  const semantic=pack.memories.slice(0,input.limit);
  return{query:input.query,semanticMemory:semantic,records:(records.results||[]).map(asRecord),files:files.results,goals:goals.results,messages:messages.results,projects:projects.results,tools:tools.results,routes:routes.results,externalSearchCapabilities:[...(tools.results||[]),...(routes.results||[])].filter((x:any)=>String(x.capability||'').includes('search')).map((x:any)=>x.capability)};
}

function manifestTool(tool:any){
  return{id:tool.id,capability:tool.capability,title:tool.title||tool.capability,description:tool.description||'',handlerType:tool.handler_type,endpointRef:tool.endpoint_ref,httpMethod:tool.http_method||'POST',priority:Number(tool.priority||100),risk:tool.risk||'low',requiresApproval:Boolean(tool.requires_approval),enabled:Boolean(tool.enabled),inputSchema:parseStoredJson(tool.input_schema_json,{}),metadata:parseStoredJson(tool.metadata_json,{})};
}

async function capabilities(c:any){
  const userId=c.get('userId');
  const [registered,routes,credentials]=await Promise.all([
    c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE user_id=? ORDER BY capability,priority,updated_at DESC').bind(userId).all<any>(),
    c.env.DB.prepare('SELECT id,capability,provider,route_kind,endpoint_ref,priority,enabled,requires_approval,risk,failure_count,cooldown_until,last_error,last_success_at FROM hector_agent_capability_routes WHERE user_id=? ORDER BY capability,priority,failure_count').bind(userId).all<any>(),
    c.env.DB.prepare('SELECT id,provider,auth_type,status,refreshable,expires_at,last_verified_at,metadata_json FROM hector_agent_credentials WHERE user_id=? ORDER BY provider,updated_at DESC').bind(userId).all<any>()
  ]);
  return{
    architecture:{contextHub:true,memoryVault:'D1+R2',semanticMemory:true,toolRegistry:true,fallbackRouter:true,credentialBroker:true,approvalGateway:true,persistentResume:true,secretsExposed:false},
    builtins:CONTEXT_HUB_BUILTINS.map(manifestTool),
    registered:(registered.results||[]).map(manifestTool),
    fallbackRoutes:routes.results,
    credentials:(credentials.results||[]).map((x:any)=>({...x,refreshable:Boolean(x.refreshable),metadata:parseStoredJson(x.metadata_json,{})}))
  };
}

async function validateToolEndpoint(c:any,tool:z.infer<typeof toolSchema>){
  if(tool.handlerType==='http_same_origin'&&!isSafeContextEndpoint(tool.endpointRef))return'La ruta HTTP debe ser relativa, comenzar con /api/ y no apuntar al ejecutor del Context Hub';
  if(tool.handlerType==='github_workflow'&&!/^[A-Za-z0-9._-]+\.ya?ml$/.test(tool.endpointRef))return'Usa únicamente el nombre del workflow .yml/.yaml';
  if(tool.handlerType==='resilience_route'){
    const row=await c.env.DB.prepare('SELECT id FROM hector_agent_capability_routes WHERE id=? AND user_id=?').bind(tool.endpointRef,c.get('userId')).first();
    if(!row)return'La ruta de resiliencia no existe o no pertenece al usuario';
  }
  return null;
}

async function resolveTool(c:any,capability:string,toolId?:string):Promise<ResolvedTool|null>{
  const userId=c.get('userId'),key=normalizeCapability(capability);
  if(toolId?.startsWith('builtin:')){
    const found=CONTEXT_HUB_BUILTINS.find(x=>x.id===toolId&&x.capability===key);return found?{...found,source:'builtin'}:null;
  }
  if(toolId){
    const row=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE id=? AND user_id=? AND enabled=1').bind(toolId,userId).first<any>();
    if(!row||row.capability!==key)return null;
    return{...row,source:'registry'} as ResolvedTool;
  }
  const candidates:ResolvedTool[]=[];
  const builtin=builtinTool(key);if(builtin)candidates.push({...builtin,source:'builtin'});
  const registered=(await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE user_id=? AND capability=? AND enabled=1 ORDER BY priority,updated_at DESC').bind(userId,key).all<any>()).results||[];
  candidates.push(...registered.map((row:any)=>({...row,source:'registry'} as ResolvedTool)));
  const routes=await listCapabilityRoutes(c.env,userId,key);
  for(const route of routes){
    if(!['worker','api','github_action'].includes(route.route_kind)||!route.endpoint_ref)continue;
    candidates.push({id:null,capability:key,title:`${route.provider} fallback`,description:`Ruta ${route.route_kind} seleccionada por Fallback Router`,handler_type:'resilience_route',endpoint_ref:route.id,http_method:'POST',priority:Number(route.priority)+200,risk:route.risk,requires_approval:Number(route.requires_approval),enabled:1,input_schema_json:'{}',metadata_json:'{}',source:'fallback-router'});
  }
  return candidates.sort((a,b)=>a.priority-b.priority)[0]||null;
}

function githubInputs(input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))return{};
  const out:Record<string,string>={};
  for(const [key,value] of Object.entries(input as Record<string,unknown>)){
    if(primitive(value))out[key]=String(value);
    else if(value!==undefined)out[key]=JSON.stringify(value);
  }
  return out;
}

async function executeSameOrigin(c:any,endpoint:string,method:string,input:unknown){
  if(!isSafeContextEndpoint(endpoint))throw new Error('Endpoint interno no permitido');
  const url=new URL(endpoint,c.req.url),upper=method.toUpperCase();
  if(upper==='GET'&&input&&typeof input==='object'&&!Array.isArray(input))for(const [key,value] of Object.entries(input as Record<string,unknown>))if(primitive(value))url.searchParams.set(key,String(value));
  const headers:Record<string,string>={Accept:'application/json'};const cookie=c.req.header('Cookie');if(cookie)headers.Cookie=cookie;
  const init:RequestInit={method:upper,headers};
  if(upper!=='GET'){headers['Content-Type']='application/json';init.body=JSON.stringify(input??{});}
  const response=await fetch(url.toString(),init),text=(await response.text()).slice(0,250_000);let data:any=text;
  try{data=text?JSON.parse(text):null;}catch{}
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${typeof data==='string'?data:JSON.stringify(data)}`.slice(0,3000));
  return{status:response.status,data};
}

async function dispatchWorkflow(env:Bindings,workflow:string,input:unknown,metadata:Record<string,unknown>){
  const token=env.GITHUB_RUNNER_TOKEN?.trim();if(!token)throw new Error('GITHUB_RUNNER_TOKEN no configurado');
  if(!/^[A-Za-z0-9._-]+\.ya?ml$/.test(workflow))throw new Error('Workflow no permitido');
  const ref=typeof metadata.ref==='string'&&metadata.ref.trim()?metadata.ref.trim():'main';
  const response=await fetch(`https://api.github.com/repos/Hector35/Hector-IA/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Hector-Context-Hub','Content-Type':'application/json'},body:JSON.stringify({ref,inputs:githubInputs(input)})});
  if(!response.ok){const text=(await response.text()).slice(0,3000);throw new Error(`GitHub rechazó workflow (${response.status}): ${text}`);}
  return{accepted:true,provider:'github-actions',workflow,ref};
}

async function executeResolved(c:any,tool:ResolvedTool,input:unknown){
  if(tool.handler_type==='http_same_origin')return executeSameOrigin(c,tool.endpoint_ref,tool.http_method,input);
  if(tool.handler_type==='github_workflow')return dispatchWorkflow(c.env,tool.endpoint_ref,input,parseStoredJson<Record<string,unknown>>(tool.metadata_json,{}));
  const route=await c.env.DB.prepare('SELECT * FROM hector_agent_capability_routes WHERE id=? AND user_id=?').bind(tool.endpoint_ref,c.get('userId')).first<any>();
  if(!route)throw new Error('Fallback route no disponible');
  if((route.route_kind==='worker'||route.route_kind==='api')&&route.endpoint_ref)return executeSameOrigin(c,route.endpoint_ref,'POST',input);
  if(route.route_kind==='github_action'&&route.endpoint_ref)return dispatchWorkflow(c.env,route.endpoint_ref,input,{});
  throw new Error(`La ruta ${route.route_kind} necesita un adaptador externo antes de ejecutarse desde el backend`);
}

async function createRun(c:any,tool:ResolvedTool,input:unknown,status:string,approvalId:string|null){
  const id=crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO context_hub_tool_runs(id,user_id,tool_id,capability,handler_type,endpoint_ref,http_method,risk,requires_approval,input_json,metadata_json,status,approval_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,c.get('userId'),tool.source==='registry'?tool.id:null,tool.capability,tool.handler_type,tool.endpoint_ref,tool.http_method,tool.risk,tool.requires_approval,JSON.stringify(input??{}),tool.metadata_json,status,approvalId).run();
  return id;
}

async function runTool(c:any,tool:ResolvedTool,input:unknown,existingRunId?:string){
  const runId=existingRunId||await createRun(c,tool,input,'working',null);
  if(existingRunId)await c.env.DB.prepare("UPDATE context_hub_tool_runs SET status='working',started_at=CURRENT_TIMESTAMP,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(runId,c.get('userId')).run();
  try{
    const result=await executeResolved(c,tool,input);
    await c.env.DB.prepare("UPDATE context_hub_tool_runs SET status='completed',result_json=?,error=NULL,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(JSON.stringify(result),runId,c.get('userId')).run();
    return{runId,status:'completed',result};
  }catch(error){
    const message=error instanceof Error?error.message:'Error de ejecución';
    await c.env.DB.prepare("UPDATE context_hub_tool_runs SET status='failed',error=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(message.slice(0,5000),runId,c.get('userId')).run();
    throw Object.assign(new Error(message),{runId});
  }
}

contextHub.get('/manifest',async c=>c.json({name:'Héctor Context Hub',version:'1.0',protocol:'hector-context-hub-v1',basePath:'/api/context-hub',memory:{structured:'D1',largeObjects:'R2',semantic:true},operations:CONTEXT_HUB_BUILTINS.map(x=>({capability:x.capability,method:x.http_method,path:x.endpoint_ref,inputSchema:parseStoredJson(x.input_schema_json,{})}))}));

contextHub.post('/remember',async c=>{
  const parsed=rememberSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Memoria inválida',details:parsed.error.flatten()},400);
  return c.json(await remember(c,parsed.data),201);
});

contextHub.post('/recall',async c=>{
  const parsed=recallSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Consulta inválida',details:parsed.error.flatten()},400);
  return c.json(await recall(c,parsed.data));
});

contextHub.get('/current-state',async c=>c.json(await currentState(c)));
contextHub.get('/history',async c=>{const n=Number(c.req.query('limit')||80),limit=Number.isFinite(n)?Math.min(200,Math.max(1,Math.trunc(n))):80;return c.json(await history(c,limit));});

contextHub.post('/search-everything',async c=>{
  const parsed=searchSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Búsqueda inválida'},400);
  return c.json(await searchEverything(c,parsed.data));
});

contextHub.get('/capabilities',async c=>c.json(await capabilities(c)));

contextHub.post('/snapshots',async c=>{
  const parsed=snapshotSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Snapshot inválido',details:parsed.error.flatten()},400);
  const userId=c.get('userId'),v=parsed.data,fileId=crypto.randomUUID(),recordId=crypto.randomUUID(),key=`context-hub/${userId}/${fileId}`,bytes=new TextEncoder().encode(v.content),summary=v.summary||`Snapshot ${v.name}`;
  await c.env.FILES.put(key,bytes,{httpMetadata:{contentType:v.contentType}});
  try{
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO files(id,user_id,name,object_key,content_type,size_bytes) VALUES(?,?,?,?,?,?)').bind(fileId,userId,v.name,key,v.contentType,bytes.byteLength),
      c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?, 'fact',?,4,'context-hub-r2')").bind(recordId,userId,summary),
      c.env.DB.prepare(`INSERT INTO context_hub_records(id,user_id,memory_id,record_type,subject,content,confidence,source_type,source_ref,tags_json,metadata_json,status) VALUES(?,?,?,'file',?,?,1,'r2',?,?,?,'active')`)
        .bind(recordId,userId,recordId,v.name,summary,`file:${fileId}`,JSON.stringify(v.tags),JSON.stringify({...v.metadata,fileId,sizeBytes:bytes.byteLength,contentType:v.contentType}))
    ]);
  }catch(error){await c.env.FILES.delete(key);throw error;}
  return c.json({fileId,recordId,name:v.name,sizeBytes:bytes.byteLength,sourceRef:`file:${fileId}`},201);
});

contextHub.get('/tools',async c=>c.json({builtins:CONTEXT_HUB_BUILTINS.map(manifestTool),registered:(await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE user_id=? ORDER BY capability,priority,updated_at DESC').bind(c.get('userId')).all<any>()).results.map(manifestTool)}));

contextHub.post('/tools',async c=>{
  const parsed=toolSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Herramienta inválida',details:parsed.error.flatten()},400);
  const v={...parsed.data,capability:normalizeCapability(parsed.data.capability)},validation=await validateToolEndpoint(c,v);if(validation)return c.json({error:validation},400);
  const existing=await c.env.DB.prepare('SELECT id FROM context_hub_tools WHERE user_id=? AND capability=? AND endpoint_ref=?').bind(c.get('userId'),v.capability,v.endpointRef).first<{id:string}>();
  const id=existing?.id||crypto.randomUUID();
  if(existing)await c.env.DB.prepare(`UPDATE context_hub_tools SET title=?,description=?,handler_type=?,http_method=?,priority=?,risk=?,requires_approval=?,enabled=?,input_schema_json=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`)
    .bind(v.title,v.description,v.handlerType,v.httpMethod,v.priority,v.risk,Number(v.requiresApproval),Number(v.enabled),JSON.stringify(v.inputSchema),JSON.stringify(v.metadata),id,c.get('userId')).run();
  else await c.env.DB.prepare(`INSERT INTO context_hub_tools(id,user_id,capability,title,description,handler_type,endpoint_ref,http_method,priority,risk,requires_approval,enabled,input_schema_json,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,c.get('userId'),v.capability,v.title,v.description,v.handlerType,v.endpointRef,v.httpMethod,v.priority,v.risk,Number(v.requiresApproval),Number(v.enabled),JSON.stringify(v.inputSchema),JSON.stringify(v.metadata)).run();
  const row=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE id=? AND user_id=?').bind(id,c.get('userId')).first<any>();
  return c.json({tool:manifestTool(row),created:!existing},existing?200:201);
});

contextHub.patch('/tools/:id',async c=>{
  const parsed=toolPatchSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Cambios inválidos',details:parsed.error.flatten()},400);
  const current=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first<any>();if(!current)return c.json({error:'Herramienta no encontrada'},404);
  const v=parsed.data;
  await c.env.DB.prepare(`UPDATE context_hub_tools SET title=?,description=?,priority=?,risk=?,requires_approval=?,enabled=?,input_schema_json=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`)
    .bind(v.title??current.title,v.description??current.description,v.priority??current.priority,v.risk??current.risk,v.requiresApproval===undefined?current.requires_approval:Number(v.requiresApproval),v.enabled===undefined?current.enabled:Number(v.enabled),v.inputSchema===undefined?current.input_schema_json:JSON.stringify(v.inputSchema),v.metadata===undefined?current.metadata_json:JSON.stringify(v.metadata),current.id,c.get('userId')).run();
  const row=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE id=? AND user_id=?').bind(current.id,c.get('userId')).first<any>();return c.json({tool:manifestTool(row)});
});

contextHub.delete('/tools/:id',async c=>{const result=await c.env.DB.prepare('DELETE FROM context_hub_tools WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).run();if(!result.meta.changes)return c.json({error:'Herramienta no encontrada'},404);return c.json({ok:true});});
contextHub.get('/tool-runs',async c=>c.json({items:(await c.env.DB.prepare('SELECT id,tool_id,capability,handler_type,endpoint_ref,http_method,risk,requires_approval,status,approval_id,result_json,error,started_at,completed_at,created_at,updated_at FROM context_hub_tool_runs WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(c.get('userId')).all<any>()).results.map((x:any)=>({...x,requiresApproval:Boolean(x.requires_approval),result:parseStoredJson(x.result_json,null)}))}));

contextHub.post('/execute',async c=>{
  const parsed=executeSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Ejecución inválida'},400);
  const capability=normalizeCapability(parsed.data.capability),tool=await resolveTool(c,capability,parsed.data.toolId);if(!tool)return c.json({error:'No existe una ruta ejecutable para esa capacidad'},404);
  if(tool.requires_approval){
    const approvalId=crypto.randomUUID(),runId=await createRun(c,tool,parsed.data.input,'waiting_approval',approvalId);
    await c.env.DB.prepare("INSERT INTO hector_agent_approvals(id,user_id,goal_id,action,reason,resources_json,risk,expected_result,status) VALUES(?,?,NULL,?,?,?,?,?,'pending')")
      .bind(approvalId,c.get('userId'),`context_tool:${tool.capability}`,`Context Hub requiere aprobación para ${tool.capability}`,JSON.stringify([tool.endpoint_ref]),tool.risk,`Ejecutar ${tool.capability} y registrar el resultado`).run();
    return c.json({runId,approvalId,status:'WAITING_FOR_USER_APPROVAL',tool:manifestTool(tool)},202);
  }
  try{return c.json(await runTool(c,tool,parsed.data.input));}catch(error:any){return c.json({runId:error?.runId||null,status:'failed',error:error instanceof Error?error.message:'Error de ejecución'},502);}
});

contextHub.post('/resume',async c=>{
  const parsed=resumeSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Reanudación inválida',details:parsed.error.flatten()},400);
  if(parsed.data.goalId&&parsed.data.checkpointId)return c.json(await executeSameOrigin(c,`/api/hector-agent/resilience/goals/${parsed.data.goalId}/checkpoints/${parsed.data.checkpointId}/resume`,'POST',{}));
  const run=await c.env.DB.prepare('SELECT * FROM context_hub_tool_runs WHERE id=? AND user_id=?').bind(parsed.data.runId,c.get('userId')).first<any>();if(!run)return c.json({error:'Ejecución no encontrada'},404);
  if(run.status==='completed')return c.json({runId:run.id,status:'completed',result:parseStoredJson(run.result_json,null)});
  if(run.status==='cancelled')return c.json({error:'La ejecución fue cancelada'},409);
  if(run.approval_id){const approval=await c.env.DB.prepare('SELECT status FROM hector_agent_approvals WHERE id=? AND user_id=?').bind(run.approval_id,c.get('userId')).first<{status:string}>();if(approval?.status==='pending')return c.json({error:'La aprobación sigue pendiente',approvalId:run.approval_id},409);if(approval?.status==='rejected'){await c.env.DB.prepare("UPDATE context_hub_tool_runs SET status='cancelled',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();return c.json({error:'La aprobación fue rechazada'},409);}}
  const tool:ResolvedTool={id:run.tool_id,capability:run.capability,title:run.capability,description:'Reanudación persistente',handler_type:run.handler_type,endpoint_ref:run.endpoint_ref,http_method:run.http_method,priority:100,risk:run.risk,requires_approval:0,enabled:1,input_schema_json:'{}',metadata_json:run.metadata_json||'{}',source:run.tool_id?'registry':'fallback-router'};
  try{return c.json(await runTool(c,tool,parseStoredJson(run.input_json,{}),run.id));}catch(error:any){return c.json({runId:run.id,status:'failed',error:error instanceof Error?error.message:'Error de reanudación'},502);}
});
