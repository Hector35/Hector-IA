type ScheduledTask={id:string;title:string;prompt:string;enabled:boolean;next_run_at:string};

const request=async<T>(path:string,init?:RequestInit):Promise<T>=>{const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};

export function snoozedRunAt(nextRunAt:string,now=new Date(),minutes=60){
 const parsed=new Date(nextRunAt),base=Number.isNaN(parsed.getTime())||parsed.getTime()<now.getTime()?now:parsed;
 return new Date(base.getTime()+Math.max(1,minutes)*60_000);
}

function announce(message:string,tone:'good'|'bad'='good'){
 const notice=document.querySelector<HTMLElement>('.cxScheduleNotice');
 if(notice){notice.className=`cxScheduleNotice ${tone}`;notice.textContent=message;notice.scrollIntoView({behavior:'smooth',block:'nearest'});return;}
 let toast=document.querySelector<HTMLElement>('.hxProgramSnoozeToast');if(!toast){toast=document.createElement('p');toast.className='hxProgramSnoozeToast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);}toast.className=`hxProgramSnoozeToast ${tone}`;toast.textContent=message;window.setTimeout(()=>toast?.remove(),5000);
}

function findItem(card:HTMLElement,items:ScheduledTask[]){const title=card.querySelector('strong')?.textContent?.trim()||'',prompt=card.querySelector('small')?.textContent?.trim()||'';return items.find(item=>item.title===title&&item.prompt===prompt)||items.find(item=>item.title===title);}

export function installProgrammedSnoozeEnhancer(){
 let items:ScheduledTask[]=[],loading=false;
 const load=async()=>{if(loading)return;loading=true;try{items=(await request<{items:ScheduledTask[]}>('/api/schedules')).items||[];}catch{}finally{loading=false;decorate();}};
 const decorate=()=>{for(const card of document.querySelectorAll<HTMLElement>('.cxProgramCard')){if(card.dataset.snoozeReady==='1')continue;const actions=card.querySelector<HTMLElement>('.cxProgramActions');if(!actions)continue;const item=findItem(card,items);if(!item)continue;card.dataset.snoozeReady='1';const button=document.createElement('button');button.type='button';button.className='secondary hxProgramSnooze';button.textContent='Posponer 1 h';button.setAttribute('aria-label',`Posponer una hora ${item.title}`);button.disabled=!item.enabled;button.title=item.enabled?'Mover la próxima ejecución una hora sin pausar la tarea':'Activa la tarea para poder posponerla';button.onclick=async()=>{button.disabled=true;button.textContent='Posponiendo…';try{const nextRunAt=snoozedRunAt(item.next_run_at);await request(`/api/schedules/${item.id}`,{method:'PATCH',body:JSON.stringify({nextRunAt:nextRunAt.toISOString()})});announce(`Próxima ejecución pospuesta hasta ${nextRunAt.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})}.`);await load();}catch(error){announce(error instanceof Error?error.message:'No se pudo posponer','bad');}finally{button.disabled=!item.enabled;button.textContent='Posponer 1 h';}};actions.insertBefore(button,actions.lastElementChild||null);}}
 const scan=()=>{if(!document.querySelector('.cxSchedules'))return;decorate();if(!loading&&document.querySelector('.cxProgramCard:not([data-snooze-ready="1"])'))void load();};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});void load();scan();return()=>observer.disconnect();
}
