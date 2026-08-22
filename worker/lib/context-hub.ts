export const CONTEXT_RECORD_TYPES=['fact','decision','project','task','preference','person','file','state','event'] as const;
export type ContextRecordType=typeof CONTEXT_RECORD_TYPES[number];
export type ContextToolHandler='http_same_origin'|'github_workflow'|'resilience_route';
export type ContextToolRisk='low'|'medium'|'high';

export type ContextHubBuiltinTool={
  id:string;
  capability:string;
  title:string;
  description:string;
  handler_type:'http_same_origin';
  endpoint_ref:string;
  http_method:'GET'|'POST';
  priority:number;
  risk:ContextToolRisk;
  requires_approval:number;
  enabled:number;
  input_schema_json:string;
  metadata_json:string;
  builtin:true;
};

export const CONTEXT_HUB_BUILTINS:ContextHubBuiltinTool[]=[
  {id:'builtin:remember',capability:'context.remember',title:'Recordar',description:'Guarda un hecho, decisión, preferencia, proyecto, tarea, persona, archivo, estado o evento en la memoria compartida.',handler_type:'http_same_origin',endpoint_ref:'/api/context-hub/remember',http_method:'POST',priority:10,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object","required":["content"]}',metadata_json:'{}',builtin:true},
  {id:'builtin:recall',capability:'context.recall',title:'Recordar contexto',description:'Recupera recuerdos relevantes mediante la memoria semántica existente y metadatos del Context Hub.',handler_type:'http_same_origin',endpoint_ref:'/api/context-hub/recall',http_method:'POST',priority:10,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object","required":["query"]}',metadata_json:'{}',builtin:true},
  {id:'builtin:state',capability:'context.current_state',title:'Estado actual',description:'Devuelve objetivos, checkpoints, tareas programadas, proyectos, archivos y contexto activo.',handler_type:'http_same_origin',endpoint_ref:'/api/context-hub/current-state',http_method:'GET',priority:10,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object"}',metadata_json:'{}',builtin:true},
  {id:'builtin:history',capability:'context.history',title:'Historial',description:'Reconstruye una línea de tiempo común de memoria, trabajo, auditoría y herramientas.',handler_type:'http_same_origin',endpoint_ref:'/api/context-hub/history',http_method:'GET',priority:10,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object","properties":{"limit":{"type":"number"}}}',metadata_json:'{}',builtin:true},
  {id:'builtin:search',capability:'context.search_everything',title:'Buscar en todo',description:'Busca memoria, archivos, conversaciones, objetivos, proyectos y capacidades conocidas.',handler_type:'http_same_origin',endpoint_ref:'/api/context-hub/search-everything',http_method:'POST',priority:10,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object","required":["query"]}',metadata_json:'{}',builtin:true},
  {id:'builtin:capabilities',capability:'context.capabilities',title:'Capacidades',description:'Expone herramientas internas, rutas de fallback y credenciales disponibles sin revelar secretos.',handler_type:'http_same_origin',endpoint_ref:'/api/context-hub/capabilities',http_method:'GET',priority:10,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object"}',metadata_json:'{}',builtin:true},
  {id:'builtin:resume',capability:'context.resume',title:'Reanudar',description:'Reanuda una ejecución del Tool Registry o un checkpoint persistente de Héctor Agent.',handler_type:'http_same_origin',endpoint_ref:'/api/context-hub/resume',http_method:'POST',priority:10,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object"}',metadata_json:'{}',builtin:true},
  {id:'builtin:snapshot',capability:'context.snapshot',title:'Snapshot R2',description:'Guarda un snapshot textual grande en R2 y lo enlaza a la memoria compartida.',handler_type:'http_same_origin',endpoint_ref:'/api/context-hub/snapshots',http_method:'POST',priority:10,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object","required":["name","content"]}',metadata_json:'{}',builtin:true},
  {id:'builtin:files',capability:'files.list',title:'Archivos',description:'Lista metadatos de archivos privados ya disponibles en R2.',handler_type:'http_same_origin',endpoint_ref:'/api/files',http_method:'GET',priority:20,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object"}',metadata_json:'{}',builtin:true},
  {id:'builtin:agent-dashboard',capability:'agent.dashboard',title:'Héctor Agent',description:'Lee el panel operativo actual de Héctor Agent.',handler_type:'http_same_origin',endpoint_ref:'/api/hector-agent/dashboard',http_method:'GET',priority:20,risk:'low',requires_approval:0,enabled:1,input_schema_json:'{"type":"object"}',metadata_json:'{}',builtin:true}
];

export function normalizeContextRecordType(value:string|undefined|null):ContextRecordType{
  const normalized=String(value||'fact').trim().toLowerCase();
  return (CONTEXT_RECORD_TYPES as readonly string[]).includes(normalized)?normalized as ContextRecordType:'fact';
}

export function memoryKindForRecord(type:ContextRecordType){
  if(type==='preference'||type==='decision'||type==='project')return type;
  return 'fact';
}

function parseTime(value:string|null|undefined){
  if(!value)return null;
  const n=Date.parse(value.includes('T')?value:`${value.replace(' ','T')}Z`);
  return Number.isFinite(n)?n:null;
}

export function contextRecordIsCurrent(record:{status?:string;valid_from?:string|null;valid_until?:string|null},now=Date.now()){
  if(record.status&&record.status!=='active')return false;
  const from=parseTime(record.valid_from),until=parseTime(record.valid_until);
  if(from!==null&&from>now)return false;
  if(until!==null&&until<=now)return false;
  return true;
}

export function isSafeContextEndpoint(endpoint:string){
  if(!endpoint.startsWith('/api/'))return false;
  if(endpoint.startsWith('/api/context-hub/execute'))return false;
  if(endpoint.includes('://')||endpoint.includes('..'))return false;
  return true;
}

export function normalizeCapability(value:string){
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'.').replace(/^\.+|\.+$/g,'').slice(0,120);
}

export function parseStoredJson<T>(value:string|null|undefined,fallback:T):T{
  try{return value?JSON.parse(value) as T:fallback;}catch{return fallback;}
}
