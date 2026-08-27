import {describe,expect,it} from 'vitest';
import {buildMcpReadResponseBody,extractMcpReadEvidence,extractOpenAIResponseText,hasSuccessfulMcpRead,HECTOR_MCP_READ_TOOLS} from './openai-mcp-read';

describe('OpenAI remote MCP read bridge',()=>{
 it('construye una petición de solo lectura y no persiste la respuesta',()=>{
  const body=buildMcpReadResponseBody({model:'gpt-5.6-luna',message:'¿Qué tengo pendiente?',serverUrl:'https://example.test/mcp-read',bearerToken:'htr_secret'});
  expect(body).toMatchObject({model:'gpt-5.6-luna',input:'¿Qué tengo pendiente?',store:false,tool_choice:'required',parallel_tool_calls:false});
  expect(body.tools).toHaveLength(1);
  expect(body.tools[0]).toMatchObject({type:'mcp',server_label:'hector_read',server_url:'https://example.test/mcp-read',require_approval:'never'});
  expect(body.tools[0].headers.Authorization).toBe('Bearer htr_secret');
  expect(body.tools[0].allowed_tools.read_only).toBe(true);
  expect(body.tools[0].allowed_tools.tool_names).toEqual([...HECTOR_MCP_READ_TOOLS]);
  expect(JSON.stringify({...body,tools:[{...body.tools[0],headers:{Authorization:'Bearer [redacted]'}}]})).not.toContain('htr_secret');
 });

 it('extrae texto y evidencia verificable de una llamada MCP completada',()=>{
  const data={id:'resp_1',output:[
   {type:'mcp_list_tools',status:'completed'},
   {type:'mcp_call',name:'context_current_state',status:'completed',output:'{"ok":true}'},
   {type:'message',content:[{type:'output_text',text:'Tienes 3 pendientes.'}]}
  ]};
  const evidence=extractMcpReadEvidence(data);
  expect(evidence).toEqual({listed:true,calls:[{name:'context_current_state',status:'completed'}]});
  expect(hasSuccessfulMcpRead(evidence)).toBe(true);
  expect(extractOpenAIResponseText(data)).toBe('Tienes 3 pendientes.');
 });

 it('no acredita como lectura exitosa una llamada MCP fallida',()=>{
  const evidence=extractMcpReadEvidence({output:[{type:'mcp_call',name:'context_search',status:'failed',error:{message:'401'}}]});
  expect(hasSuccessfulMcpRead(evidence)).toBe(false);
  expect(evidence.calls[0]).toMatchObject({name:'context_search',status:'failed',error:'401'});
 });
});
