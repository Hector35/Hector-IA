import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadContextPack} from '../lib/context';
import {listCapabilityRoutes} from '../lib/hector-agent-resilience';
import {
  CONTEXT_HUB_BUILTINS,CONTEXT_RECORD_TYPES,contextRecordIsCurrent,isSafeContextEndpoint,
  memoryKindForRecord,normalizeCapability,normalizeContextRecordType,parseStoredJson,
  type ContextRecordType,type ContextToolHandler,type ContextToolRisk
} from '../lib/context-hub';

export const contextHub=new Hono<{Bindings:Bindings;Variables:Variables}>();
contextHub.use('*',requireAuth);

const recordType=z.enum(CONTEXT_RECORD_TYPES);
const rememberSchema=z.object({
 recordType:recordType.default('fact'),subject:z.string().trim().min(1).max(240).nullable().optional(),content:z.string().trim().min(2).max(12000),
 confidence:z.number().min(0).max(1).default(.9),validFrom:z.string().datetime({offset:true}).nullable().optional(),validUntil:z.string().datetime({offset:true}).nullable().optional(),
 sourceType:z.string().trim().min(1).max(80).default('manual'),sourceRef:z.string().trim().max(500).nullable().optional(),
 tags:z.array(z.string().trim().min(1).max(80)).max(40).default([]),metadata:z.record(z.string(),z.unknown()).default({}),importance:z.number().int().min(1).max(5).default(3)
}).refine(v=>!v.validFrom||!v.validUntil||Date.parse(v.validFrom)<Date.parse(v.validUntil),{message:'validUntil debe ser posterior a validFrom'});
const recallSchema=z.object({query:z.string().trim().min(2).max(4000),limit:z.number().int().min(1).max(30).default(12),types:z.array(recordType).max(CONTEXT_RECORD_TYPES.length).optional()});
const searchSchema=z.object({query:z.string().trim().min(2).max(2000),limit:z.number().int().min(1).max(50).default(20)});
const snapshotSchema=z.object({name:z.string().trim().min(1).max(180),content:z.string().min(1).max(1_000_000),contentType:z.string().trim().min(3).max(120).default('text/plain; charset=utf-8'),summary:z.string().trim().min(2).max(4000).optional(),tags:z.array(z.string().trim().min(1).max(80)).max(40).default([]),metadata:z.record(z.string(),z.unknown()).default({})});
const toolSchema=z.object({capability:z.string().trim().min(2).max(120),title:z.string().trim().min(2).max(120),description:z.string().trim().min(2).max(1000),handlerType:z.enum(['http_same_origin','github_workflow','resilience_route']),endpointRef:z.string().trim().min(1).max(500),httpMethod:z.enum(['GET','POST','PUT','PATCH','DELETE']).default('POST'),priority:z.number().int().min(0).max(10000).default(100),risk:z.enum(['low','medium','high']).default('low'),requiresApproval:z.boolean().default(false),enabled:z.boolean().default(true),inputSchema:z.record(z.string(),z.unknown()).default({}),metadata:z.record(z.string(),z.unknown()).default({})});
const toolPatchSchema=z.object({title:z.string().trim().min(2).max(120).optional(),description:z.string().trim().min(2).max(1000).optional(),priority:z.number().int().min(0).max(10000).optional(),risk:z.enum(['low','medium','high']).optional(),requiresApproval:z.boolean().optional(),enabled:z.boolean().optional(),inputSchema:z.record(z.string(),z.unknown()).optional(),metadata:z.record(z.string(),z.unknown()).optional()}).refine(v=>Object.keys(v).length>0,'Sin cambios');
const executeSchema=z.object({capability:z.string().trim().min(2).max(120),toolId:z.string().trim().max(120).optional(),input:z.unknown().default({})});
const resumeSchema=z.object({runId:z.string().uuid().optional(),goalId:z.string().uuid().optional(),checkpointId:z.string().uuid().optional()}).refine(v=>Boolean(v.runId||(v.goalId&&v.checkpointId)),{message:'Indica runId o goalId + checkpointId'});

type HubRecord={id:string;user_id:string;memory_id:string|null;record_type:ContextRecordType;subject:string|null;content:string;confidence:number;valid_from:string|null;valid_until:string|null;source_type:string;source_ref:string|null;tags_json:string;metadata_json:string;status:string;supersedes_id:string|null;created_at:string;updated_at:string};
type ResolvedTool={id:string|null;capability:string;title:string;description:string;handler_type:ContextToolHandler;endpoint_ref:string;http_method:string;priority:number;risk:ContextToolRisk;requires_approval:number;enabled:number;input_schema_json:string;metadata_json:string;source:'builtin'|'registry'|'fallback-router'};

function asRecord(row:any){return{id:row.id,type:row.record_type,subject:row.subject,content:row.content,confidence:Number(row.confidence),validFrom:row.valid_from,validUntil:row.valid_until,source:{type:row.source_type,ref:row.source_ref},tags:parseStoredJson<string[]>(row.tags_json,[]),metadata:parseStoredJson<Record<string,unknown>>(row.metadata_json,{}),status:row.status,supersedesId:row.supersedes_id,createdAt:row.created_at,updatedAt:row.updated_at};}
function manifestTool(tool:any){return{id:tool.id,capability:tool.capability,title:tool.title||tool.capability,description:tool.description||'',handlerType:tool.handler_type,endpointRef:tool.endpoint_ref,httpMethod:tool.http_method||'POST',priority:Number(tool.priority||100),risk:tool.risk||'low',requiresApproval:Boolean(tool.requires_approval),enabled:Boolean(tool.enabled),inputSchema:parseStoredJson(tool.input_schema_json,{}),metadata:parseStoredJson(tool.metadata_json,{})};}
function primitive(v:unknown){return typeof v==='string'||typeof v==='number'||typeof v==='boolean';}
function builtinTool(capability:string){return CONTEXT_HUB_BUILTINS.find(x=>x.capability===normalizeCapability(capability));}

async function remember(c:any,input:z.infer<typeof rememberSchema>){
 const uid=c.get('userId'),type=normalizeContextRecordType(input.recordType);
 const duplicate=await c.env.DB.prepare("SELECT * FROM context_hub_records WHERE user_id=? AND record_type=? AND lower(content)=lower(?) AND status='active' LIMIT 1").bind(uid,type,input.content).first() as HubRecord|null;
 if(duplicate)return{item:asRecord(duplicate),deduplicated:true};
 const id=crypto.randomUUID();
 await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,?,?,?,'context-hub')").bind(id,uid,memoryKindForRecord(type),input.content,input.importance),
  c.env.DB.prepare("INSERT INTO context_hub_records(id,user_id,memory_id,record_type,subject,content,confidence,valid_from,valid_until,source_type,source_ref,tags_json,metadata_json,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active')").bind(id,uid,id,type,input.subject??null,input.content,input.confidence,input.validFrom??null,input.validUntil??null,input.sourceType,input.sourceRef??null,JSON.stringify(input.tags),JSON.stringify(input.metadata)),
  c.env.DB.prepare("INSERT INTO audit_log(id,user_id,action,resource_type,resource_id,metadata_json) VALUES(?,?,'context_remember','context_hub_record',?,?)").bind(crypto.randomUUID(),uid,id,JSON.stringify({type,sourceType:input.sourceType}))
 ]);
 const row=await c.env.DB.prepare('SELECT * FROM context_hub_records WHERE id=? AND user_id=?').bind(id,uid).first() as HubRecord|null;
 return{item:row?asRecord(row):{id,type,content:input.content},deduplicated:false};
}

async function recall(c:any,input:z.infer<typeof recallSchema>){
 const uid=c.get('userId'),pack=await loadContextPack(c.env,uid,undefined,input.query),ranked=pack.memories.slice(0,Math.max(input.limit,12));
 if(!ranked.length)return{query:input.query,items:[],selectedCount:0,semanticMemory:true};
 const placeholders=ranked.map(()=>'?').join(','),raw=await c.env.DB.prepare(`SELECT * FROM context_hub_records WHERE user_id=? AND content IN (${placeholders}) ORDER BY updated_at DESC`).bind(uid,...ranked).all();
 const remaining=(raw.results||[]) as HubRecord[],allowed=input.types?new Set(input.types):null,items:any[]=[];
 for(const content of ranked){const i=remaining.findIndex(row=>row.content===content&&contextRecordIsCurrent(row)&&(!allowed||allowed.has(row.record_type)));if(i<0)continue;const [row]=remaining.splice(i,1);items.push({...asRecord(row),rank:items.length+1});if(items.length>=input.limit)break;}
 return{query:input.query,items,selectedCount:items.length,semanticMemory:true};
}

async function currentState(c:any){
 const uid=c.get('userId');
 const [goals,checkpoints,schedules,projects,files,records,runs]=await Promise.all([
  c.env.DB.prepare("SELECT g.id,g.title,g.objective,w.kind,w.status,w.progress,w.result,w.last_error,w.next_retry_at,w.updated_at FROM hector_agent_goals g JOIN work_jobs w ON w.id=g.work_job_id WHERE g.user_id=? ORDER BY w.updated_at DESC LIMIT 25").bind(uid).all(),
  c.env.DB.prepare("SELECT id,goal_id,work_job_id,reason,status,resume_after,approval_id,updated_at FROM hector_agent_resume_checkpoints WHERE user_id=? AND status IN ('ready','waiting_external','waiting_approval','resumed') ORDER BY updated_at DESC LIMIT 25").bind(uid).all(),
  c.env.DB.prepare('SELECT id,title,kind,cadence,autonomy_mode,enabled,next_run_at,last_run_at,run_count,failure_count,updated_at FROM scheduled_tasks WHERE user_id=? ORDER BY updated_at DESC LIMIT 25').bind(uid).all(),
  c.env.DB.prepare('SELECT id,name,template,status,created_at,updated_at FROM app_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 25').bind(uid).all(),
  c.env.DB.prepare('SELECT id,name,content_type,size_bytes,created_at FROM files WHERE user_id=? ORDER BY created_at DESC LIMIT 25').bind(uid).all(),
  c.env.DB.prepare("SELECT * FROM context_hub_records WHERE user_id=? AND status='active' AND record_type IN ('state','project','task','decision','preference') AND (valid_until IS NULL OR valid_until>CURRENT_TIMESTAMP) ORDER BY updated_at DESC LIMIT 40").bind(uid).all(),
  c.env.DB.prepare("SELECT id,capability,status,approval_id,error,created_at,updated_at FROM context_hub_tool_runs WHERE user_id=? AND status NOT IN ('completed','cancelled') ORDER BY updated_at DESC LIMIT 25").bind(uid).all()
 ]);
 return{generatedAt:new Date().toISOString(),goals:goals.results,checkpoints:checkpoints.results,schedules:schedules.results,projects:projects.results,files:files.results,records:((records.results||[]) as HubRecord[]).map(asRecord),toolRuns:runs.results};
}

async function history(c:any,limit:number){
 const uid=c.get('userId'),each=Math.min(100,Math.max(20,limit));
 const [records,events,audit,runs]=await Promise.all([
  c.env.DB.prepare('SELECT id,record_type,subject,content,source_type,source_ref,created_at,updated_at FROM context_hub_records WHERE user_id=? ORDER BY updated_at DESC LIMIT ?').bind(uid,each).all(),
  c.env.DB.prepare('SELECT e.id,e.message,e.progress,e.created_at,w.kind,w.id work_job_id FROM work_events e JOIN work_jobs w ON w.id=e.job_id WHERE w.user_id=? ORDER BY e.created_at DESC LIMIT ?').bind(uid,each).all(),
  c.env.DB.prepare('SELECT id,action,resource_type,resource_id,metadata_json,created_at FROM audit_log WHERE user_id=? ORDER BY created_at DESC LIMIT ?').bind(uid,each).all(),
  c.env.DB.prepare('SELECT id,capability,status,result_json,error,created_at,updated_at FROM context_hub_tool_runs WHERE user_id=? ORDER BY updated_at DESC LIMIT ?').bind(uid,each).all()
 ]);
 const timeline=[
  ...((records.results||[]) as any[]).map(x=>({type:'memory',id:x.id,at:x.updated_at,title:x.subject||x.record_type,detail:x.content,source:x.source_type,sourceRef:x.source_ref})),
  ...((events.results||[]) as any[]).map(x=>({type:'work',id:x.id,at:x.created_at,title:x.kind,detail:x.message,progress:x.progress,workJobId:x.work_job_id})),
  ...((audit.results||[]) as any[]).map(x=>({type:'audit',id:x.id,at:x.created_at,title:x.action,detail:x.resource_type,resourceId:x.resource_id,metadata:parseStoredJson(x.metadata_json,{})})),
  ...((runs.results||[]) as any[]).map(x=>({type:'tool',id:x.id,at:x.updated_at,title:x.capability,detail:x.status,result:parseStoredJson(x.result_json,null),error:x.error}))
 ].sort((a:any,b:any)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,limit);
 return{items:timeline,count:timeline.length};
}

async function searchEverything(c:any,input:z.infer<typeof searchSchema>){
 const uid=c.get('userId'),term=`%${input.query.toLowerCase()}%`,pack=await loadContextPack(c.env,uid,undefined,input.query);
 const [records,files,goals,messages,projects,tools,routes]=await Promise.all([
  c.env.DB.prepare("SELECT * FROM context_hub_records WHERE user_id=? AND status='active' AND (lower(content) LIKE ? OR lower(COALESCE(subject,'')) LIKE ? OR lower(tags_json) LIKE ?) ORDER BY updated_at DESC LIMIT ?").bind(uid,term,term,term,input.limit).all(),
  c.env.DB.prepare('SELECT id,name,content_type,size_bytes,created_at FROM files WHERE user_id=? AND lower(name) LIKE ? ORDER BY created_at DESC LIMIT ?').bind(uid,term,input.limit).all(),
  c.env.DB.prepare("SELECT g.id,g.title,g.objective,w.status,w.progress,w.result,w.updated_at FROM hector_agent_goals g JOIN work_jobs w ON w.id=g.work_job_id WHERE g.user_id=? AND (lower(g.title) LIKE ? OR lower(g.objective) LIKE ? OR lower(COALESCE(w.result,'')) LIKE ?) ORDER BY w.updated_at DESC LIMIT ?").bind(uid,term,term,term,input.limit).all(),
  c.env.DB.prepare('SELECT m.id,m.conversation_id,m.role,m.content,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=? AND lower(m.content) LIKE ? ORDER BY m.created_at DESC LIMIT ?').bind(uid,term,input.limit).all(),
  c.env.DB.prepare('SELECT id,name,template,status,updated_at FROM app_projects WHERE user_id=? AND (lower(name) LIKE ? OR lower(template) LIKE ?) ORDER BY updated_at DESC LIMIT ?').bind(uid,term,term,input.limit).all(),
  c.env.DB.prepare('SELECT id,capability,title,description,handler_type,endpoint_ref,risk,requires_approval,enabled,priority FROM context_hub_tools WHERE user_id=? AND (lower(capability) LIKE ? OR lower(title) LIKE ? OR lower(description) LIKE ?) ORDER BY priority LIMIT ?').bind(uid,term,term,term,input.limit).all(),
  c.env.DB.prepare("SELECT id,capability,provider,route_kind,endpoint_ref,priority,enabled,requires_approval,risk,failure_count,cooldown_until,last_error,last_success_at FROM hector_agent_capability_routes WHERE user_id=? AND (lower(capability) LIKE ? OR lower(provider) LIKE ? OR lower(COALESCE(endpoint_ref,'')) LIKE ?) ORDER BY priority LIMIT ?").bind(uid,term,term,term,input.limit).all()
 ]);
 return{query:input.query,semanticMemory:pack.memories.slice(0,input.limit),records:((records.results||[]) as HubRecord[]).map(asRecord),files:files.results,goals:goals.results,messages:messages.results,projects:projects.results,tools:tools.results,routes:routes.results};
}

async function capabilities(c:any){
 const uid=c.get('userId'),[registered,routes,credentials]=await Promise.all([
  c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE user_id=? ORDER BY capability,priority,updated_at DESC').bind(uid).all(),
  c.env.DB.prepare('SELECT id,capability,provider,route_kind,endpoint_ref,priority,enabled,requires_approval,risk,failure_count,cooldown_until,last_error,last_success_at FROM hector_agent_capability_routes WHERE user_id=? ORDER BY capability,priority,failure_count').bind(uid).all(),
  c.env.DB.prepare('SELECT id,provider,auth_type,status,refreshable,expires_at,last_verified_at,metadata_json FROM hector_agent_credentials WHERE user_id=? ORDER BY provider,updated_at DESC').bind(uid).all()
 ]);
 return{architecture:{contextHub:true,memoryVault:'D1+R2',semanticMemory:true,toolRegistry:true,fallbackRouter:true,credentialBroker:true,approvalGateway:true,persistentResume:true,secretsExposed:false},builtins:CONTEXT_HUB_BUILTINS.map(manifestTool),registered:((registered.results||[]) as any[]).map(manifestTool),fallbackRoutes:routes.results,credentials:((credentials.results||[]) as any[]).map(x=>({...x,refreshable:Boolean(x.refreshable),metadata:parseStoredJson(x.metadata_json,{})}))};
}

async function validateTool(c:any,tool:z.infer<typeof toolSchema>){
 if(tool.handlerType==='http_same_origin'&&!isSafeContextEndpoint(tool.endpointRef))return'La ruta HTTP debe ser relativa, comenzar con /api/ y no apuntar al ejecutor del Context Hub';
 if(tool.handlerType==='github_workflow'&&!/^[A-Za-z0-9._-]+\.ya?ml$/.test(tool.endpointRef))return'Usa únicamente el nombre del workflow .yml/.yaml';
 if(tool.handlerType==='resilience_route'){const row=await c.env.DB.prepare('SELECT id FROM hector_agent_capability_routes WHERE id=? AND user_id=?').bind(tool.endpointRef,c.get('userId')).first();if(!row)return'La ruta de resiliencia no existe o no pertenece al usuario';}
 return null;
}

async function resolveTool(c:any,capability:string,toolId?:string):Promise<ResolvedTool|null>{
 const uid=c.get('userId'),key=normalizeCapability(capability);
 if(toolId?.startsWith('builtin:')){const found=CONTEXT_HUB_BUILTINS.find(x=>x.id===toolId&&x.capability===key);return found?{...found,source:'builtin'}:null;}
 if(toolId){const row=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE id=? AND user_id=? AND enabled=1').bind(toolId,uid).first() as any;if(!row||row.capability!==key)return null;return{...row,source:'registry'} as ResolvedTool;}
 const candidates:ResolvedTool[]=[],builtin=builtinTool(key);if(builtin)candidates.push({...builtin,source:'builtin'});
 const reg=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE user_id=? AND capability=? AND enabled=1 ORDER BY priority,updated_at DESC').bind(uid,key).all();candidates.push(...((reg.results||[]) as any[]).map(row=>({...row,source:'registry'} as ResolvedTool)));
 for(const route of await listCapabilityRoutes(c.env,uid,key))if(['worker','api','github_action'].includes(route.route_kind)&&route.endpoint_ref)candidates.push({id:null,capability:key,title:`${route.provider} fallback`,description:`Ruta ${route.route_kind} seleccionada por Fallback Router`,handler_type:'resilience_route',endpoint_ref:route.id,http_method:'POST',priority:Number(route.priority)+200,risk:route.risk,requires_approval:Number(route.requires_approval),enabled:1,input_schema_json:'{}',metadata_json:'{}',source:'fallback-router'});
 return candidates.sort((a,b)=>a.priority-b.priority)[0]||null;
}

function githubInputs(input:unknown){const out:Record<string,string>={};if(!input||typeof input!=='object'||Array.isArray(input))return out;for(const [k,v] of Object.entries(input as Record<string,unknown>))if(primitive(v))out[k]=String(v);else if(v!==undefined)out[k]=JSON.stringify(v);return out;}
async function sameOrigin(c:any,endpoint:string,method:string,input:unknown){
 if(!isSafeContextEndpoint(endpoint))throw new Error('Endpoint interno no permitido');const url=new URL(endpoint,c.req.url),upper=method.toUpperCase();
 if(upper==='GET'&&input&&typeof input==='object'&&!Array.isArray(input))for(const [k,v] of Object.entries(input as Record<string,unknown>))if(primitive(v))url.searchParams.set(k,String(v));
 const headers:Record<string,string>={Accept:'application/json'},cookie=c.req.header('Cookie');if(cookie)headers.Cookie=cookie;const init:RequestInit={method:upper,headers};if(upper!=='GET'){headers['Content-Type']='application/json';init.body=JSON.stringify(input??{});}
 let response:Response;
 if(url.pathname==='/api/context-hub'||url.pathname.startsWith('/api/context-hub/')){
  const localUrl=new URL(url.toString());localUrl.pathname=url.pathname.slice('/api/context-hub'.length)||'/';
  response=await contextHub.fetch(new Request(localUrl.toString(),init),c.env,c.executionCtx);
 }else response=await fetch(url.toString(),init);
 const text=(await response.text()).slice(0,250000);let data:any=text;try{data=text?JSON.parse(text):null}catch{}if(!response.ok)throw new Error(`HTTP ${response.status}: ${typeof data==='string'?data:JSON.stringify(data)}`.slice(0,3000));return{status:response.status,data};
}
async function dispatchWorkflow(env:Bindings,workflow:string,input:unknown,metadata:Record<string,unknown>){
 const token=env.GITHUB_RUNNER_TOKEN?.trim();if(!token)throw new Error('GITHUB_RUNNER_TOKEN no configurado');if(!/^[A-Za-z0-9._-]+\.ya?ml$/.test(workflow))throw new Error('Workflow no permitido');const ref=typeof metadata.ref==='string'&&metadata.ref.trim()?metadata.ref.trim():'main';
 const r=await fetch(`https://api.github.com/repos/Hector35/Hector-IA/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Hector-Context-Hub','Content-Type':'application/json'},body:JSON.stringify({ref,inputs:githubInputs(input)})});if(!r.ok)throw new Error(`GitHub rechazó workflow (${r.status}): ${(await r.text()).slice(0,2000)}`);return{accepted:true,provider:'github-actions',workflow,ref};
}
async function executeResolved(c:any,tool:ResolvedTool,input:unknown){
 if(tool.handler_type==='http_same_origin')return sameOrigin(c,tool.endpoint_ref,tool.http_method,input);if(tool.handler_type==='github_workflow')return dispatchWorkflow(c.env,tool.endpoint_ref,input,parseStoredJson<Record<string,unknown>>(tool.metadata_json,{}));
 const route=await c.env.DB.prepare('SELECT * FROM hector_agent_capability_routes WHERE id=? AND user_id=?').bind(tool.endpoint_ref,c.get('userId')).first() as any;if(!route)throw new Error('Fallback route no disponible');if(route.route_kind==='worker'&&route.endpoint_ref)return sameOrigin(c,route.endpoint_ref,'POST',input);if(route.route_kind==='github_action'&&route.endpoint_ref)return dispatchWorkflow(c.env,route.endpoint_ref,input,{});throw new Error(`La ruta ${route.route_kind} necesita un adaptador autenticado antes de ejecutarse desde Context Hub`);
}
async function createRun(c:any,tool:ResolvedTool,input:unknown,status:string,approvalId:string|null){const id=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO context_hub_tool_runs(id,user_id,tool_id,capability,handler_type,endpoint_ref,http_method,risk,requires_approval,input_json,metadata_json,status,approval_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,c.get('userId'),tool.source==='registry'?tool.id:null,tool.capability,tool.handler_type,tool.endpoint_ref,tool.http_method,tool.risk,tool.requires_approval,JSON.stringify(input??{}),tool.metadata_json,status,approvalId).run();return id;}
async function runTool(c:any,tool:ResolvedTool,input:unknown,runId?:string){const id=runId||await createRun(c,tool,input,'working',null);if(runId)await c.env.DB.prepare("UPDATE context_hub_tool_runs SET status='working',started_at=CURRENT_TIMESTAMP,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,c.get('userId')).run();try{const result=await executeResolved(c,tool,input);await c.env.DB.prepare("UPDATE context_hub_tool_runs SET status='completed',result_json=?,error=NULL,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(JSON.stringify(result),id,c.get('userId')).run();return{runId:id,status:'completed',result};}catch(e){const message=e instanceof Error?e.message:'Error de ejecución';await c.env.DB.prepare("UPDATE context_hub_tool_runs SET status='failed',error=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(message.slice(0,5000),id,c.get('userId')).run();throw Object.assign(new Error(message),{runId:id});}}

contextHub.get('/manifest',c=>c.json({name:'Héctor Context Hub',version:'1.0',protocol:'hector-context-hub-v1',basePath:'/api/context-hub',memory:{structured:'D1',largeObjects:'R2',semantic:true},operations:CONTEXT_HUB_BUILTINS.map(x=>({capability:x.capability,method:x.http_method,path:x.endpoint_ref,inputSchema:parseStoredJson(x.input_schema_json,{})}))}));
contextHub.post('/remember',async c=>{const p=rememberSchema.safeParse(await c.req.json().catch(()=>null));if(!p.success)return c.json({error:'Memoria inválida',details:p.error.flatten()},400);return c.json(await remember(c,p.data),201);});
contextHub.post('/recall',async c=>{const p=recallSchema.safeParse(await c.req.json().catch(()=>null));if(!p.success)return c.json({error:'Consulta inválida',details:p.error.flatten()},400);return c.json(await recall(c,p.data));});
contextHub.get('/current-state',async c=>c.json(await currentState(c)));
contextHub.get('/history',async c=>{const n=Number(c.req.query('limit')||80),limit=Number.isFinite(n)?Math.min(200,Math.max(1,Math.trunc(n))):80;return c.json(await history(c,limit));});
contextHub.post('/search-everything',async c=>{const p=searchSchema.safeParse(await c.req.json().catch(()=>null));if(!p.success)return c.json({error:'Búsqueda inválida'},400);return c.json(await searchEverything(c,p.data));});
contextHub.get('/capabilities',async c=>c.json(await capabilities(c)));

contextHub.post('/snapshots',async c=>{
 const p=snapshotSchema.safeParse(await c.req.json().catch(()=>null));if(!p.success)return c.json({error:'Snapshot inválido',details:p.error.flatten()},400);const uid=c.get('userId'),v=p.data,fileId=crypto.randomUUID(),recordId=crypto.randomUUID(),key=`context-hub/${uid}/${fileId}`,bytes=new TextEncoder().encode(v.content),summary=v.summary||`Snapshot ${v.name}`;
 await c.env.FILES.put(key,bytes,{httpMetadata:{contentType:v.contentType}});try{await c.env.DB.batch([c.env.DB.prepare('INSERT INTO files(id,user_id,name,object_key,content_type,size_bytes) VALUES(?,?,?,?,?,?)').bind(fileId,uid,v.name,key,v.contentType,bytes.byteLength),c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?, 'fact',?,4,'context-hub-r2')").bind(recordId,uid,summary),c.env.DB.prepare("INSERT INTO context_hub_records(id,user_id,memory_id,record_type,subject,content,confidence,source_type,source_ref,tags_json,metadata_json,status) VALUES(?,?,?,'file',?,?,1,'r2',?,?,?,'active')").bind(recordId,uid,recordId,v.name,summary,`file:${fileId}`,JSON.stringify(v.tags),JSON.stringify({...v.metadata,fileId,sizeBytes:bytes.byteLength,contentType:v.contentType}))]);}catch(e){await c.env.FILES.delete(key);throw e;}return c.json({fileId,recordId,name:v.name,sizeBytes:bytes.byteLength,sourceRef:`file:${fileId}`},201);
});

contextHub.get('/tools',async c=>{const rows=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE user_id=? ORDER BY capability,priority,updated_at DESC').bind(c.get('userId')).all();return c.json({builtins:CONTEXT_HUB_BUILTINS.map(manifestTool),registered:((rows.results||[]) as any[]).map(manifestTool)});});
contextHub.post('/tools',async c=>{
 const p=toolSchema.safeParse(await c.req.json().catch(()=>null));if(!p.success)return c.json({error:'Herramienta inválida',details:p.error.flatten()},400);const v={...p.data,capability:normalizeCapability(p.data.capability)},invalid=await validateTool(c,v);if(invalid)return c.json({error:invalid},400);
 const existing=await c.env.DB.prepare('SELECT id FROM context_hub_tools WHERE user_id=? AND capability=? AND endpoint_ref=?').bind(c.get('userId'),v.capability,v.endpointRef).first() as any,id=existing?.id||crypto.randomUUID();
 if(existing)await c.env.DB.prepare('UPDATE context_hub_tools SET title=?,description=?,handler_type=?,http_method=?,priority=?,risk=?,requires_approval=?,enabled=?,input_schema_json=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').bind(v.title,v.description,v.handlerType,v.httpMethod,v.priority,v.risk,Number(v.requiresApproval),Number(v.enabled),JSON.stringify(v.inputSchema),JSON.stringify(v.metadata),id,c.get('userId')).run();else await c.env.DB.prepare('INSERT INTO context_hub_tools(id,user_id,capability,title,description,handler_type,endpoint_ref,http_method,priority,risk,requires_approval,enabled,input_schema_json,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,c.get('userId'),v.capability,v.title,v.description,v.handlerType,v.endpointRef,v.httpMethod,v.priority,v.risk,Number(v.requiresApproval),Number(v.enabled),JSON.stringify(v.inputSchema),JSON.stringify(v.metadata)).run();
 const row=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE id=? AND user_id=?').bind(id,c.get('userId')).first();return c.json({tool:manifestTool(row),created:!existing},existing?200:201);
});
contextHub.patch('/tools/:id',async c=>{const p=toolPatchSchema.safeParse(await c.req.json().catch(()=>null));if(!p.success)return c.json({error:'Cambios inválidos',details:p.error.flatten()},400);const cur=await c.env.DB.prepare('SELECT * FROM context_hub_tools WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first() as any;if(!cur)return c.json({error:'Herramienta no encontrada'},404);const v=p.data;await c.env.DB.prepare('UPDATE context_hub_tools SET title=?,description=?,priority=?,risk=?,requires_approval=?,enabled=?,input_schema_json=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').bind(v.title??cur.title,v.description??cur.description,v.priority??cur.priority,v.risk??cur.risk,v.requiresApproval===undefined?cur.requires_approval:Number(v.requiresApproval),v.enabled===undefined?cur.enabled:Number(v.enabled),v.inputSchema===undefined?cur.input_schema_json:JSON.stringify(v.inputSchema),v.metadata===undefined?cur.metadata_json:JSON.stringify(v.metadata),cur.id,c.get('userId')).run();return c.json({ok:true});});
contextHub.delete('/tools/:id',async c=>{const r=await c.env.DB.prepare('DELETE FROM context_hub_tools WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).run();if(!r.meta.changes)return c.json({error:'Herramienta no encontrada'},404);return c.json({ok:true});});
contextHub.get('/tool-runs',async c=>{const rows=await c.env.DB.prepare('SELECT id,tool_id,capability,handler_type,endpoint_ref,http_method,risk,requires_approval,status,approval_id,result_json,error,started_at,completed_at,created_at,updated_at FROM context_hub_tool_runs WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(c.get('userId')).all();return c.json({items:((rows.results||[]) as any[]).map(x=>({...x,requiresApproval:Boolean(x.requires_approval),result:parseStoredJson(x.result_json,null)}))});});

contextHub.post('/execute',async c=>{
 const p=executeSchema.safeParse(await c.req.json().catch(()=>null));if(!p.success)return c.json({error:'Ejecución inválida'},400);const tool=await resolveTool(c,p.data.capability,p.data.toolId);if(!tool)return c.json({error:'No existe una ruta ejecutable para esa capacidad'},404);
 if(tool.requires_approval){const approvalId=crypto.randomUUID(),runId=await createRun(c,tool,p.data.input,'waiting_approval',approvalId);await c.env.DB.prepare("INSERT INTO hector_agent_approvals(id,user_id,goal_id,action,reason,resources_json,risk,expected_result,status) VALUES(?,?,NULL,?,?,?,?,?,'pending')").bind(approvalId,c.get('userId'),`context_tool:${tool.capability}`,`Context Hub requiere aprobación para ${tool.capability}`,JSON.stringify([tool.endpoint_ref]),tool.risk,`Ejecutar ${tool.capability} y registrar el resultado`).run();return c.json({runId,approvalId,status:'WAITING_FOR_USER_APPROVAL',tool:manifestTool(tool)},202);}
 try{return c.json(await runTool(c,tool,p.data.input));}catch(e:any){return c.json({runId:e?.runId||null,status:'failed',error:e instanceof Error?e.message:'Error de ejecución'},502);}
});

contextHub.post('/resume',async c=>{
 const p=resumeSchema.safeParse(await c.req.json().catch(()=>null));if(!p.success)return c.json({error:'Reanudación inválida',details:p.error.flatten()},400);
 if(p.data.goalId&&p.data.checkpointId)return c.json(await sameOrigin(c,`/api/hector-agent/resilience/goals/${p.data.goalId}/checkpoints/${p.data.checkpointId}/resume`,'POST',{}));
 const run=await c.env.DB.prepare('SELECT * FROM context_hub_tool_runs WHERE id=? AND user_id=?').bind(p.data.runId,c.get('userId')).first() as any;if(!run)return c.json({error:'Ejecución no encontrada'},404);if(run.status==='completed')return c.json({runId:run.id,status:'completed',result:parseStoredJson(run.result_json,null)});if(run.status==='cancelled')return c.json({error:'La ejecución fue cancelada'},409);
 if(run.approval_id){const approval=await c.env.DB.prepare('SELECT status FROM hector_agent_approvals WHERE id=? AND user_id=?').bind(run.approval_id,c.get('userId')).first() as any;if(approval?.status==='pending')return c.json({error:'La aprobación sigue pendiente',approvalId:run.approval_id},409);if(approval?.status==='rejected')return c.json({error:'La aprobación fue rechazada'},409);}
 const tool:ResolvedTool={id:run.tool_id,capability:run.capability,title:run.capability,description:'Reanudación persistente',handler_type:run.handler_type,endpoint_ref:run.endpoint_ref,http_method:run.http_method,priority:100,risk:run.risk,requires_approval:0,enabled:1,input_schema_json:'{}',metadata_json:run.metadata_json||'{}',source:run.tool_id?'registry':'fallback-router'};
 try{return c.json(await runTool(c,tool,parseStoredJson(run.input_json,{}),run.id));}catch(e:any){return c.json({runId:run.id,status:'failed',error:e instanceof Error?e.message:'Error de reanudación'},502);}
});