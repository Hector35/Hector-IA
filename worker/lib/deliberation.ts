export type DeliberationTier='fast'|'balanced'|'deep';
export type DeliberationOptions={reasoning?:'auto'|'high';deliberation?:'auto'|'force'|'off'};
export type DeliberationMode='single'|'ensemble';
export type DeliberationProfile={
 mode:DeliberationMode;
 reason:string;
 candidateCount:1|2;
 highStakes:boolean;
};
export type UsageLike={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number}};

const explicitSignals=/\b(m[aá]ximo razonamiento|razonamiento alto|m[aá]s inteligente|supera(?:r)?|audita a fondo|verifica a fondo|doble verificaci[oó]n|no te equivoques|alta precisi[oó]n)\b/i;
const highStakeSignals=/\b(salud|m[eé]dic|dolor|s[ií]ntoma|dosis|cirug[ií]a|legal|demanda|contrato|finanzas|dinero|saldo|banco|inversi[oó]n|seguridad|vulnerabilidad|secreto|token|contrase[nñ]a)\b/i;
const complexSignals=/\b(arquitectura|implementa|programa|depura|debug|audita|diagn[oó]stico|estrategia|plan completo|compara todas|demuestra|optimiza|refactoriza|investiga profundamente|modelo completo|causa ra[ií]z|escenario|sensibilidad)\b/i;

export function chooseDeliberation(input:string,tier:DeliberationTier,options:DeliberationOptions={},enabled=true):DeliberationProfile{
 const highStakes=highStakeSignals.test(input);
 if(!enabled||options.deliberation==='off')return{mode:'single',reason:!enabled?'deliberación desactivada por configuración':'deliberación desactivada para esta solicitud',candidateCount:1,highStakes};
 if(options.deliberation==='force'||options.reasoning==='high')return{mode:'ensemble',reason:'razonamiento máximo solicitado explícitamente',candidateCount:2,highStakes};
 if(explicitSignals.test(input))return{mode:'ensemble',reason:'la solicitud exige verificación o inteligencia reforzada',candidateCount:2,highStakes};
 if(tier==='deep')return{mode:'ensemble',reason:'tarea clasificada como razonamiento profundo',candidateCount:2,highStakes};
 if(highStakes&&(input.length>=180||complexSignals.test(input)))return{mode:'ensemble',reason:'tarea sensible con complejidad suficiente para doble resolución',candidateCount:2,highStakes};
 return{mode:'single',reason:'una sola ejecución es proporcional a la complejidad y al riesgo',candidateCount:1,highStakes};
}

export type CandidateRole='architect'|'adversary';

export function candidateInstructions(base:string,role:CandidateRole,task:string,highStakes:boolean){
 const roleText=role==='architect'
  ?'Actúa como arquitecto principal. Resuelve el problema de forma completa, estructurada y ejecutable. Identifica requisitos, dependencias, supuestos, cálculos, evidencia y criterios de éxito antes de concluir.'
  :'Actúa como especialista adversarial independiente. Resuelve el mismo problema desde cero, busca contraejemplos, supuestos ocultos, riesgos, fallos de seguridad y alternativas que una primera solución podría omitir.';
 const safety=highStakes?'Por ser una tarea sensible, evita certeza falsa, separa hechos de inferencias y define umbrales concretos de escalamiento o verificación humana.':'';
 return `${base}\n\nDELIBERACIÓN INDEPENDIENTE\nRol: ${role}.\nDominio: ${task}.\n${roleText}\n${safety}\nNo menciones que existe otro candidato. No describas razonamiento privado; entrega únicamente una solución candidata verificable.`;
}

export function judgeInstructions(base:string,task:string,highStakes:boolean){
 const safety=highStakes?'En contenido sensible, conserva incertidumbre explícita, no inventes seguridad y prioriza la opción con mejor control de riesgos.':'';
 return `${base}\n\nJUEZ DE SÍNTESIS\nDominio: ${task}.\nRecibirás dos soluciones independientes para la misma solicitud. Compara exactitud, cobertura de requisitos, consistencia, evidencia, riesgos, aplicabilidad y costo. Corrige errores en vez de votar por longitud o estilo. Produce una sola respuesta final autosuficiente, más fuerte que cualquiera de las candidatas. ${safety}\nNo menciones candidatos, deliberación, votación ni razonamiento privado. Conserva citas o atribuciones solo cuando estén respaldadas por el material recibido.`;
}

export function judgeInput(original:string,candidates:Array<{role:CandidateRole;text:string}>){
 const sections=candidates.map((candidate,index)=>`SOLUCIÓN ${index+1} — ${candidate.role.toUpperCase()}\n${candidate.text.slice(0,24000)}`).join('\n\n');
 return `SOLICITUD ORIGINAL\n${original}\n\n${sections}\n\nEntrega la mejor respuesta final posible para la solicitud original.`;
}

export function aggregateUsage(usages:Array<UsageLike|undefined>):UsageLike{
 const input=usages.reduce((sum,item)=>sum+(item?.input_tokens||0),0);
 const output=usages.reduce((sum,item)=>sum+(item?.output_tokens||0),0);
 const cached=usages.reduce((sum,item)=>sum+(item?.input_tokens_details?.cached_tokens||0),0);
 return{input_tokens:input,output_tokens:output,input_tokens_details:{cached_tokens:cached}};
}
