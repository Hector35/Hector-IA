export const WORK_MODE_PREFIX='MODO_TRABAJO_PERSISTENTE_V1';

export type WorkModeState='completed'|'continue'|'waiting';
export type WorkModeOutcome={state:WorkModeState;waitMinutes:number;explicit:boolean};

function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,Math.trunc(value)));}

export function deriveWorkTitle(objective:string){
 const clean=objective.replace(/\s+/g,' ').trim();
 const first=clean.split(/(?<=[.!?])\s/)[0]||clean;
 return (first.slice(0,96).trim()||'Trabajo persistente').replace(/[.:;,]+$/,'');
}

export function wrapWorkObjective(objective:string){
 return `${WORK_MODE_PREFIX}\n\nOBJETIVO\n${objective.trim()}`;
}

export function isPersistentWorkPrompt(value:string|undefined|null){return String(value||'').startsWith(WORK_MODE_PREFIX);}

export function unwrapWorkObjective(value:string){
 if(!isPersistentWorkPrompt(value))return value.trim();
 return value.replace(WORK_MODE_PREFIX,'').replace(/^\s*OBJETIVO\s*/i,'').trim();
}

export function cleanWorkModeOutput(value:string|undefined|null){
 return String(value||'').replace(/\n?WORK_STATE\s*:\s*(?:completed|continue|waiting)\s*$/im,'').replace(/\n?WORK_WAIT_MINUTES\s*:\s*\d+\s*$/im,'').trim();
}

export function workModeExecutionPrompt(storedPrompt:string,checkpoint:string|undefined|null,attempt:number){
 const objective=unwrapWorkObjective(storedPrompt),prior=cleanWorkModeOutput(checkpoint).slice(0,10000);
 return [
  'MODO TRABAJO PERSISTENTE DE HÉCTOR OS',
  `Ciclo ${Math.max(1,Math.trunc(attempt)||1)}.`,
  `OBJETIVO\n${objective}`,
  prior?`ÚLTIMO PUNTO DE CONTROL\n${prior}`:'PRIMER CICLO\nInspecciona el estado real antes de actuar.',
  `REGLAS DE AUTONOMÍA
- No hagas preguntas innecesarias ni detengas el trabajo para pedir decisiones que puedas resolver con una suposición reversible.
- Ante errores, diagnostica la causa, prueba una alternativa segura y conserva evidencia de cada intento.
- No repitas trabajo ya completado. Continúa desde el punto de control más reciente.
- Usa waiting solo cuando exista una dependencia externa real, una operación en curso o falte una credencial/permiso imposible de sustituir.
- Usa completed únicamente cuando el objetivo esté satisfecho con evidencia verificable.
- No inventes herramientas, cambios, pruebas ni despliegues.
- Entrega un avance útil aunque el ciclo deba continuar.`,
  `CONTRATO FINAL OBLIGATORIO
Termina con exactamente estas dos líneas:
WORK_STATE: completed|continue|waiting
WORK_WAIT_MINUTES: 0
Para waiting, sustituye 0 por un valor entre 1 y 60.`
 ].join('\n\n');
}

export function parseWorkModeOutcome(text:string):WorkModeOutcome{
 const explicit=text.match(/WORK_STATE\s*:\s*(completed|continue|waiting)/i)?.[1]?.toLowerCase() as WorkModeState|undefined;
 const wait=Number(text.match(/WORK_WAIT_MINUTES\s*:\s*(\d{1,4})/i)?.[1]||0);
 if(explicit)return{state:explicit,waitMinutes:explicit==='waiting'?clamp(wait||10,1,60):0,explicit:true};
 const normalized=text.toLowerCase();
 if(/\b(en espera|dependencia externa|credencial faltante|permiso faltante|operaci[oó]n en curso)\b/.test(normalized))return{state:'waiting',waitMinutes:10,explicit:false};
 if(/\b(no pude|fall[oó]|error|pendiente|falta|siguiente paso|continuar|bloquead[oa])\b/.test(normalized))return{state:'continue',waitMinutes:0,explicit:false};
 return{state:'completed',waitMinutes:0,explicit:false};
}

export function nextWorkModeDelayMinutes(outcome:WorkModeOutcome,attempt:number){
 if(outcome.state==='waiting')return clamp(outcome.waitMinutes||10,1,60);
 const safe=Math.max(1,Math.trunc(attempt)||1);
 return safe<=6?2:safe<=12?5:safe<=24?15:60;
}
