export type ScheduleCadence='once'|'hourly'|'every_2_hours'|'every_6_hours'|'daily'|'weekly';
export type ReasoningLevel='standard'|'high';
export type AutonomyMode='guided'|'independent'|'continuous';

export type ScheduledTaskDefinition={
 id:string;
 title:string;
 prompt:string;
 kind:string;
 cadence:ScheduleCadence;
 interval_minutes?:number|null;
 reasoning_level:ReasoningLevel;
 autonomy_mode:AutonomyMode;
 allow_web:number|boolean;
 next_run_at:string;
 last_job_id?:string|null;
};

export type PreviousScheduledRun={status?:string|null;result?:string|null;last_error?:string|null;updated_at?:string|null};

const cadenceMap:Record<ScheduleCadence,number|null>={once:null,hourly:60,every_2_hours:120,every_6_hours:360,daily:1440,weekly:10080};
const activeStatuses=new Set(['queued','working','testing','repairing']);

export function intervalMinutesFor(cadence:ScheduleCadence,custom?:number|null){
 if(cadence==='once')return null;
 if(custom!==undefined&&custom!==null&&Number.isFinite(custom))return Math.max(1,Math.min(10080,Math.trunc(custom)));
 return cadenceMap[cadence];
}
export function isActiveScheduledJob(status:string|undefined|null){return !!status&&activeStatuses.has(status);}

export async function scheduledJobId(taskId:string,scheduledFor:string){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${taskId}|${scheduledFor}`))).slice(0,16);
 bytes[6]=(bytes[6]&0x0f)|0x50;
 bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
 return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function normalizeRunAt(value:string,nowMs=Date.now()){
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))throw new Error('Fecha de ejecución inválida');
 if(ms<nowMs-5*60_000)throw new Error('La primera ejecución no puede estar en el pasado');
 if(ms>nowMs+366*24*60*60_000)throw new Error('La primera ejecución no puede exceder un año');
 return new Date(ms).toISOString();
}

export function nextScheduledRun(cadence:ScheduleCadence,scheduledAt:string,nowMs=Date.now(),customMinutes?:number|null):string|null{
 const minutes=intervalMinutesFor(cadence,customMinutes);
 if(minutes===null)return null;
 const base=Date.parse(scheduledAt);
 if(!Number.isFinite(base))throw new Error('Fecha programada inválida');
 if(base>nowMs)return new Date(base).toISOString();
 const intervalMs=minutes*60_000;
 const steps=Math.floor((nowMs-base)/intervalMs)+1;
 return new Date(base+Math.max(1,steps)*intervalMs).toISOString();
}

function autonomyInstructions(mode:AutonomyMode){
 if(mode==='guided')return 'Ejecuta exactamente el objetivo indicado. No amplíes el alcance sin necesidad.';
 if(mode==='independent')return 'Inspecciona primero el estado actual, decide la siguiente acción necesaria, ejecútala y verifica el resultado. No repitas trabajo ya completado.';
 return 'Actúa como responsable de progreso continuo: revisa el estado más reciente, identifica el bloque pendiente de mayor valor, avanza lo máximo seguro, prueba, corrige y deja preparado el siguiente paso. Cambia de estrategia ante fallos repetidos. No repitas trabajo ya completado.';
}

export function renderScheduledPrompt(task:ScheduledTaskDefinition,previous?:PreviousScheduledRun|null){
 const prior=[previous?.result,previous?.last_error].filter(Boolean).join('\n').slice(0,6000);
 return [
  `TAREA PROGRAMADA: ${task.title}`,
  `OBJETIVO\n${task.prompt}`,
  `NIVEL DE INTELIGENCIA\n${task.reasoning_level==='high'?'Alto: usa el modelo de razonamiento profundo y valida antes de concluir.':'Estándar: usa el enrutamiento normal según complejidad.'}`,
  `AUTONOMÍA\n${autonomyInstructions(task.autonomy_mode)}`,
  `REGLAS DE CONTINUIDAD\n- Conserva evidencia de lo realizado.\n- Distingue cambios comprobados, pendientes y bloqueos.\n- No declares éxito sin pruebas.\n- Para código, trabaja mediante rama y PR verificable; no fusiones automáticamente.`,
  prior?`RESULTADO DE LA EJECUCIÓN ANTERIOR (${previous?.status||'desconocido'})\n${prior}`:'PRIMERA EJECUCIÓN\nNo existe resultado previo; establece una línea base antes de actuar.'
 ].join('\n\n');
}
