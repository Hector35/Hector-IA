type ScheduledResult={id:string;title:string;last_job_id:string|null;last_job_status?:string|null;last_result_preview?:string|null;last_run_at:string|null};

const request=async<T>(path:string):Promise<T>=>{const response=await fetch(path,{credentials:'include',headers:{Accept:'application/json'}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};

export function programmedResultState(status?:string|null,result?:string|null){
 const value=(status||'').toLowerCase();
 if(['queued','working','testing','repairing','running'].includes(value))return{label:'En ejecución',tone:'running',message:'Héctor OS está trabajando en esta tarea.'};
 if(value==='completed')return{label:'Completada',tone:'completed',message:result?.trim()||'La ejecución terminó correctamente.'};
 if(['blocked','failed','error'].includes(value))return{label:'Requiere atención',tone:'failed',message:result?.trim()||'La última ejecución no pudo completarse.'};
 if(value==='paused')return{label:'Pausada',tone:'paused',message:result?.trim()||'La ejecución está pausada.'};
 return{label:'Sin resultado',tone:'idle',message:result?.trim()||'Todavía no existe una ejecución registrada.'};
}

function formatDate(value:string|null){if(!value)return'';const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`,date=new Date(normalized);return Number.isNaN(date.getTime())?'':date.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});}
function openScheduledTask(title:string){const card=[...document.querySelectorAll<HTMLElement>('.cxProgramCard')].find(node=>node.querySelector('strong')?.textContent?.trim()===title);const button=[...card?.querySelectorAll<HTMLButtonElement>('button')||[]].find(node=>node.textContent?.trim()==='Abrir');button?.click();card?.scrollIntoView({behavior:'smooth',block:'center'});}

export function installProgrammedResultsEnhancer(){
 let host:HTMLElement|undefined,timer:number|undefined,loading=false;
 const load=async()=>{if(!host||loading)return;loading=true;try{const response=await request<{items:ScheduledResult[]}>('/api/schedules'),items=(response.items||[]).filter(item=>item.last_job_id).sort((a,b)=>Date.parse(b.last_run_at||'')-Date.parse(a.last_run_at||'')).slice(0,5);host.replaceChildren();const head=el('header','hxProgramResultsHead');const copy=el('div');copy.append(el('span',undefined,'Actividad reciente'),el('h3',undefined,'Últimos resultados'));head.append(copy);host.append(head);if(!items.length){host.append(el('p','hxProgramResultsEmpty','Cuando se ejecute una tarea, su estado y resultado aparecerán aquí.'));return;}const list=el('div','hxProgramResultsList');for(const item of items){const state=programmedResultState(item.last_job_status,item.last_result_preview),card=el('article',`hxProgramResult ${state.tone}`),top=el('div','hxProgramResultTop'),title=el('strong',undefined,item.title),badge=el('span',state.tone,state.label);top.append(title,badge);const message=el('p',undefined,state.message),footer=el('div','hxProgramResultFooter'),date=el('small',undefined,formatDate(item.last_run_at)),open=el('button',undefined,'Abrir tarea');open.type='button';open.onclick=()=>openScheduledTask(item.title);footer.append(date,open);card.append(top,message,footer);list.append(card);}host.append(list);}catch(error){host.replaceChildren(el('p','hxProgramResultsError',error instanceof Error?error.message:'No se pudieron cargar los resultados'));}finally{loading=false;}};
 const mount=()=>{const schedules=document.querySelector<HTMLElement>('.cxSchedules');if(!schedules){if(host&&!document.body.contains(host)){host=undefined;if(timer)window.clearInterval(timer);timer=undefined;}return;}if(schedules.querySelector('.hxProgramResults'))return;host=el('section','hxProgramResults');const layout=schedules.querySelector('.cxProgramLayout');layout?.insertAdjacentElement('beforebegin',host);void load();timer=window.setInterval(()=>void load(),5000);};
 const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});mount();return()=>{observer.disconnect();if(timer)window.clearInterval(timer);};
}
