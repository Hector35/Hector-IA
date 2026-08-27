import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {authHasScope,requireAuth} from '../lib/auth';
import {hectorBridge} from './hector-bridge';
import {hectorAgent} from './hector-agent';
import {contextHub} from './context-hub';
import {hectorCapabilities} from './hector-capabilities';

export const hectorMcpRead=new Hono<{Bindings:Bindings;Variables:Variables}>();
hectorMcpRead.use('*',requireAuth);

type ToolPath=string|((args:any)=>string);
type ReadTool={
  name:string;
  description:string;
  scope:string;
  method:'GET'|'POST';
  path:ToolPath;
  target:'bridge'|'agent'|'context'|'capabilities';
  inputSchema:Record<string,unknown>;
  wrap?:(args:any)=>any;
  openWorldHint?:boolean;
};

const goalIdSchema={type:'object',properties:{goalId:{type:'string'}},required:['goalId'],additionalProperties:false};

const READ_TOOLS:ReadTool[]=[
  {name:'context_search',description:'Busca información compartida de Héctor sin modificar datos.',scope:'context',method:'POST',path:'/search-everything',target:'context',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'number'}},required:['query'],additionalProperties:false}},
  {name:'context_recall',description:'Recupera memoria semántica relevante y trazable sin modificarla.',scope:'context',method:'POST',path:'/recall',target:'context',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'number'}},required:['query'],additionalProperties:false}},
  {name:'context_current_state',description:'Obtiene el estado compartido actual de objetivos, checkpoints, tareas, proyectos, archivos y contexto activo.',scope:'context',method:'GET',path:'/current-state',target:'context',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'capabilities_list',description:'Lista capacidades, rutas de fallback y credenciales disponibles sin exponer secretos ni ejecutar acciones.',scope:'tools',method:'GET',path:'/list',target:'capabilities',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'job_list',description:'Lista objetivos recientes de Héctor Agent con progreso, estado, errores y aprobaciones pendientes.',scope:'jobs',method:'GET',path:'/dashboard',target:'agent',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'job_status',description:'Obtiene el estado detallado, tareas y eventos recientes de un objetivo persistente.',scope:'jobs',method:'GET',path:(args:any)=>`/goals/${encodeURIComponent(String(args?.goalId||''))}`,target:'agent',inputSchema:goalIdSchema},
  {name:'pwa_inspect',description:'Inspecciona por red una PWA HTTPS sin modificarla: HTTP, título, manifest, service worker y cabeceras relevantes.',scope:'tools',method:'POST',path:'/tools/execute',target:'bridge',wrap:(args:any)=>({name:'pwa.inspect',input:args}),inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url'],additionalProperties:false},openWorldHint:true},
  {name:'bridge_status',description:'Devuelve el estado operativo del Bridge, memoria, jobs y resiliencia sin modificar datos.',scope:'bridge',method:'GET',path:'/status',target:'bridge',inputSchema:{type:'object',properties:{},additionalProperties:false}}
];

function jsonRpc(id:unknown,result:unknown){return{jsonrpc:'2.0',id:id??null,result};}
function rpcError(id:unknown,code:number,message:string,data?:unknown){return{jsonrpc:'2.0',id:id??null,error:{code,message,...(data===undefined?{}:{data})}};}
function authHeaders(c:any){
  const h=new Headers({'Accept':'application/json','Content-Type':'application/json'}),authorization=c.req.header('Authorization'),cookie=c.req.header('Cookie'),requestId=c.req.header('X-Request-ID');
  if(authorization)h.set('Authorization',authorization);
  if(cookie)h.set('Cookie',cookie);
  if(requestId)h.set('X-Request-ID',requestId);
  return h;
}
function subApp(tool:ReadTool){return tool.target==='bridge'?hectorBridge:tool.target==='agent'?hectorAgent:tool.target==='context'?contextHub:hectorCapabilities;}
async function callTool(c:any,tool:ReadTool,args:any){
  if(c.get('authMethod')!=='session'&&!authHasScope(c,tool.scope))return{status:403,payload:{error:`Scope ${tool.scope} requerido`}};
  const path=typeof tool.path==='function'?tool.path(args||{}):tool.path;
  const url=new URL(path,'https://hector.internal');
  const body=tool.method==='POST'?JSON.stringify(tool.wrap?tool.wrap(args||{}):(args||{})):undefined;
  const request=new Request(url.toString(),{method:tool.method,headers:authHeaders(c),body});
  const response=await (subApp(tool) as any).fetch(request,c.env,c.executionCtx),text=await response.text();
  let payload:unknown;
  try{payload=text?JSON.parse(text):{ok:response.ok};}catch{payload={text:text.slice(0,20000)};}
  return{status:response.status,payload};
}
function mcpResult(status:number,payload:unknown){const text=JSON.stringify(payload);return{content:[{type:'text',text}],structuredContent:payload,isError:status>=400};}
function toolDefinition(tool:ReadTool){return{
  name:tool.name,
  description:tool.description,
  inputSchema:tool.inputSchema,
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:Boolean(tool.openWorldHint)}
};}

hectorMcpRead.get('/',c=>c.json({ok:true,name:'Héctor Read-only MCP',protocol:'MCP Streamable HTTP (stateless JSON responses)',endpoint:'/mcp-read',mode:'read-only',auth:'Bearer token from /api/hector-bridge/access/tokens',tools:READ_TOOLS.length}));

hectorMcpRead.post('/',async c=>{
  if(c.get('authMethod')!=='session'&&!authHasScope(c,'mcp'))return c.json(rpcError(null,-32001,'Scope mcp requerido'),403);
  const body=await c.req.json<any>().catch(()=>null);
  if(!body||body.jsonrpc!=='2.0'||typeof body.method!=='string')return c.json(rpcError(body?.id,-32600,'Invalid Request'),400);
  const {id,method,params}=body;
  if(method==='notifications/initialized')return new Response(null,{status:204});
  if(method==='ping')return c.json(jsonRpc(id,{}));
  if(method==='initialize'){
    const requested=typeof params?.protocolVersion==='string'?params.protocolVersion:'2025-03-26';
    return c.json(jsonRpc(id,{protocolVersion:requested,capabilities:{tools:{listChanged:false}},serverInfo:{name:'hector-readonly',version:'1.0.0'},instructions:'Read-only access to Héctor OS. Use these tools to inspect current state, context, jobs and capabilities. No tool exposed by this endpoint can create, update, delete, resume, execute or persist user data.'}));
  }
  if(method==='tools/list'){
    const visible=READ_TOOLS.filter(tool=>c.get('authMethod')==='session'||authHasScope(c,tool.scope)).map(toolDefinition);
    return c.json(jsonRpc(id,{tools:visible}));
  }
  if(method==='tools/call'){
    const name=String(params?.name||''),tool=READ_TOOLS.find(x=>x.name===name);
    if(!tool)return c.json(rpcError(id,-32602,`Unknown or non-read-only tool: ${name}`),400);
    try{const called=await callTool(c,tool,params?.arguments||{});return c.json(jsonRpc(id,mcpResult(called.status,called.payload)));}
    catch(e){return c.json(jsonRpc(id,mcpResult(500,{error:e instanceof Error?e.message:'tool_call_failed'})));}
  }
  return c.json(rpcError(id,-32601,`Method not found: ${method}`),404);
});
