export type DriftCause='router'|'budget'|'feedback'|'provider'|'cognition'|'unknown';
export type DriftIncident={id:string;task:string;model:string;costUsd:number;createdAt:string;planHash:string;planVersion:string;status:'active'|'acknowledged'|'recovery-requested';cause:DriftCause;summary:string;differences:string[];recoveryPrompt:string};

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

export function normalizeDriftIncident(row:any,actions:Map<string,string>):DriftIncident|null{
 let metadata:any={};try{metadata=JSON.parse(String(row.metadata_json||'{}'));}catch{return null;}
 const verification=metadata?.verification,planHash=String(metadata?.planHash||'');
 if(!planHash||!verification||!Array.isArray(verification.differences))return null;
 const differences=verification.differences.filter((item:unknown)=>typeof item==='string').slice(0,12),cause=classifyDriftCause(differences),status=(actions.get(String(row.id))||'active') as DriftIncident['status'],task=String(metadata.task||'consulta general');
 return{id:String(row.id),task,model:String(row.model||'desconocido'),costUsd:Math.max(0,Number(row.estimated_cost_usd)||0),createdAt:String(row.created_at||''),planHash,planVersion:String(metadata.planVersion||'1.0.0'),status,cause,summary:String(verification.summary||'Ejecución bloqueada por desviación del plan.'),differences,recoveryPrompt:recoveryPrompt({task,planHash,cause,differences})};
}

export function latestActions(rows:any[]){
 const map=new Map<string,string>();
 for(const row of rows){let metadata:any={};try{metadata=JSON.parse(String(row.metadata_json||'{}'));}catch{continue;}const incidentId=String(metadata.incidentId||'');if(incidentId&&!map.has(incidentId))map.set(incidentId,String(metadata.action||'acknowledged'));}
 return map;
}
