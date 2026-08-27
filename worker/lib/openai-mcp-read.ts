export const HECTOR_MCP_READ_TOOLS=[
 'context_search',
 'context_recall',
 'context_current_state',
 'capabilities_list',
 'job_list',
 'job_status',
 'pwa_inspect',
 'bridge_status'
] as const;

export type OpenAIMcpReadUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number}};
export type OpenAIMcpReadOutputItem={
 type:string;
 name?:string;
 status?:string;
 error?:unknown;
 output?:string;
 content?:Array<{type:string;text?:string}>;
};
export type OpenAIMcpReadResponse={
 id?:string;
 model?:string;
 output_text?:string;
 output?:OpenAIMcpReadOutputItem[];
 usage?:OpenAIMcpReadUsage;
 error?:{message?:string;code?:string};
 status?:string;
};

export type McpReadEvidence={listed:boolean;calls:Array<{name:string;status:string;error?:string}>};

export function buildMcpReadResponseBody(input:{model:string;message:string;serverUrl:string;bearerToken:string}){
 return{
  model:input.model,
  instructions:[
   'Eres Héctor OS consultando la fuente de verdad del usuario mediante un MCP remoto estrictamente de solo lectura.',
   'Para responder debes ejecutar al menos una herramienta del servidor hector_read. No respondas usando memoria implícita ni inventes estado.',
   'Usa context_current_state para preguntas generales sobre el estado actual; context_search o context_recall para búsquedas concretas; job_list/job_status para trabajos; bridge_status para salud operativa.',
   'No solicites ni intentes crear, modificar, eliminar, reanudar o ejecutar datos. Resume únicamente lo observado por las herramientas.',
   'Responde en español, de forma directa. Si el MCP no aporta evidencia suficiente, dilo explícitamente.'
  ].join('\n'),
  input:input.message,
  store:false,
  max_output_tokens:900,
  max_tool_calls:3,
  parallel_tool_calls:false,
  reasoning:{effort:'low'},
  tool_choice:'required',
  tools:[{
   type:'mcp',
   server_label:'hector_read',
   server_url:input.serverUrl,
   server_description:'Héctor OS read-only MCP. Consulta contexto, estado, jobs y capacidades sin mutar datos.',
   headers:{Authorization:`Bearer ${input.bearerToken}`},
   allowed_tools:{read_only:true,tool_names:[...HECTOR_MCP_READ_TOOLS]},
   require_approval:'never'
  }]
 } as const;
}

function errorText(value:unknown){
 if(!value)return undefined;
 if(typeof value==='string')return value.slice(0,500);
 if(typeof value==='object'&&value&&'message' in value)return String((value as {message?:unknown}).message||'').slice(0,500)||undefined;
 return String(value).slice(0,500);
}

export function extractMcpReadEvidence(data:OpenAIMcpReadResponse):McpReadEvidence{
 const output=Array.isArray(data.output)?data.output:[];
 const calls=output.filter(item=>item.type==='mcp_call').map(item=>({
  name:String(item.name||'unknown'),
  status:String(item.status||'unknown'),
  ...(errorText(item.error)?{error:errorText(item.error)}:{})
 }));
 return{listed:output.some(item=>item.type==='mcp_list_tools'),calls};
}

export function extractOpenAIResponseText(data:OpenAIMcpReadResponse){
 if(typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
 const text=(Array.isArray(data.output)?data.output:[])
  .filter(item=>item.type==='message')
  .flatMap(item=>Array.isArray(item.content)?item.content:[])
  .filter(item=>item.type==='output_text'&&typeof item.text==='string')
  .map(item=>item.text!.trim())
  .filter(Boolean)
  .join('\n');
 return text||'';
}

export function hasSuccessfulMcpRead(evidence:McpReadEvidence){
 return evidence.calls.some(call=>call.status==='completed'&&!call.error);
}
