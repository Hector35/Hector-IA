type ScheduleCadence='once'|'custom_minutes'|'hourly'|'every_2_hours'|'every_6_hours'|'daily'|'weekly';
type ScheduledTask={id:string;title:string;prompt:string;kind:string;cadence:ScheduleCadence;interval_minutes:number|null;reasoning_level:'standard'|'high';autonomy_mode:'guided'|'independent'|'continuous';allow_web:boolean};

const request=async<T>(path:string,init?:RequestInit):Promise<T>=>{const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};
const normalize=(value:string)=>value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

export function duplicateProgrammedTitle(title:string){const base=`Copia de ${title.trim()||'Programado'}`;return base.slice(0,100);}
export function duplicateProgrammedPayload(item:ScheduledTask,now=new Date()){return{title:duplicateProgrammedTitle(item.title),prompt:item.prompt,kind:item.kind,cadence:item.cadence,intervalMinutes:item.cadence==='custom_minutes'?item.interval_minutes||15:undefined,firstRunAt:new Date(now.getTime()+5*60_000).toISOString(),reasoningLevel:item.reasoning_level,autonomyMode:item.autonomy_mode,allowWeb:Boolean(item.allow_web)};}

function announce(message:string,tone:'good'|'bad'='good'){
 const notice=document.querySelector<HTMLElement>('.cxScheduleNotice');
 if(notice){notice.className=`cxScheduleNotice ${tone}`;notice.textContent=message;notice.scrollIntoView({behavior:'smooth',block:'nearest'});return;}
 let toast=document.querySelector<HTMLElement>('.hxProgramDuplicateToast');if(!toast){toast=document.createElement('p');toast.className='hxProgramDuplicateToast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);}toast.className=`hxProgramDuplicateToast ${tone}`;toast.textContent=message;window.setTimeout(()=>toast?.remove(),5000);
}

function findItem(card:HTMLElement,items:ScheduledTask[]){const title=card.querySelector('strong')?.textContent?.trim()||'',prompt=card.querySelector('small')?.textContent?.trim()||'';return items.find(item=>item.title===title&&item.prompt===prompt)||items.find(item=>item.title===title);}
function focusCopy(title:string){let attempts=0;const timer=window.setInterval(()=>{const card=[...document.querySelectorAll<HTMLElement>('.cxProgramCard')].find(node=>node.querySelector('strong')?.textContent?.trim()===title);if(card){window.clearInterval(timer);card.scrollIntoView({behavior:'smooth',block:'center'});card.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});}else if(++attempts>=30)window.clearInterval(timer);},400);}

export function installProgrammedDuplicateEnhancer(){
 let items:ScheduledTask[]=[],loading=false;
 const load=async()=>{if(loading)return;loading=true;try{items=(await request<{items:ScheduledTask[]}>('/api/schedules')).items||[];}catch{}finally{loading=false;decorate();}};
 const decorate=()=>{for(const card of document.querySelectorAll<HTMLElement>('.cxProgramCard')){if(card.dataset.duplicateReady==='1')continue;const actions=card.querySelector<HTMLElement>('.cxProgramActions');if(!actions)continue;const item=findItem(card,items);if(!item)continue;card.dataset.duplicateReady='1';const button=document.createElement('button');button.type='button';button.className='secondary hxProgramDuplicate';button.textContent='Duplicar';button.setAttribute('aria-label',`Duplicar ${item.title}`);button.onclick=async()=>{button.disabled=true;button.textContent='Duplicando…';let createdId:string|undefined;try{const payload=duplicateProgrammedPayload(item),created=await request<{item:{id:string;title:string}}>('/api/schedules',{method:'POST',body:JSON.stringify(payload)});createdId=created.item.id;try{await request(`/api/schedules/${createdId}`,{method:'PATCH',body:JSON.stringify({enabled:false})});}catch(error){await request(`/api/schedules/${createdId}`,{method:'DELETE'}).catch(()=>{});throw error;}announce(`Copia creada y pausada: ${payload.title}`);focusCopy(payload.title);await load();}catch(error){announce(error instanceof Error?error.message:'No se pudo duplicar','bad');}finally{button.disabled=false;button.textContent='Duplicar';}};actions.insertBefore(button,actions.lastElementChild||null);}}
 const scan=()=>{if(!document.querySelector('.cxSchedules'))return;decorate();if(!loading&&document.querySelector('.cxProgramCard:not([data-duplicate-ready="1"])'))void load();};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});void load();scan();return()=>observer.disconnect();
}
