import {createExecutionPlan,type ExecutionPlan,type ExecutionPlanInput} from './execution-plan';

export type DriftCause='router'|'budget'|'feedback'|'provider'|'cognition'|'unknown';
export type DriftStatus='active'|'acknowledged'|'recovery-requested'|'retrying'|'recovered'|'retry-failed';
export type DriftIncident={id:string;task:string;model:string;costUsd:number;createdAt:string;planHash:string;planVersion:string;status:DriftStatus;cause:DriftCause;summary:string;differences:string[];recoveryPrompt:string;retryAvailable:boolean;conversationId:string|null;userMessageId:string|null;lastActionAt:string|null};
export type DriftAction={status:DriftStatus;createdAt:string};

export function classifyDriftCause(differences:string[]):DriftCause{
 const text=differences.join(' ').toLowerCase();
 if(/proveedor|provider/.test(text))return'provider';
 if(/modo|pasadas|deliber/.test(text))return'cognition';
 if(/presupuesto|budget/.test(text))return'budget';
 if(/feedback|valoraci/.test(text))return'feedback';
 if(/tier|modelo|ruta/.test(text))return'router';
 return'unknown';
}

export function recoveryPrompt(input:{task:string;planHash:string;cause:DriftCause;differences:string[]}){
 const detail=input.differences.join('; ')||'diferencia no clasificada';
 return `Reintenta la tarea bloqueada "${input.task}" usando el plan cognitivo original ${input.planHash.slice(0,12)}. Corrige primero la causa ${input.cause}: ${detail}. No cambies modelo, nivel, proveedor ni deliberación fuera de lo autorizado; verifica el plan antes de entregar la respuesta.`;
}

export function normalizeDriftIncident(row:any,actions:Map<string,DriftAction>):DriftIncident|null{
 let metadata:any={};try{metadata=JSON.parse(String(row.metadata_json||'{}'));}catch{return null;}
 const verification=metadata?.verification,planHash=String(metadata?.planHash||'');
 if(!planHash||!verification||!Array.isArray(verification.differences))return null;
 const differences=verification.differences.filter((item:unknown)=>typeof item==='string').slice(0,12),cause=classifyDriftCause(differences),action=actions.get(String(row.id)),status=action?.status||'active',task=String(metadata.task||'consulta general'),conversationId=typeof metadata.conversationId==='string'?metadata.conversationId:null,userMessageId=typeof metadata.userMessageId==='string'?metadata.userMessageId:null,retryAvailable=!!conversationId&&!!userMessageId&&!!metadata.executionPlan;
 return{id:String(row.id),task,model:String(row.model||'desconocido'),costUsd:Math.max(0,Number(row.estimated_cost_usd)||0),createdAt:String(row.created_at||''),planHash,planVersion:String(metadata.planVersion||'1.0.0'),status,cause,summary:String(verification.summary||'Ejecución bloqueada por desviación del plan.'),differences,recoveryPrompt:recoveryPrompt({task,planHash,cause,differences}),retryAvailable,conversationId,userMessageId,lastActionAt:action?.createdAt||null};
}

export function latestActions(rows:any[]){
 const map=new Map<string,DriftAction>();
 for(const row of rows){let metadata:any={};try{metadata=JSON.parse(String(row.metadata_json||'{}'));}catch{continue;}const incidentId=String(metadata.incidentId||'');if(incidentId&&!map.has(incidentId))map.set(incidentId,{status:String(metadata.action||'acknowledged') as DriftStatus,createdAt:String(row.created_at||'')});}
 return map;
}

export async function restoreExecutionPlan(value:unknown,expectedHash:string):Promise<ExecutionPlan|null>{
 if(!value||typeof value!=='object')return null;
 const raw=value as any,input:ExecutionPlanInput={task:String(raw.task||''),route:{model:String(raw.route?.model||''),tier:raw.route?.tier,reasoning:raw.route?.reasoning,needsWeb:!!raw.route?.needsWeb},provider:{requested:raw.provider?.requested,reason:String(raw.provider?.reason||'')},cognition:{mode:raw.cognition?.mode,passes:raw.cognition?.passes,reason:String(raw.cognition?.reason||'')},allowedModels:Array.isArray(raw.allowedModels)?raw.allowedModels.filter((item:unknown)=>typeof item==='string'):[],policySummary:String(raw.policySummary||'')};
 if(!input.task||!input.route.model||!['fast','balanced','deep'].includes(input.route.tier)||!['low','medium','high'].includes(input.route.reasoning)||!['cloudflare','openai'].includes(input.provider.requested)||!['single','ensemble'].includes(input.cognition.mode)||![1,3].includes(input.cognition.passes)||!input.allowedModels.length)return null;
 const plan=await createExecutionPlan(input);
 return plan.hash===expectedHash?plan:null;
}

export function retryLocked(action:DriftAction|undefined,now=Date.now()){
 if(!action)return false;
 if(action.status==='recovered')return true;
 if(action.status!=='retrying')return false;
 const timestamp=new Date(action.createdAt).getTime();
 return Number.isFinite(timestamp)&&now-timestamp<5*60_000;
}
