export type WorkModeState='continue'|'waiting'|'complete';

export type WorkModeResult={
 state:WorkModeState;
 retryAfterMinutes:number;
 text:string;
 explicit:boolean;
};

const statePattern=/^WORK_STATE\s*:\s*(continue|waiting|complete)\s*$/im;
const retryPattern=/^RETRY_AFTER_MINUTES\s*:\s*(\d{1,5})\s*$/im;

export function workModeTitle(goal:string){
 const first=goal.replace(/\s+/g,' ').trim().split(/[.!?\n]/)[0]||'Trabajo continuo';
 return first.slice(0,96);
}

export function renderWorkModePrompt(goal:string,previousResult:string|null|undefined,cycle:number){
 const previous=String(previousResult||'').trim().slice(-7000);
 return [
  'MODO TRABAJO CONTINUO DE HÉCTOR OS',
  `OBJETIVO FINAL\n${goal}`,
  `CICLO\n${Math.max(1,cycle)}`,
  'COMPORTAMIENTO OBLIGATORIO',
  '- Trabaja durante tantos ciclos como sean necesarios hasta lograr y verificar el objetivo final.',
  '- No te detengas por errores normales: diagnostica la causa, corrige, cambia de estrategia o intenta una alternativa.',
  '- No hagas preguntas de conveniencia. Resuelve ambigüedades con supuestos razonables y decláralos en el informe.',
  '- Solo espera cuando exista una dependencia externa real que todavía no puede resolverse. Indica cuándo reintentar.',
  '- Conserva continuidad con el ciclo anterior y no repitas trabajo ya validado.',
  '- No declares terminado el trabajo sin evidencia verificable.',
  '- Las acciones irreversibles, secretos, pagos, merge o despliegues siguen requiriendo la autoridad correspondiente.',
  'SALIDA OBLIGATORIA',
  'Termina la respuesta con exactamente una de estas líneas:',
  'WORK_STATE: continue',
  'WORK_STATE: waiting',
  'WORK_STATE: complete',
  'Si eliges waiting, añade también: RETRY_AFTER_MINUTES: N',
  previous?`RESULTADO DEL CICLO ANTERIOR\n${previous}`:'PRIMER CICLO\nInspecciona el estado actual y establece la línea base antes de avanzar.'
 ].join('\n\n');
}

export function parseWorkModeResult(value:string):WorkModeResult{
 const match=value.match(statePattern);
 const explicit=Boolean(match);
 const state=(match?.[1] as WorkModeState|undefined)||'continue';
 const requested=Number(value.match(retryPattern)?.[1]||5);
 const retryAfterMinutes=Math.max(1,Math.min(1440,Number.isFinite(requested)?requested:5));
 const text=value.replace(statePattern,'').replace(retryPattern,'').trim();
 return{state,retryAfterMinutes,text,explicit};
}
