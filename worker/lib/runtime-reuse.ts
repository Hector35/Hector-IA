export type ReuseRisk='low'|'medium'|'high';
export type ReuseMode='deterministic'|'context';

export type RuntimeReuseCandidate={
 id:string;
 source:'experience'|'skill'|'rule';
 taskType:string;
 risk:ReuseRisk;
 confidence:number;
 successRate:number;
 recencyScore?:number;
 estimatedCostUsd:number;
 trigger:string;
 procedure:string;
 mode:ReuseMode;
 deterministicOutput?:string;
};

export type RuntimeReuseDecision=
 |{kind:'blocked';reason:string;risk:'high';candidate:null;reusedFraction:0}
 |{kind:'deterministic';reason:string;risk:ReuseRisk;candidate:RuntimeReuseCandidate;output:string;reusedFraction:1}
 |{kind:'assist';reason:string;risk:ReuseRisk;candidate:RuntimeReuseCandidate;context:string;reusedFraction:number}
 |{kind:'escalate';reason:string;risk:ReuseRisk;candidate:null;reusedFraction:0};

export type RuntimeReuseRecord={kind:RuntimeReuseDecision['kind'];candidateId:string|null;reusedFraction:number;modelCalls:number;reason:string};

const HIGH_RISK=/\b(elimina|borra|destruye|fusiona|mergea|publica|despliega|transfiere|paga|compra|vende|envia|firma|revoca|cambia\s+contrase(?:n|ñ)a|secreto|token)\b/i;
const MEDIUM_RISK=/\b(modifica|actualiza|edita|crea|escribe|sube|instala|configura|programa|automatiza)\b/i;
const STOP=new Set(['para','como','esta','este','esto','desde','hasta','sobre','entre','todos','todas','cada','solo','pero','porque','cuando','donde','quiere','quiero','hacer','hace','hector']);

export function classifyReuseRisk(input:string):ReuseRisk{
 if(HIGH_RISK.test(input))return'high';
 if(MEDIUM_RISK.test(input))return'medium';
 return'low';
}

export function reuseTokens(value:string){return [...new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]{3,}/g)||[])].filter(token=>!STOP.has(token));}

export function reuseSimilarity(a:string,b:string){
 const left=new Set(reuseTokens(a)),right=new Set(reuseTokens(b));
 if(!left.size||!right.size)return 0;
 let common=0;for(const token of left)if(right.has(token))common++;
 return common/(left.size+right.size-common);
}

export function experienceRecencyScore(createdAt:string|null|undefined,nowMs=Date.now()){
 const timestamp=createdAt?Date.parse(createdAt):NaN;
 if(!Number.isFinite(timestamp))return .2;
 const ageDays=Math.max(0,(nowMs-timestamp)/86_400_000);
 return Math.exp(-ageDays/120);
}

function clamp(value:number){return Math.max(0,Math.min(1,Number.isFinite(value)?value:0));}
function candidateScore(input:string,candidate:RuntimeReuseCandidate){
 const lexical=reuseSimilarity(input,`${candidate.trigger} ${candidate.taskType}`);
 if(lexical<.12)return 0;
 return lexical*.52+clamp(candidate.confidence)*.2+clamp(candidate.successRate)*.18+clamp(candidate.recencyScore??.5)*.1;
}

export function chooseRuntimeReuse(input:string,candidates:RuntimeReuseCandidate[],options:{authorizedHighRisk?:boolean;modelCostUsd?:number}={}):RuntimeReuseDecision{
 const risk=classifyReuseRisk(input);
 if(risk==='high'&&!options.authorizedHighRisk)return{kind:'blocked',reason:'La acción es de alto riesgo y requiere autorización explícita.',risk,candidate:null,reusedFraction:0};
 const ranked=candidates
  .filter(candidate=>candidate.risk!=='high'||options.authorizedHighRisk)
  .map(candidate=>({candidate,score:candidateScore(input,candidate)}))
  .sort((a,b)=>b.score-a.score||b.candidate.successRate-a.candidate.successRate);
 const best=ranked[0];
 if(!best||best.score<.42)return{kind:'escalate',reason:'No existe una experiencia o habilidad suficientemente parecida y confiable.',risk,candidate:null,reusedFraction:0};
 const candidate=best.candidate,modelCost=Math.max(0,options.modelCostUsd??Number.POSITIVE_INFINITY);
 if(candidate.mode==='deterministic'&&candidate.deterministicOutput&&best.score>=.72&&candidate.confidence>=.8&&candidate.successRate>=.8&&candidate.estimatedCostUsd<=modelCost){
  return{kind:'deterministic',reason:`Procedimiento conocido y verificado (${best.score.toFixed(2)}).`,risk,candidate,output:candidate.deterministicOutput,reusedFraction:1};
 }
 return{kind:'assist',reason:`Se reutilizará contexto verificado (${best.score.toFixed(2)}) y el modelo resolverá solo lo nuevo.`,risk,candidate,context:`EXPERIENCIA REUTILIZABLE ${candidate.id}\nTipo: ${candidate.taskType}\nProcedimiento verificado:\n${candidate.procedure.slice(0,4000)}`,reusedFraction:Math.max(.15,Math.min(.85,best.score))};
}

export async function runWithRuntimeReuse<T>(input:{prompt:string;candidates:RuntimeReuseCandidate[];authorizedHighRisk?:boolean;modelCostUsd?:number;model:(context:string)=>Promise<T>;deterministic:(output:string,candidate:RuntimeReuseCandidate)=>T;record?:(event:RuntimeReuseRecord)=>Promise<void>|void}){
 const decision=chooseRuntimeReuse(input.prompt,input.candidates,{authorizedHighRisk:input.authorizedHighRisk,modelCostUsd:input.modelCostUsd});
 if(decision.kind==='blocked'){
  await input.record?.({kind:'blocked',candidateId:null,reusedFraction:0,modelCalls:0,reason:decision.reason});
  throw new Error(decision.reason);
 }
 if(decision.kind==='deterministic'){
  await input.record?.({kind:'deterministic',candidateId:decision.candidate.id,reusedFraction:1,modelCalls:0,reason:decision.reason});
  return{value:input.deterministic(decision.output,decision.candidate),decision,modelCalls:0};
 }
 const context=decision.kind==='assist'?decision.context:'';
 const value=await input.model(context);
 await input.record?.({kind:decision.kind,candidateId:decision.kind==='assist'?decision.candidate.id:null,reusedFraction:decision.reusedFraction,modelCalls:1,reason:decision.reason});
 return{value,decision,modelCalls:1};
}

function reusableOutput(result:string){const match=result.match(/(?:^|\n)REUSABLE_OUTPUT\s*:\s*([\s\S]+)$/i);return match?.[1]?.trim();}

export async function loadRuntimeReuseCandidates(db:{prepare:(sql:string)=>{bind:(...values:unknown[])=>{all:<T>()=>Promise<{results:T[]}>}}},userId:string):Promise<RuntimeReuseCandidate[]>{
 try{
  const rows=(await db.prepare("SELECT id,objective,result,skills_json,attempts,created_at,estimated_cost_usd FROM agent_experiences WHERE user_id=? AND status='completed' AND verified=1 AND result IS NOT NULL AND length(trim(result))>=20 ORDER BY created_at DESC LIMIT 120").bind(userId).all<{id:string;objective:string;result:string;skills_json:string|null;attempts:number;created_at:string|null;estimated_cost_usd:number|null}>()).results;
  return rows.map(row=>{
   let skills:string[]=[];try{const parsed=JSON.parse(row.skills_json||'[]');skills=Array.isArray(parsed)?parsed.filter(item=>typeof item==='string').slice(0,12):[];}catch{}
   const output=reusableOutput(row.result),attempts=Math.max(1,Number(row.attempts)||1),confidence=Math.max(.55,Math.min(.92,.94-(attempts-1)*.055));
   return{id:row.id,source:'experience' as const,taskType:skills[0]||'general',risk:classifyReuseRisk(row.objective),confidence,successRate:confidence,recencyScore:experienceRecencyScore(row.created_at),estimatedCostUsd:Math.max(0,Number(row.estimated_cost_usd)||0),trigger:row.objective,procedure:row.result.replace(/(?:^|\n)REUSABLE_OUTPUT\s*:[\s\S]+$/i,'').trim().slice(0,4000),mode:output?'deterministic' as const:'context' as const,deterministicOutput:output};
  });
 }catch{return[];}
}
