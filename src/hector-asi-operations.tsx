import {useEffect,useState} from 'react';
import {CheckCircle2,Clock3,LoaderCircle} from 'lucide-react';

export type OperationReceipt={content:string;provider:string;model:string;modelTier:string};

type Intent='chat'|'work'|'programmed';
type ScheduleCadence='once'|'custom_minutes'|'hourly'|'every_2_hours'|'every_6_hours'|'daily'|'weekly';
type WorkItem={id:string;title:string;prompt:string;status:string;progress:number;result?:string|null;last_error?:string|null;attempt_count:number;updated_at:string};
type ScheduleItem={id:string;title:string;prompt:string;cadence:ScheduleCadence;interval_minutes:number|null;enabled:boolean;next_run_at:string;last_run_at:string|null;last_job_id:string|null;last_job_status?:string|null;last_result_preview?:string|null};

const normalize=(value:string)=>value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^¿/,'');

function classify(value:string):Intent{
  const raw=value.trim();
  if(!raw)return'chat';
  const text=normalize(raw),question=raw.includes('?')||/^(?:que|como|por que|para que|cual|cuando|donde|cuanto|cada cuanto|explica|puedes explicar)\b/.test(text);
  const supportedSchedule=/\b(?:cada\s+(?:\d{1,5}\s*(?:minutos?|horas?)|(?:una\s+)?hora|media\s+hora|(?:un\s+)?cuarto\s+de\s+hora|dia|semana)|diari[oa]|semanal(?:mente)?|(?:en|dentro\s+de)\s+\d{1,5}\s+minutos?|a\s+las?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/.test(text);
  const scheduleCommand=/^(?:programa(?:me)?|agenda|recuerdame|crea\s+(?:una\s+)?(?:tarea\s+)?programada|cada\b|diariamente\b|semanalmente\b|todos\s+los\b|todas\s+las\b)/.test(text);
  if(!question&&scheduleCommand&&supportedSchedule)return'programmed';
  const persistent=/\b(?:no\s+te\s+detengas|sigue\s+intentando|reintenta\s+hasta|busca\s+otra\s+alternativa|hasta\s+(?:terminar|completar|resolver|dejar(?:lo|la)?\s+funcionando))\b/.test(text);
  const workCommand=/^(?:modo\s+trabajo\b|trabaja\s+(?:en|hasta)\b|encargate\s+de\b|continua\s+(?:con|hasta)\b|termina\s+(?:la|el|este|esta|mi)\s+(?:app|aplicacion|proyecto|sistema|trabajo|implementacion)\b)/.test(text);
  return!question&&(persistent||workCommand)?'work':'chat';
}

async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');
  const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'No disponible');return data as T;
}

function parseClock(source:string,now:Date){
  const match=source.match(/\ba\s+las?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);if(!match)return null;
  let hour=Number(match[1]),minute=Number(match[2]||0);if(match[3]?.toLowerCase()==='pm'&&hour<12)hour+=12;if(match[3]?.toLowerCase()==='am'&&hour===12)hour=0;if(hour>23||minute>59)return null;
  const date=new Date(now);date.setSeconds(0,0);date.setHours(hour,minute,0,0);if(date.getTime()<=now.getTime())date.setDate(date.getDate()+1);return date;
}

function parseProgrammed(value:string,now=new Date()){
  const prompt=value.replace(/\s+/g,' ').trim(),normalized=normalize(prompt);let cadence:ScheduleCadence='once',intervalMinutes:number|undefined;
  const minutes=normalized.match(/cada\s+(\d{1,5})\s*minutos?/),hours=normalized.match(/cada\s+(\d{1,3})\s*horas?/),after=normalized.match(/(?:en|dentro de)\s+(\d{1,5})\s*minutos?/);
  if(minutes){cadence='custom_minutes';intervalMinutes=Math.max(1,Math.min(10080,Number(minutes[1])));}else if(/cada\s+(?:un\s+)?cuarto\s+de\s+hora/.test(normalized)){cadence='custom_minutes';intervalMinutes=15;}else if(/cada\s+media\s+hora/.test(normalized)){cadence='custom_minutes';intervalMinutes=30;}else if(hours){const amount=Math.max(1,Math.min(168,Number(hours[1])));if(amount===1)cadence='hourly';else if(amount===2)cadence='every_2_hours';else if(amount===6)cadence='every_6_hours';else{cadence='custom_minutes';intervalMinutes=amount*60;}}else if(/cada\s+hora|cada\s+una\s+hora/.test(normalized))cadence='hourly';else if(/cada\s+dia|diari[oa]/.test(normalized))cadence='daily';else if(/cada\s+semana|semanal/.test(normalized))cadence='weekly';
  let first=new Date(now.getTime()+5*60_000);const clock=parseClock(normalized,now);if(clock)first=clock;else if(after)first=new Date(now.getTime()+Math.max(1,Math.min(10080,Number(after[1])))*60_000);
  const title=(prompt.split(/[.!?]/)[0]||'Nueva tarea programada').replace(/^(cada|en|dentro de)\s+/i,'').slice(0,96);
  return{title,prompt,cadence,intervalMinutes,firstRunAt:first.toISOString()};
}

const cadenceLabel=(cadence:ScheduleCadence,minutes?:number)=>cadence==='custom_minutes'?`cada ${minutes} minutos`:({once:'una vez',hourly:'cada hora',every_2_hours:'cada 2 horas',every_6_hours:'cada 6 horas',daily:'cada día',weekly:'cada semana'} as Record<ScheduleCadence,string>)[cadence];
const formatDate=(value?:string|null)=>{if(!value)return'—';const date=new Date(value.includes('T')?value:`${value.replace(' ','T')}Z`);return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});};

export async function executeOperation(command:string):Promise<OperationReceipt|null>{
  const intent=classify(command);if(intent==='chat')return null;
  if(intent==='work'){
    const response=await request<{item:WorkItem}>('/api/work-mode',{method:'POST',body:JSON.stringify({goal:command})});
    return{content:`## Trabajo autónomo iniciado\n- **Objetivo:** ${response.item.title||command}\n- **Estado:** preparado para continuar por ciclos\n- **Comprobación:** el seguimiento aparecerá automáticamente dentro de este chat.`,provider:'system',model:'hector-work-mode',modelTier:'verified'};
  }
  const parsed=parseProgrammed(command);
  const response=await request<{item:{id:string}}>('/api/schedules',{method:'POST',body:JSON.stringify({title:parsed.title,prompt:parsed.prompt,kind:'agent',cadence:parsed.cadence,intervalMinutes:parsed.cadence==='custom_minutes'?parsed.intervalMinutes:undefined,firstRunAt:parsed.firstRunAt,reasoningLevel:'high',autonomyMode:'continuous',allowWeb:true})});
  return{content:`## Programación creada\n- **Tarea:** ${parsed.title}\n- **Frecuencia:** ${cadenceLabel(parsed.cadence,parsed.intervalMinutes)}\n- **Primera ejecución:** ${formatDate(parsed.firstRunAt)}\n- **Comprobación:** sus ejecuciones y resultados aparecerán aquí mismo.\n- **ID:** ${response.item.id}`,provider:'system',model:'hector-scheduler',modelTier:'verified'};
}

function workState(item:WorkItem){
  if(item.status==='completed')return{label:'Completado',tone:'completed',detail:item.result||'Objetivo completado.'};
  if(item.status==='blocked')return{label:'Requiere atención',tone:'failed',detail:item.last_error||'El trabajo quedó bloqueado.'};
  if(['working','testing','repairing'].includes(item.status))return{label:'Trabajando',tone:'running',detail:item.result||`Ciclo ${item.attempt_count||1} en curso.`};
  return{label:'Preparándose',tone:'queued',detail:item.result||'Esperando el siguiente ciclo.'};
}

function scheduleState(item:ScheduleItem){
  const status=(item.last_job_status||'').toLowerCase();
  if(['queued','working','testing','repairing','running'].includes(status))return{label:'En ejecución',tone:'running',detail:item.last_result_preview||'La tarea está ejecutándose.'};
  if(status==='completed')return{label:'Completada',tone:'completed',detail:item.last_result_preview||'La última ejecución terminó correctamente.'};
  if(['blocked','failed','error'].includes(status))return{label:'Requiere atención',tone:'failed',detail:item.last_result_preview||'La última ejecución no pudo completarse.'};
  return{label:item.enabled?'Programada':'Pausada',tone:item.enabled?'queued':'paused',detail:item.enabled?`Próxima ejecución: ${formatDate(item.next_run_at)}`:'La programación está pausada.'};
}

export function AutonomousActivity({refreshToken}:{refreshToken:number}){
  const [work,setWork]=useState<WorkItem[]>([]),[schedules,setSchedules]=useState<ScheduleItem[]>([]);
  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      const [workResponse,scheduleResponse]=await Promise.all([
        request<{items:WorkItem[]}>('/api/work-mode').catch(()=>({items:[]})),
        request<{items:ScheduleItem[]}>('/api/schedules').catch(()=>({items:[]}))
      ]);
      if(cancelled)return;
      const workItems=(workResponse.items||[]).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,3);
      const scheduleItems=(scheduleResponse.items||[]).filter(item=>item.enabled||item.last_job_id).sort((a,b)=>Date.parse(b.last_run_at||b.next_run_at)-Date.parse(a.last_run_at||a.next_run_at)).slice(0,3);
      setWork(workItems);setSchedules(scheduleItems);
    };
    void load();const timer=window.setInterval(()=>void load(),8000);
    return()=>{cancelled=true;window.clearInterval(timer)};
  },[refreshToken]);
  if(!work.length&&!schedules.length)return null;
  return <section className="haActivity" aria-label="Actividad autónoma">
    <header><span>Actividad autónoma</span><strong>Acciones comprobables</strong></header>
    <div className="haActivityList">
      {work.map(item=>{const state=workState(item);return <article className={`haOperation ${state.tone}`} key={`work-${item.id}`}>
        <div className="haOperationIcon">{state.tone==='completed'?<CheckCircle2/>:<LoaderCircle/>}</div>
        <div><div className="haOperationTop"><strong>{item.title}</strong><span>{state.label}</span></div><p>{state.detail}</p><progress max="100" value={Math.max(0,Math.min(100,Number(item.progress)||0))}/><small>{Math.max(0,Math.min(100,Number(item.progress)||0))}% · actualizado {formatDate(item.updated_at)}</small></div>
      </article>})}
      {schedules.map(item=>{const state=scheduleState(item);return <article className={`haOperation schedule ${state.tone}`} key={`schedule-${item.id}`}>
        <div className="haOperationIcon"><Clock3/></div>
        <div><div className="haOperationTop"><strong>{item.title}</strong><span>{state.label}</span></div><p>{state.detail}</p><small>{cadenceLabel(item.cadence,item.interval_minutes||undefined)} · próxima {formatDate(item.next_run_at)}</small></div>
      </article>})}
    </div>
  </section>;
}
