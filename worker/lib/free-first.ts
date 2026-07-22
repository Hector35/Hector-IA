export type FreeCapability='classify'|'extract'|'route'|'summarize'|'verify'|'general';

export type DeterministicFreeResult={
 capability:Exclude<FreeCapability,'summarize'|'general'>;
 text:string;
 confidence:number;
 source:'rules';
 advancedCalls:0;
 freeModelCalls:0;
};

export type FreeCloudflareProfile={
 capability:FreeCapability;
 model:string;
 maxTokens:number;
 timeoutMs:number;
 temperature:number;
};

export type FreeFirstBudget={
 capability:FreeCapability;
 maxFreeModelCalls:0|1;
 maxAdvancedCalls:0|1;
 reason:string;
};

type FreeModelEnv={
 CLOUDFLARE_MODEL_FAST?:string;
 CLOUDFLARE_MODEL_UTILITY?:string;
 HECTOR_FREE_FIRST_TIMEOUT_MS?:string;
};

const software=/\b(c[oó]digo|typescript|javascript|python|react|worker|cloudflare|github|api|sql|d1|r2|bug|error|deploy|workflow|frontend|backend|compila|pruebas?)\b/i;
const health=/\b(salud|m[eé]dic|dolor|s[ií]ntoma|dosis|lesi[oó]n|cirug[ií]a|paciente)\b/i;
const finance=/\b(finanzas|dinero|saldo|banco|presupuesto|pago|quincena|gasto)\b/i;
const planning=/\b(plan|estrategia|prioridades|decisi[oó]n|opciones|arquitectura|dise[ñn]o|proyecto|riesgos?)\b/i;
const current=/\b(hoy|ahora|actual|reciente|[uú]ltim[oa]|precio|clima|noticia|ley|versi[oó]n|disponible|busca|verifica en internet)\b/i;
const sensitive=/\b(contrase[ñn]a|password|token|secreto|privado|saldo|banco|expediente|diagn[oó]stico|dosis|legal|demanda|contrato)\b/i;
const deep=/\b(implementa|refactoriza|audita|investiga|demuestra|optimiza|modelo completo|arquitectura completa|razonamiento alto)\b/i;

function normalize(text:string){return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function afterDirective(input:string){const colon=input.indexOf(':');if(colon>=0)return input.slice(colon+1).trim();const newline=input.indexOf('\n');return newline>=0?input.slice(newline+1).trim():input.trim();}
function unique(values:string[]){return [...new Set(values.map(value=>value.trim()).filter(Boolean))];}
function taskCategory(text:string){if(software.test(text))return'ingeniería de software';if(health.test(text))return'salud y análisis de riesgo';if(finance.test(text))return'finanzas personales';if(planning.test(text))return'planificación y toma de decisiones';if(/\b(explica|origen|f[ií]sica|qu[ií]mica|biolog[ií]a|ingenier[ií]a)\b/i.test(text))return'explicación técnica';return'consulta general';}

export function detectFreeCapability(input:string):FreeCapability{
 const text=normalize(input);
 if(/^(clasifica|clasificar)(\b|\s)/.test(text)||/^tipo de tarea\b/.test(text))return'classify';
 if(/^(extrae|extraer|encuentra)\b/.test(text)&&/\b(email|correo|url|enlace|numero|número|fecha|dato|entidad|entidades)\b/.test(text))return'extract';
 if(/^(enruta|enrutar|elige ruta|decide ruta)\b/.test(text))return'route';
 if(/^(verifica|validar|valida)\b/.test(text)&&/\bjson\b/.test(text))return'verify';
 if(/^(resume|resumir|haz un resumen|sintetiza)\b/.test(text))return'summarize';
 return'general';
}

function extractResult(input:string):DeterministicFreeResult{
 const body=afterDirective(input);
 const emails=unique(body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]);
 const urls=unique(body.match(/https?:\/\/[^\s<>()"']+/gi)||[]);
 const numbers=unique(body.match(/(?<![\p{L}\p{N}_])-?\d+(?:[.,]\d+)?(?![\p{L}\p{N}_])/gu)||[]);
 const isoDates=unique(body.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[]);
 const slashDates=unique(body.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g)||[]);
 const lines=[`Correos: ${emails.length?emails.join(', '):'ninguno'}`,`Enlaces: ${urls.length?urls.join(', '):'ninguno'}`,`Números: ${numbers.length?numbers.join(', '):'ninguno'}`,`Fechas: ${[...isoDates,...slashDates].length?[...isoDates,...slashDates].join(', '):'ninguna'}`];
 return{capability:'extract',text:lines.join('\n'),confidence:.99,source:'rules',advancedCalls:0,freeModelCalls:0};
}

function routeResult(input:string):DeterministicFreeResult{
 const body=afterDirective(input),requiresWeb=current.test(body),isSensitive=sensitive.test(body),tier=deep.test(body)||body.length>1200?'deep':body.length<180&&!planning.test(body)?'fast':'balanced';
 const reasons=[requiresWeb?'requiere información actual':'no requiere información actual',isSensitive?'contiene señales sensibles':'sin señales sensibles',`categoría: ${taskCategory(body)}`];
 return{capability:'route',text:`Ruta: ${tier}\nWeb: ${requiresWeb?'sí':'no'}\nSensible: ${isSensitive?'sí':'no'}\nMotivo: ${reasons.join('; ')}.`,confidence:.94,source:'rules',advancedCalls:0,freeModelCalls:0};
}

function verifyJsonResult(input:string):DeterministicFreeResult{
 const body=afterDirective(input);
 try{const parsed=JSON.parse(body);const type=Array.isArray(parsed)?'arreglo':parsed===null?'null':typeof parsed;return{capability:'verify',text:`JSON válido. Tipo raíz: ${type}.`,confidence:1,source:'rules',advancedCalls:0,freeModelCalls:0};}
 catch(error){return{capability:'verify',text:`JSON inválido: ${error instanceof Error?error.message:'error de sintaxis'}.`,confidence:1,source:'rules',advancedCalls:0,freeModelCalls:0};}
}

export function tryDeterministicFreeInference(input:string):DeterministicFreeResult|null{
 const capability=detectFreeCapability(input),body=afterDirective(input);
 if(capability==='classify')return{capability,text:`Clasificación: ${taskCategory(body)}.`,confidence:.96,source:'rules',advancedCalls:0,freeModelCalls:0};
 if(capability==='extract')return extractResult(input);
 if(capability==='route')return routeResult(input);
 if(capability==='verify')return verifyJsonResult(input);
 return null;
}

export function freeFirstBudget(input:string):FreeFirstBudget{
 const capability=detectFreeCapability(input),deterministic=tryDeterministicFreeInference(input);
 if(deterministic)return{capability,maxFreeModelCalls:0,maxAdvancedCalls:0,reason:'La operación se resuelve con código determinista.'};
 if(capability==='summarize')return{capability,maxFreeModelCalls:1,maxAdvancedCalls:1,reason:'Se intenta una inferencia ligera gratuita y solo se permite un fallback avanzado.'};
 return{capability,maxFreeModelCalls:1,maxAdvancedCalls:1,reason:'Se intenta primero Workers AI cuando la política de riesgo y complejidad lo permite.'};
}

export function cloudflareFreeProfile(env:FreeModelEnv,input:string):FreeCloudflareProfile{
 const capability=detectFreeCapability(input),configuredTimeout=Number(env.HECTOR_FREE_FIRST_TIMEOUT_MS),timeoutMs=Number.isFinite(configuredTimeout)&&configuredTimeout>=1000?Math.min(20_000,configuredTimeout):8_000;
 if(capability!=='general')return{capability,model:env.CLOUDFLARE_MODEL_UTILITY||'@cf/ibm-granite/granite-4.0-h-micro',maxTokens:capability==='summarize'?360:220,timeoutMs,temperature:.1};
 return{capability,model:env.CLOUDFLARE_MODEL_FAST||'@cf/meta/llama-3.2-3b-instruct',maxTokens:900,timeoutMs:Math.max(timeoutMs,10_000),temperature:.25};
}

export async function withTimeout<T>(promise:Promise<T>,timeoutMs:number,message='La inferencia gratuita excedió el tiempo permitido'):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeoutMs);})]);}
 finally{if(timer)clearTimeout(timer);}
}
