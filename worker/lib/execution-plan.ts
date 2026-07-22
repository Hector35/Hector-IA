export type PlannedTier='fast'|'balanced'|'deep';
export type PlannedProvider='cloudflare'|'openai';
export type PlannedCognitiveMode='single'|'ensemble';

export type ExecutionPlanInput={
 task:string;
 route:{model:string;tier:PlannedTier;reasoning:'low'|'medium'|'high';needsWeb:boolean};
 provider:{requested:PlannedProvider;reason:string};
 cognition:{mode:PlannedCognitiveMode;passes:1|3;reason:string};
 allowedModels:string[];
 policySummary:string;
};

export type ExecutionPlan=Readonly<ExecutionPlanInput&{
 version:'1.0.0';
 hash:string;
 createdAt:string;
}>;

export type ObservedExecution={
 model:string;
 tier:string;
 provider:string;
 requestedProvider?:string;
 cognitiveMode?:string;
 deliberationPasses?:number;
 fallback?:boolean;
};

export type ExecutionVerification={
 status:'exact'|'allowed-fallback'|'drift';
 ok:boolean;
 differences:string[];
 summary:string;
};

function canonical(value:unknown):string{
 if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
 return JSON.stringify(value);
}

export async function hashExecutionPlan(input:ExecutionPlanInput){
 const bytes=new TextEncoder().encode(canonical(input));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export async function createExecutionPlan(input:ExecutionPlanInput):Promise<ExecutionPlan>{
 const normalized:ExecutionPlanInput={...input,allowedModels:[...new Set(input.allowedModels)].sort()};
 return Object.freeze({...normalized,version:'1.0.0',hash:await hashExecutionPlan(normalized),createdAt:new Date().toISOString()});
}

function isHectorBaseModel(model:string){return model==='hector-rules-v1'||model.startsWith('@cf/');}

export function verifyExecutionPlan(plan:ExecutionPlan,actual:ObservedExecution):ExecutionVerification{
 const differences:string[]=[];
 const actualMode=String(actual.cognitiveMode||'single').startsWith('ensemble')?'ensemble':'single';
 const openModelExecution=actual.provider==='cloudflare'&&isHectorBaseModel(actual.model);
 const openModelOverride=plan.provider.requested==='openai'&&openModelExecution&&actual.fallback===true;
 if(actual.tier!==plan.route.tier)differences.push(`tier previsto ${plan.route.tier}, observado ${actual.tier}`);
 if(!plan.allowedModels.includes(actual.model)&&!openModelExecution)differences.push(`modelo no autorizado ${actual.model}`);
 if(actualMode!==plan.cognition.mode)differences.push(`modo previsto ${plan.cognition.mode}, observado ${actualMode}`);
 if(Number(actual.deliberationPasses||1)!==plan.cognition.passes){
  const degraded=plan.cognition.mode==='ensemble'&&actualMode==='ensemble'&&Number(actual.deliberationPasses||0)>=1&&Number(actual.deliberationPasses||0)<plan.cognition.passes;
  if(!degraded)differences.push(`pasadas previstas ${plan.cognition.passes}, observadas ${actual.deliberationPasses||1}`);
 }
 const providerExact=actual.provider===plan.provider.requested;
 const allowedFallback=openModelOverride;
 if(!providerExact&&!allowedFallback)differences.push(`proveedor previsto ${plan.provider.requested}, observado ${actual.provider}`);
 if(differences.length)return{status:'drift',ok:false,differences,summary:`Desviación del plan ${plan.hash.slice(0,12)}: ${differences.join('; ')}`};
 if(allowedFallback)return{status:'allowed-fallback',ok:true,differences:[],summary:`Plan ${plan.hash.slice(0,12)} protegido: OpenAI fue sustituido por Héctor Base porque el chat solo permite modelos abiertos.`};
 return{status:'exact',ok:true,differences:[],summary:`Plan ${plan.hash.slice(0,12)} ejecutado exactamente con un modelo autorizado de Héctor Base.`};
}
