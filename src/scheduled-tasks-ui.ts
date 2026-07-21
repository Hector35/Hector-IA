type ScheduleCadence='once'|'hourly'|'every_2_hours'|'every_6_hours'|'daily'|'weekly';
type ReasoningLevel='standard'|'high';
type AutonomyMode='guided'|'independent'|'continuous';
type ScheduledTask={
 id:string;title:string;prompt:string;kind:string;cadence:ScheduleCadence;reasoning_level:ReasoningLevel;autonomy_mode:AutonomyMode;
 allow_web:boolean;enabled:boolean;next_run_at:string;last_run_at:string|null;run_count:number;failure_count:number;skipped_count:number;
 last_job_id:string|null;last_job_status?:string|null;last_result_preview?:string|null;created_at:string;updated_at:string;
};

const api=async<T>(path:string,init?:RequestInit):Promise<T>=>{
 const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');
 const response=await fetch(path,{credentials:'include',...init,headers});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'No disponible');
 return data as T;
};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const labels={
 cadence:{once:'Una vez',hourly:'Cada hora',every_2_hours:'Cada 2 horas',every_6_hours:'Cada 6 horas',daily:'Cada día',weekly:'Cada semana'} as Record<ScheduleCadence,string>,
 autonomy:{guided:'Guiada',independent:'Independiente',continuous:'Progreso continuo'} as Record<AutonomyMode,string>,
 reasoning:{standard:'Estándar',high:'Alta'} as Record<ReasoningLevel,string>,
 status:{queued:'En cola',working:'Trabajando',testing:'Probando',repairing:'Corrigiendo',completed:'Completado',blocked:'Bloqueado'} as Record<string,string>
};
function formatDate(value:string|null){if(!value)return'—';const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`;const date=new Date(normalized);return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});}
function localDateTime(date:Date){const local=new Date(date.getTime()-date.getTimezoneOffset()*60_000);return local.toISOString().slice(0,16);}
function findWorkPage(){return[...document.querySelectorAll<HTMLElement>('.cxPage')].find(page=>page.querySelector('h1')?.textContent?.trim()==='Trabajo');}

export function installScheduledTasksEnhancer(){
 let mountedRoot:HTMLElement|undefined;
 let timer:number|undefined;
 let list:HTMLElement|undefined;
 let notice:HTMLElement|undefined;

 const load=async()=>{
  if(!list)return;
  try{
   const response=await api<{items:ScheduledTask[]}>('/api/schedules');
   const items=response.items||[];list.replaceChildren();
   if(!items.length){list.append(el('div','cxScheduleEmpty','Todavía no hay tareas programadas. Crea la primera arriba.'));return;}
   for(const item of items){
    const card=el('article',`cxScheduleCard ${item.enabled?'enabled':'paused'}`);
    const head=el('header');
    const title=el('div');title.append(el('strong',undefined,item.title),el('span',undefined,`${item.kind} · ${labels.cadence[item.cadence]}`));
    const state=item.enabled?(item.last_job_status?labels.status[item.last_job_status]||item.last_job_status:'Activa'):(item.cadence==='once'&&item.run_count>0?'Finalizada':'Pausada');
    head.append(title,el('span',`cxScheduleStatus ${item.last_job_status||(item.enabled?'active':'paused')}`,state));
    const badges=el('div','cxScheduleBadges');
    badges.append(el('span',item.reasoning_level==='high'?'high':'',`Inteligencia ${labels.reasoning[item.reasoning_level]}`),el('span',item.autonomy_mode,item.autonomy_mode==='continuous'?'Autonomía continua':labels.autonomy[item.autonomy_mode]),el('span',item.allow_web?'web':'',item.allow_web?'Web activada':'Sin web'));
    const meta=el('div','cxScheduleMeta');meta.append(el('span',undefined,`Próxima: ${item.enabled?formatDate(item.next_run_at):'—'}`),el('span',undefined,`Ejecuciones: ${item.run_count}`));
    const prompt=el('p','cxSchedulePrompt',item.prompt);
    card.append(head,badges,meta,prompt);
    if(item.last_result_preview){const details=el('details','cxScheduleResult');details.append(el('summary',undefined,'Último resultado'),el('p',undefined,item.last_result_preview));card.append(details);}
    if(item.failure_count||item.skipped_count)card.append(el('p','cxScheduleWarnings',`${item.failure_count} fallo${item.failure_count===1?'':'s'} · ${item.skipped_count} aplazamiento${item.skipped_count===1?'':'s'}`));
    const actions=el('div','cxScheduleActions');
    const run=el('button',undefined,'Ejecutar ahora');run.type='button';run.onclick=async()=>{run.disabled=true;try{await api(`/api/schedules/${item.id}/run-now`,{method:'POST'});setNotice('Ejecución creada. Aparecerá también en Trabajos y evidencia.','good');await load();}catch(error){setNotice(error instanceof Error?error.message:'No se pudo ejecutar','bad');}finally{run.disabled=false;}};
    const toggle=el('button','secondary',item.enabled?'Pausar':'Reanudar');toggle.type='button';toggle.onclick=async()=>{toggle.disabled=true;try{await api(`/api/schedules/${item.id}`,{method:'PATCH',body:JSON.stringify({enabled:!item.enabled})});setNotice(item.enabled?'Tarea pausada.':'Tarea reanudada.','good');await load();}catch(error){setNotice(error instanceof Error?error.message:'No se pudo actualizar','bad');}finally{toggle.disabled=false;}};
    const remove=el('button','danger','Eliminar');remove.type='button';remove.onclick=async()=>{if(!window.confirm(`Eliminar “${item.title}”? Los trabajos ya creados se conservarán.`))return;remove.disabled=true;try{await api(`/api/schedules/${item.id}`,{method:'DELETE'});setNotice('Tarea programada eliminada.','good');await load();}catch(error){setNotice(error instanceof Error?error.message:'No se pudo eliminar','bad');}finally{remove.disabled=false;}};
    actions.append(run,toggle,remove);card.append(actions);list.append(card);
   }
  }catch(error){list.replaceChildren(el('div','cxScheduleError',error instanceof Error?error.message:'No se pudieron cargar las tareas programadas'));}
 };
 const setNotice=(message:string,state:''|'good'|'bad'='')=>{if(!notice)return;notice.className=`cxScheduleNotice ${state}`;notice.textContent=message;};

 const render=async(root:HTMLElement)=>{
  if(root.dataset.schedulesReady==='1')return;root.dataset.schedulesReady='1';mountedRoot=root;
  const section=el('section','cxSchedules');
  const heading=el('div','cxSchedulesHead');const copy=el('div');copy.append(el('span',undefined,'Autonomía programada'),el('h2',undefined,'Tareas con inteligencia alta'),el('p',undefined,'Ejecuta trabajo una vez o de forma recurrente. En modo continuo usa el resultado anterior y avanza el siguiente bloque sin repetirlo.'));heading.append(copy);section.append(heading);
  const form=el('form','cxScheduleForm');
  const title=document.createElement('input');title.name='title';title.required=true;title.minLength=3;title.maxLength=100;title.placeholder='Nombre de la tarea';title.setAttribute('aria-label','Nombre de la tarea');
  const prompt=document.createElement('textarea');prompt.name='prompt';prompt.required=true;prompt.minLength=10;prompt.maxLength=8000;prompt.placeholder='Qué debe revisar, construir o continuar…';prompt.setAttribute('aria-label','Objetivo de la tarea');
  const kind=document.createElement('select');kind.name='kind';kind.setAttribute('aria-label','Tipo de tarea');[['programming','Programación'],['research','Investigación'],['learning','Aprendizaje'],['automation','Automatización'],['agent','Agente general'],['api','API'],['skill','Skill'],['update','Actualización']].forEach(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;kind.append(option);});
  const cadence=document.createElement('select');cadence.name='cadence';cadence.setAttribute('aria-label','Repetición');(['once','hourly','every_2_hours','every_6_hours','daily','weekly'] as ScheduleCadence[]).forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=labels.cadence[value];cadence.append(option);});cadence.value='hourly';
  const firstRun=document.createElement('input');firstRun.type='datetime-local';firstRun.required=true;firstRun.value=localDateTime(new Date(Date.now()+5*60_000));firstRun.min=localDateTime(new Date());firstRun.setAttribute('aria-label','Primera ejecución');
  const reasoning=document.createElement('select');reasoning.setAttribute('aria-label','Nivel de inteligencia');[['high','Inteligencia alta'],['standard','Inteligencia estándar']].forEach(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;reasoning.append(option);});
  const autonomy=document.createElement('select');autonomy.setAttribute('aria-label','Nivel de autonomía');[['continuous','Progreso continuo'],['independent','Independiente'],['guided','Guiada']].forEach(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;autonomy.append(option);});
  const webLabel=el('label','cxScheduleCheck');const web=document.createElement('input');web.type='checkbox';web.checked=true;webLabel.append(web,el('span',undefined,'Permitir búsqueda web cuando sea necesaria'));
  const grid=el('div','cxScheduleGrid');
  const field=(labelText:string,input:HTMLElement)=>{const label=el('label');label.append(el('span',undefined,labelText),input);return label;};
  grid.append(field('Nombre',title),field('Tipo',kind),field('Primera ejecución',firstRun),field('Repetición',cadence),field('Inteligencia',reasoning),field('Autonomía',autonomy));
  const submit=el('button','primary','Programar tarea');submit.type='submit';notice=el('p','cxScheduleNotice');
  form.append(grid,field('Objetivo',prompt),webLabel,submit,notice);section.append(form);
  const listHead=el('div','cxScheduleListHead');listHead.append(el('h3',undefined,'Programadas'),el('span',undefined,Intl.DateTimeFormat().resolvedOptions().timeZone||'Hora local'));section.append(listHead);
  list=el('div','cxScheduleList');section.append(list);
  const anchor=root.querySelector('.cxPageHead');anchor?.insertAdjacentElement('afterend',section);
  form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;setNotice('Guardando tarea…');try{const when=new Date(firstRun.value);if(Number.isNaN(when.getTime()))throw new Error('Selecciona una fecha y hora válidas');await api('/api/schedules',{method:'POST',body:JSON.stringify({title:title.value,prompt:prompt.value,kind:kind.value,cadence:cadence.value,firstRunAt:when.toISOString(),reasoningLevel:reasoning.value,autonomyMode:autonomy.value,allowWeb:web.checked})});setNotice('Tarea programada. Cloudflare la revisará cada dos minutos.','good');title.value='';prompt.value='';firstRun.value=localDateTime(new Date(Date.now()+5*60_000));await load();}catch(error){setNotice(error instanceof Error?error.message:'No se pudo programar','bad');}finally{submit.disabled=false;}};
  await load();timer=window.setInterval(()=>{if(document.body.contains(root))void load();},10_000);
 };
 const scan=()=>{const page=findWorkPage();if(page&&!page.dataset.schedulesReady)void render(page);if(mountedRoot&&!document.body.contains(mountedRoot)){mountedRoot=undefined;list=undefined;notice=undefined;if(timer)window.clearInterval(timer);timer=undefined;}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();
 return()=>{observer.disconnect();if(timer)window.clearInterval(timer);};
}