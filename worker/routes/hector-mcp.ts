import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {authHasScope,requireAuth} from '../lib/auth';
import {hectorBridge} from './hector-bridge';
import {contextHub} from './context-hub';
import {contextSync} from './context-sync';
import {hectorCapabilities} from './hector-capabilities';
import {hectorMemory} from './hector-memory';

export const hectorMcp=new Hono<{Bindings:Bindings;Variables:Variables}>();
hectorMcp.use('*',requireAuth);

type ToolDef={name:string;description:string;scope:string;method:'GET'|'POST';path:string;target:'bridge'|'context'|'sync'|'capabilities'|'memory';inputSchema:Record<string,unknown>;wrap?: (args:any)=>any};

const TOOLS:ToolDef[]=[
 {name:'context_search',description:'Busca en memoria, conversaciones, objetivos, proyectos, archivos y capacidades compartidas de Héctor.',scope:'context',method:'POST',path:'/search-everything',target:'context',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'number'}},required:['query'],additionalProperties:false}},
 {name:'context_recall',description:'Recupera memoria semántica relevante y trazable.',scope:'context',method:'POST',path:'/recall',target:'context',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'number'}},required:['query'],additionalProperties:false}},
 {name:'context_remember',description:'Guarda memoria estructurada compartida con procedencia, confianza y vigencia.',scope:'context',method:'POST',path:'/remember',target:'context',inputSchema:{type:'object',properties:{recordType:{type:'string'},subject:{type:['string','null']},content:{type:'string'},confidence:{type:'number'},tags:{type:'array',items:{type:'string'}},importance:{type:'number'}},required:['content'],additionalProperties:true}},
 {name:'context_upsert',description:'Actualiza memoria mutable por sujeto y tipo, supersediendo versiones viejas para evitar contradicciones activas.',scope:'context',method:'POST',path:'/upsert',target:'memory',inputSchema:{type:'object',properties:{recordType:{type:'string'},subject:{type:'string'},content:{type:'string'},confidence:{type:'number'},tags:{type:'array',items:{type:'string'}},importance:{type:'number'},strategy:{type:'string',enum:['auto','supersede','append']}},required:['subject','content'],additionalProperties:true}},
 {name:'context_current_state',description:'Obtiene estado compartido actual: objetivos, checkpoints, tareas, proyectos, archivos y contexto activo.',scope:'context',method:'GET',path:'/current-state',target:'context',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'context_sync_bootstrap',description:'Reconstruye contexto cross-chat antes de trabajo sustancial.',scope:'context',method:'POST',path:'/bootstrap',target:'sync',inputSchema:{type:'object',properties:{chatRef:{type:'string'},client:{type:'string'},topic:{type:'string'},query:{type:'string'}},required:['chatRef'],additionalProperties:false}},
 {name:'context_sync_commit',description:'Publica un handoff estructurado para que otros chats/agentes continúen con las mismas decisiones y estado.',scope:'context',method:'POST',path:'/commit',target:'sync',inputSchema:{type:'object',properties:{chatRef:{type:'string'},client:{type:'string'},topic:{type:'string'},summary:{type:'string'},decisions:{type:'array',items:{type:'string'}},actions:{type:'array',items:{type:'string'}},nextSteps:{type:'array',items:{type:'string'}},blockers:{type:'array',items:{type:'string'}},resources:{type:'array',items:{type:'string'}}},required:['chatRef','summary'],additionalProperties:false}},
 {name:'capabilities_list',description:'Lista el Tool Broker, rutas de fallback y credenciales disponibles sin exponer secretos.',scope:'tools',method:'GET',path:'/list',target:'capabilities',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'capability_execute',description:'Ejecuta una capacidad mediante el router de fallback legítimo, con clasificación de fallos y trazas.',scope:'tools',method:'POST',path:'/execute',target:'capabilities',inputSchema:{type:'object',properties:{capability:{type:'string'},input:{type:'object'}},required:['capability'],additionalProperties:false}},
 {name:'job_create',description:'Crea un objetivo persistente de Héctor Agent que continúa por cron aunque ChatGPT o la PWA se cierren.',scope:'jobs',method:'POST',path:'/jobs/create',target:'bridge',inputSchema:{type:'object',properties:{objective:{type:'string'}},required:['objective'],additionalProperties:false}},
 {name:'pwa_inspect',description:'Verifica por red una PWA HTTPS: estado HTTP, título, manifest, service worker y cabeceras relevantes.',scope:'tools',method:'POST',path:'/tools/execute',target:'bridge',wrap:(args:any)=>({name:'pwa.inspect',input:args}),inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url'],additionalProperties:false}},
 {name:'bridge_status',description:'Devuelve el estado operativo del Bridge, memoria, jobs y resiliencia.',scope:'bridge',method:'GET',path:'/status',target:'bridge',inputSchema:{type:'object',properties:{},additionalProperties:false}}
];

function jsonRpc(id:unknown,result:unknown){return{jsonrpc:'2.0',id:id??null,result};}
function rpcError(id:unknown,code:number,message:string,data?:unknown){return{jsonrpc:'2.0',id:id??null,error:{code,message,...(data===undefined?{}:{data})}};}
function authHeaders(c:any){const h=new Headers({'Accept':'application/json','Content-Type':'application/json'}),authorization=c.req.header('Authorization'),cookie=c.req.header('Cookie'),requestId=c.req.header('X-Request-ID');if(authorization)h.set('Authorization',authorization);if(cookie)h.set('Cookie',cookie);if(requestId)h.set('X-Request-ID',requestId);return h;}
function subApp(tool:ToolDef){return tool.target==='bridge'?hectorBridge:tool.target==='context'?contextHub:tool.target==='sync'?contextSync:tool.target==='memory'?hectorMemory:hectorCapabilities;}
async function callTool(c:any,tool:ToolDef,args:any){
  if(c.get('authMethod')!=='session'&&!authHasScope(c,tool.scope))return{status:403,payload:{error:`Scope ${tool.scope} requerido`}};
  const url=new URL(tool.path,'https://hector.internal'),body=tool.method==='POST'?JSON.stringify(tool.wrap?tool.wrap(args||{}):(args||{})):undefined;
  const request=new Request(url.toString(),{method:tool.method,headers:authHeaders(c),body});
  const response=await (subApp(tool) as any).fetch(request,c.env,c.executionCtx),text=await response.text();
  let payload:unknown;try{payload=text?JSON.parse(text):{ok:response.ok};}catch{payload={text:text.slice(0,20000)};}
  return{status:response.status,payload};
}
function mcpResult(status:number,payload:unknown){const text=JSON.stringify(payload);return{content:[{type:'text',text}],structuredContent:payload,isError:status>=400};}

hectorMcp.get('/',c=>c.json({ok:true,name:'Héctor Bridge MCP',protocol:'MCP Streamable HTTP (stateless JSON responses)',endpoint:'/mcp',auth:'Bearer token from /api/hector-bridge/access/tokens',tools:TOOLS.length}));

hectorMcp.post('/',async c=>{
  if(c.get('authMethod')!=='session'&&!authHasScope(c,'mcp'))return c.json(rpcError(null,-32001,'Scope mcp requerido'),403);
  const body=await c.req.json<any>().catch(()=>null);if(!body||body.jsonrpc!=='2.0'||typeof body.method!=='string')return c.json(rpcError(body?.id,-32600,'Invalid Request'),400);
  const {id,method,params}=body;
  if(method==='notifications/initialized')return new Response(null,{status:204});
  if(method==='ping')return c.json(jsonRpc(id,{}));
  if(method==='initialize'){
    const requested=typeof params?.protocolVersion==='string'?params.protocolVersion:'2025-03-26';
    return c.json(jsonRpc(id,{protocolVersion:requested,capabilities:{tools:{listChanged:false}},serverInfo:{name:'hector-bridge',version:'2.1.0'},instructions:'Use Context Sync before substantial work, execute capabilities through the broker, use context_upsert for changing state/preferences, and publish meaningful handoffs. Coordination is advisory, not an internal permission gate.'}));
  }
  if(method==='tools/list'){
    const visible=TOOLS.filter(tool=>c.get('authMethod')==='session'||authHasScope(c,tool.scope)).map(({name,description,inputSchema})=>({name,description,inputSchema}));
    return c.json(jsonRpc(id,{tools:visible}));
  }
  if(method==='tools/call'){
    const name=String(params?.name||''),tool=TOOLS.find(x=>x.name===name);if(!tool)return c.json(rpcError(id,-32602,`Unknown tool: ${name}`),400);
    try{const called=await callTool(c,tool,params?.arguments||{});return c.json(jsonRpc(id,mcpResult(called.status,called.payload)));}
    catch(e){return c.json(jsonRpc(id,mcpResult(500,{error:e instanceof Error?e.message:'tool_call_failed'})));}
  }
  return c.json(rpcError(id,-32601,`Method not found: ${method}`),404);
});
