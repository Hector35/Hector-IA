import type {Bindings} from '../types';
import {intelligenceStateSnapshot} from '../intelligence/intelligence-state';

export const READ_ONLY_TOOL_NAMES=['calculator','system_state','memory_search','recent_work'] as const;
export type ReadOnlyToolName=typeof READ_ONLY_TOOL_NAMES[number];
export type ReadOnlyToolCall=
 |{name:'calculator';arguments:{expression:string}}
 |{name:'system_state';arguments:Record<string,never>}
 |{name:'memory_search';arguments:{query:string;limit:number}}
 |{name:'recent_work';arguments:{limit:number}};
export type ReadOnlyToolExecution={id:string;name:ReadOnlyToolName;arguments:Record<string,unknown>;success:boolean;sideEffects:'none';durationMs:number;result?:unknown;error?:string};

const TOOL_CALL_PATTERN=/^\s*<tool_call>\s*([\s\S]{2,2000}?)\s*<\/tool_call>\s*$/i;
const NUMBER=/[0-9]/;

function object(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function keysAre(value:Record<string,unknown>,allowed:string[]){return Object.keys(value).every(key=>allowed.includes(key));}
function boundedInteger(value:unknown,fallback:number,min:number,max:number){const number=Number(value);return Number.isInteger(number)?Math.max(min,Math.min(max,number)):fallback;}

export function parseReadOnlyToolCall(text:string):ReadOnlyToolCall|null{
 const match=text.match(TOOL_CALL_PATTERN);if(!match)return null;
 let raw:unknown;try{raw=JSON.parse(match[1]);}catch{return null;}
 if(!object(raw)||!READ_ONLY_TOOL_NAMES.includes(raw.name as ReadOnlyToolName)||!object(raw.arguments))return null;
 if(raw.name==='calculator'){
  if(!keysAre(raw.arguments,['expression'])||typeof raw.arguments.expression!=='string')return null;
  const expression=raw.arguments.expression.trim();if(!expression||expression.length>200)return null;
  return{name:'calculator',arguments:{expression}};
 }
 if(raw.name==='system_state'){
  if(Object.keys(raw.arguments).length)return null;
  return{name:'system_state',arguments:{}};
 }
 if(raw.name==='memory_search'){
  if(!keysAre(raw.arguments,['query','limit'])||typeof raw.arguments.query!=='string')return null;
  const query=raw.arguments.query.trim();if(query.length<2||query.length>240)return null;
  return{name:'memory_search',arguments:{query,limit:boundedInteger(raw.arguments.limit,5,1,8)}};
 }
 if(!keysAre(raw.arguments,['limit']))return null;
 return{name:'recent_work',arguments:{limit:boundedInteger(raw.arguments.limit,3,1,5)}};
}

class ArithmeticParser{
 private index=0;
 constructor(private readonly source:string){}
 parse():number{const value=this.expression();this.space();if(this.index!==this.source.length)throw new Error(`símbolo no permitido en posición ${this.index+1}`);if(!Number.isFinite(value))throw new Error('resultado no finito');return value;}
 private space():void{while(/\s/.test(this.source[this.index]||''))this.index++;}
 private take(value:string):boolean{this.space();if(this.source.startsWith(value,this.index)){this.index+=value.length;return true;}return false;}
 private expression():number{let value:number=this.term();for(;;){if(this.take('+'))value+=this.term();else if(this.take('-'))value-=this.term();else return value;}}
 private term():number{let value:number=this.power();for(;;){if(this.take('*')||this.take('×')||this.take('x')||this.take('X'))value*=this.power();else if(this.take('/')||this.take('÷')){const divisor=this.power();if(divisor===0)throw new Error('división entre cero');value/=divisor;}else return value;}}
 private power():number{let value:number=this.unary();if(this.take('^')){const exponent=this.power();if(Math.abs(exponent)>12)throw new Error('exponente fuera del límite seguro');value=value**exponent;}return value;}
 private unary():number{if(this.take('+'))return this.unary();if(this.take('-'))return-this.unary();return this.primary();}
 private primary():number{if(this.take('(')){const value:number=this.expression();if(!this.take(')'))throw new Error('falta cerrar paréntesis');return value;}return this.number();}
 private number():number{this.space();const start=this.index;let separator=false;while(this.index<this.source.length){const char=this.source[this.index];if(NUMBER.test(char)){this.index++;continue;}if((char==='.'||char===',')&&!separator){separator=true;this.index++;continue;}break;}if(start===this.index)throw new Error(`se esperaba un número en posición ${this.index+1}`);const token=this.source.slice(start,this.index).replace(',','.');if(token==='.'||token===',')throw new Error('número inválido');const value=Number(token);if(!Number.isFinite(value))throw new Error('número no finito');return value;}
}

export function calculateExpression(expression:string){
 const input=expression.trim();if(!input||input.length>200)throw new Error('expresión vacía o demasiado larga');
 if(!/^[0-9\s.,+\-*/xX×÷^()]+$/.test(input))throw new Error('la expresión contiene caracteres no permitidos');
 const value=new ArithmeticParser(input).parse();
 const normalized=Number.parseFloat(value.toPrecision(15));
 return{expression:input,value:normalized,verified:true,engine:'hector-arithmetic-v1'};
}

function words(query:string){return[...new Set(query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{2,}/g)||[])].slice(0,6);}
function compact(value:unknown,max=8000){const text=JSON.stringify(value);return text.length<=max?text:`${text.slice(0,max-24)}…[resultado truncado]`;}

export async function executeReadOnlyTool(env:Bindings,userId:string,call:ReadOnlyToolCall):Promise<ReadOnlyToolExecution>{
 const started=Date.now(),base={id:crypto.randomUUID(),name:call.name,arguments:call.arguments as Record<string,unknown>,sideEffects:'none' as const};
 try{
  let result:unknown;
  if(call.name==='calculator')result=calculateExpression(call.arguments.expression);
  else if(call.name==='system_state'){
   const state=intelligenceStateSnapshot();
   result={stage:state.stage,name:state.name,status:state.status,models:state.models,pipeline:state.pipeline,training:state.training,evidence:state.evidence};
  }else if(call.name==='memory_search'){
   const terms=words(call.arguments.query);if(!terms.length)throw new Error('consulta de memoria sin términos útiles');
   const where=terms.map(()=>"lower(content) LIKE ?").join(' AND '),bindings=[userId,...terms.map(term=>`%${term}%`),call.arguments.limit];
   const rows=await env.DB.prepare(`SELECT id,content,importance,updated_at FROM memories WHERE user_id=? AND ${where} ORDER BY importance DESC,updated_at DESC LIMIT ?`).bind(...bindings).all<any>();
   result={query:call.arguments.query,count:rows.results.length,items:rows.results.map((row:any)=>({id:String(row.id),content:String(row.content).slice(0,1000),importance:Number(row.importance||0),updatedAt:row.updated_at||null}))};
  }else{
   const rows=await env.DB.prepare('SELECT id,kind,status,progress,result,updated_at FROM work_jobs WHERE user_id=? ORDER BY updated_at DESC LIMIT ?').bind(userId,call.arguments.limit).all<any>();
   result={count:rows.results.length,items:rows.results.map((row:any)=>({id:String(row.id),kind:String(row.kind||''),status:String(row.status||''),progress:Number(row.progress||0),result:row.result?String(row.result).slice(0,1200):null,updatedAt:row.updated_at||null}))};
  }
  return{...base,success:true,durationMs:Date.now()-started,result};
 }catch(error){return{...base,success:false,durationMs:Date.now()-started,error:error instanceof Error?error.message:'error desconocido'};}
}

export function renderReadOnlyToolProtocol(){return`\n\nHERRAMIENTAS VERIFICABLES DE SOLO LECTURA\nPuedes solicitar una herramienta cuando necesites evidencia exacta. Para hacerlo responde ÚNICAMENTE con una etiqueta y JSON válidos, sin texto adicional:\n<tool_call>{"name":"calculator","arguments":{"expression":"(17*6)+4"}}</tool_call>\n<tool_call>{"name":"system_state","arguments":{}}</tool_call>\n<tool_call>{"name":"memory_search","arguments":{"query":"preferencias de entrenamiento","limit":5}}</tool_call>\n<tool_call>{"name":"recent_work","arguments":{"limit":3}}</tool_call>\nReglas: sólo existen esas cuatro herramientas; todas son de lectura; no inventes resultados; solicita como máximo una por turno; después de recibir el resultado úsalo como evidencia y entrega una respuesta final.`;}

export function renderReadOnlyToolResult(execution:ReadOnlyToolExecution,index:number,max:number){return`RESULTADO VERIFICADO DE HERRAMIENTA ${index}/${max}\n${compact(execution)}\n\nUsa este resultado como evidencia. No afirmes más de lo observado. Si todavía necesitas otra herramienta distinta, solicita una con el formato exacto; de lo contrario entrega la respuesta final sin etiquetas <tool_call>.`;}

export function readOnlyToolManifest(){return{version:'1.0.0',tools:[...READ_ONLY_TOOL_NAMES],sideEffects:'none',maximumCallsPerResponse:2,ownershipEnforced:true,parser:'strict tagged JSON',calculator:'no eval; bounded recursive descent'};}
