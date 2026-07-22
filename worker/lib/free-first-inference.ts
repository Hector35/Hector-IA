export type FreeFirstCapability='classify'|'extract'|'route'|'summarize'|'embed'|'verify'|'generate';
export type FreeFirstTier='deterministic'|'free-model'|'economical'|'advanced';
export type FreeFirstRisk='low'|'medium'|'high';

export type FreeFirstDecision={
 capability:FreeFirstCapability;
 tier:FreeFirstTier;
 risk:FreeFirstRisk;
 reason:string;
 maxAdvancedCalls:0|1;
 timeoutMs:number;
};

export type DeterministicFreeResult={
 text:string;
 capability:'classify'|'extract'|'route';
 confidence:number;
};

const highRisk=/\b(elimina|borra|transfiere|paga|publica|envía|envia|despliega|producción|produccion|contraseña|password|token|secreto|médic|medic|dosis|diagnóstico|diagnostico|legal|demanda|banco|saldo)\b/i;
const webSignals=/\b(hoy|actual|últim|ultim|noticias|precio|clima|internet|web|busca|investiga)\b/i;
const complexSignals=/\b(arquitectura|implementa|programa|depura|refactoriza|demuestra|estrategia|modelo completo|audita|compara profundamente)\b/i;

function normalized(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}

export function detectFreeFirstCapability(prompt:string):FreeFirstCapability{
 const value=normalized(prompt);
 if(/\b(clasifica|categoria|categoriza|intencion|intent)\b/.test(value))return'classify';
 if(/\b(extrae|extraer|identifica correos|identifica urls|campos|entidades)\b/.test(value))return'extract';
 if(/\b(enruta|routing|que herramienta|que modulo|tipo de tarea)\b/.test(value))return'route';
 if(/\b(resume|resumen|sintetiza)\b/.test(value))return'summarize';
 if(/\b(embedding|vector|similitud semantica)\b/.test(value))return'embed';
 if(/\b(verifica|valida|comprueba)\b/.test(value))return'verify';
 return'generate';
}

export function decideFreeFirst(prompt:string,options:{allowWeb?:boolean;reasoningHigh?:boolean;freeProviderHealthy?:boolean}={}):FreeFirstDecision{
 const capability=detectFreeFirstCapability(prompt);
 const risk:FreeFirstRisk=highRisk.test(prompt)?'high':complexSignals.test(prompt)?'medium':'low';
 if((capability==='classify'||capability==='extract'||capability==='route')&&risk==='low')return{capability,tier:'deterministic',risk,reason:'La tarea se resuelve con reglas locales verificables.',maxAdvancedCalls:0,timeoutMs:50};
 if(options.allowWeb||webSignals.test(prompt))return{capability,tier:'advanced',risk,reason:'Requiere información externa actualizada.',maxAdvancedCalls:1,timeoutMs:45_000};
 if(risk==='high'||options.reasoningHigh&&complexSignals.test(prompt))return{capability,tier:'advanced',risk,reason:'La complejidad o el riesgo requieren razonamiento avanzado.',maxAdvancedCalls:1,timeoutMs:45_000};
 if(options.freeProviderHealthy!==false)return{capability,tier:'free-model',risk,reason:'Workers AI puede resolver la tarea dentro de la cuota gratuita.',maxAdvancedCalls:1,timeoutMs:12_000};
 return{capability,tier:'economical',risk,reason:'El proveedor gratuito no está sano; usar el modelo económico antes del avanzado.',maxAdvancedCalls:1,timeoutMs:20_000};
}

function taskCategory(text:string){
 const value=normalized(text);
 if(/github|repositorio|codigo|typescript|build|test/.test(value))return'github-code';
 if(/calendario|reunion|evento|agenda/.test(value))return'calendar';
 if(/correo|email|gmail|mensaje/.test(value))return'communication';
 if(/documento|pdf|archivo|drive/.test(value))return'documents';
 if(/dinero|saldo|gasto|presupuesto/.test(value))return'finance';
 return'general';
}

function requestedBody(prompt:string){const split=prompt.split(/:\s*/);return(split.length>1?split.slice(1).join(': '):prompt).trim();}

export function runDeterministicFreeInference(prompt:string):DeterministicFreeResult|null{
 const capability=detectFreeFirstCapability(prompt);
 if(capability==='classify'){
  const target=requestedBody(prompt),category=taskCategory(target);
  return{text:JSON.stringify({category,source:'deterministic',advancedCalls:0}),capability,confidence:.9};
 }
 if(capability==='route'){
  const target=requestedBody(prompt),taskType=taskCategory(target);
  return{text:JSON.stringify({taskType,recommendedPath:taskType==='github-code'?'github-code':taskType,source:'deterministic',advancedCalls:0}),capability,confidence:.88};
 }
 if(capability==='extract'){
  const target=requestedBody(prompt);
  const emails=[...new Set(target.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])];
  const urls=[...new Set(target.match(/https?:\/\/[^\s)]+/gi)||[])];
  const amounts=[...new Set(target.match(/(?:\$|MXN\s*)\s?\d[\d,]*(?:\.\d{1,2})?/gi)||[])];
  return{text:JSON.stringify({emails,urls,amounts,source:'deterministic',advancedCalls:0}),capability,confidence:.95};
 }
 return null;
}

export async function withTimeout<T>(operation:()=>Promise<T>,timeoutMs:number):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation(),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`free-first timeout after ${timeoutMs}ms`)),timeoutMs);})]);}
 finally{if(timer)clearTimeout(timer);}
}
