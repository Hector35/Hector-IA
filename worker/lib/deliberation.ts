export type DeliberationTier='fast'|'balanced'|'deep';
export type DeliberationOptions={reasoning?:'auto'|'high';deliberation?:'auto'|'force'|'off'};
export type DeliberationMode='single'|'ensemble';
export type DeliberationProfile={mode:DeliberationMode;reason:string;candidateCount:1|2;highStakes:boolean};
export type UsageLike={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number}};

export const JUDGE_MAX_CHARS=32000;
export const JUDGE_INSTRUCTIONS_MAX_CHARS=18000;
const JUDGE_ORIGINAL_MAX_CHARS=6000;
const JUDGE_MIN_CANDIDATE_CHARS=2000;
const explicitSignals=/\b(m[aá]ximo razonamiento|razonamiento alto|m[aá]s inteligente|supera(?:r)?|audita a fondo|verifica a fondo|doble verificaci[oó]n|no te equivoques|alta precisi[oó]n)\b/i;
const highStakeSignals=/\b(salud|m[eé]dic|dolor|s[ií]ntoma|dosis|cirug[ií]a|legal|demanda|contrato|finanzas|dinero|saldo|banco|inversi[oó]n|seguridad|vulnerabilidad|secreto|token|contrase[nñ]a)\b/i;
const complexSignals=/\b(arquitectura|implementa|programa|depura|debug|audita|diagn[oó]stico|estrategia|plan completo|compara todas|demuestra|optimiza|refactoriza|investiga profundamente|modelo completo|causa ra[ií]z|escenario|sensibilidad)\b/i;

export function chooseDeliberation(input:string,tier:DeliberationTier,options:DeliberationOptions={},enabled=true):DeliberationProfile{
 const highStakes=highStakeSignals.test(input),complex=complexSignals.test(input);
 if(!enabled||options.deliberation==='off')return{mode:'single',reason:!enabled?'deliberación desactivada por configuración':'deliberación desactivada para esta solicitud',candidateCount:1,highStakes};
 if(options.deliberation==='force'||options.reasoning==='high')return{mode:'ensemble',reason:'razonamiento máximo solicitado explícitamente',candidateCount:2,highStakes};
 if(explicitSignals.test(input))return{mode:'ensemble',reason:'la solicitud exige verificación o inteligencia reforzada',candidateCount:2,highStakes};
 if(tier==='deep'&&(complex||input.length>=220))return{mode:'ensemble',reason:'tarea profunda con complejidad suficiente para doble resolución',candidateCount:2,highStakes};
 if(highStakes&&(input.length>=180||complex))return{mode:'ensemble',reason:'tarea sensible con complejidad suficiente para doble resolución',candidateCount:2,highStakes};
 return{mode:'single',reason:'una sola ejecución es proporcional a la complejidad y al riesgo',candidateCount:1,highStakes};
}

export type CandidateRole='architect'|'adversary';
function compactText(value:string,maxChars:number){if(value.length<=maxChars)return value;if(maxChars<80)return value.slice(0,maxChars);const marker='\n[…contenido intermedio compactado…]\n',remaining=maxChars-marker.length,head=Math.ceil(remaining*.72),tail=Math.max(0,remaining-head);return `${value.slice(0,head)}${marker}${tail?value.slice(-tail):''}`;}
export function candidateInstructions(base:string,role:CandidateRole,task:string,highStakes:boolean){
 const roleText=role==='architect'?'Actúa como arquitecto principal. Resuelve el problema de forma completa, estructurada y ejecutable. Identifica requisitos, dependencias, supuestos, cálculos, evidencia y criterios de éxito antes de concluir.':'Actúa como especialista adversarial independiente. Resuelve el mismo problema desde cero, busca contraejemplos, supuestos ocultos, riesgos, fallos de seguridad y alternativas que una primera solución podría omitir.';
 const safety=highStakes?'Por ser una tarea sensible, evita certeza falsa, separa hechos de inferencias y define umbrales concretos de escalamiento o verificación humana.':'';
 return `${base}\n\nDELIBERACIÓN INDEPENDIENTE\nRol: ${role}.\nDominio: ${task}.\n${roleText}\n${safety}\nNo menciones que existe otro candidato. No describas razonamiento privado; entrega únicamente una solución candidata verificable.`;
}
export function judgeInstructions(base:string,task:string,highStakes:boolean){
 const safety=highStakes?'En contenido sensible, conserva incertidumbre explícita, no inventes seguridad y prioriza la opción con mejor control de riesgos.':'';
 const contract=`\n\nJUEZ DE SÍNTESIS\nDominio: ${task}.\nRecibirás dos soluciones independientes para la misma solicitud. Compara exactitud, cobertura de requisitos, consistencia, evidencia, riesgos, aplicabilidad y costo. Corrige errores en vez de votar por longitud o estilo. Produce una sola respuesta final autosuficiente, más fuerte que cualquiera de las candidatas. ${safety}\nNo menciones candidatos, deliberación, votación ni razonamiento privado. Conserva citas o atribuciones solo cuando estén respaldadas por el material recibido.`;
 return `${compactText(base,Math.max(1000,JUDGE_INSTRUCTIONS_MAX_CHARS-contract.length))}${contract}`.slice(0,JUDGE_INSTRUCTIONS_MAX_CHARS);
}
export function judgeInput(original:string,candidates:Array<{role:CandidateRole;text:string}>){
 const selected=candidates.slice(0,2),outro='\n\nEntrega la mejor respuesta final posible para la solicitud original.',intro=`SOLICITUD ORIGINAL\n${compactText(original,JUDGE_ORIGINAL_MAX_CHARS)}\n\n`,headers=selected.map((candidate,index)=>`SOLUCIÓN ${index+1} — ${candidate.role.toUpperCase()}\n`),fixedChars=intro.length+outro.length+headers.reduce((sum,value)=>sum+value.length,0)+Math.max(0,selected.length-1)*2,available=Math.max(JUDGE_MIN_CANDIDATE_CHARS*selected.length,JUDGE_MAX_CHARS-fixedChars),perCandidate=selected.length?Math.max(JUDGE_MIN_CANDIDATE_CHARS,Math.floor(available/selected.length)):0,sections=selected.map((candidate,index)=>`${headers[index]}${compactText(candidate.text,perCandidate)}`).join('\n\n'),assembled=`${intro}${sections}${outro}`;
 if(assembled.length<=JUDGE_MAX_CHARS)return assembled;
 const overflow=assembled.length-JUDGE_MAX_CHARS,saferBudget=Math.max(JUDGE_MIN_CANDIDATE_CHARS,perCandidate-Math.ceil(overflow/Math.max(selected.length,1))),boundedSections=selected.map((candidate,index)=>`${headers[index]}${compactText(candidate.text,saferBudget)}`).join('\n\n');
 return `${intro}${boundedSections}${outro}`.slice(0,JUDGE_MAX_CHARS-outro.length)+outro;
}
export function aggregateUsage(usages:Array<UsageLike|undefined>):UsageLike{const input=usages.reduce((sum,item)=>sum+(item?.input_tokens||0),0),output=usages.reduce((sum,item)=>sum+(item?.output_tokens||0),0),cached=usages.reduce((sum,item)=>sum+(item?.input_tokens_details?.cached_tokens||0),0);return{input_tokens:input,output_tokens:output,input_tokens_details:{cached_tokens:cached}};}
