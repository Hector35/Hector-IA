export type GlobalQualityAlert={id:string;task:string;state:'active'|'resolved';reason:string;acknowledgedAt:string|null;mutedUntil:string|null;resolvedAt:string|null;muted:boolean};
export type AlertSnapshot=Record<string,'active'|'resolved'>;
export type AlertTransition={kind:'activated'|'recovered';alert:GlobalQualityAlert};

const STORAGE_KEY='hector:quality-alert-snapshot:v1';
const api=async<T>(path:string):Promise<T>=>{const response=await fetch(path,{credentials:'include',headers:{Accept:'application/json'}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error((data as any).error||'No disponible');return data as T;};

export function alertsRequiringAttention(items:GlobalQualityAlert[],nowMs=Date.now()){
 return items.filter(item=>item.state==='active'&&!item.acknowledgedAt&&(!item.mutedUntil||new Date(item.mutedUntil).getTime()<=nowMs));
}

export function detectAlertTransitions(previous:AlertSnapshot,items:GlobalQualityAlert[],notifyExisting=false){
 const transitions:AlertTransition[]=[];
 for(const alert of items){
  const before=previous[alert.id];
  if(alert.state==='active'&&!alert.acknowledgedAt&&!alert.muted){
   if(before==='resolved'||(notifyExisting&&before===undefined))transitions.push({kind:'activated',alert});
  }
  if(alert.state==='resolved'&&before==='active')transitions.push({kind:'recovered',alert});
 }
 return transitions;
}

export function snapshotAlerts(items:GlobalQualityAlert[]):AlertSnapshot{return Object.fromEntries(items.map(item=>[item.id,item.state]));}

function loadSnapshot():AlertSnapshot{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}') as AlertSnapshot;}catch{return{};}}
function saveSnapshot(snapshot:AlertSnapshot){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));}catch{}}
function settingsButton(){return[...document.querySelectorAll<HTMLButtonElement>('.cxSidebar nav button')].find(button=>button.textContent?.includes('Ajustes'));}
function openQualityAlerts(){settingsButton()?.click();let attempts=0;const reveal=()=>{const section=document.querySelector<HTMLElement>('.cxQualityAlerts');if(section){section.scrollIntoView({behavior:'smooth',block:'start'});return;}if(attempts++<20)window.setTimeout(reveal,100);};window.setTimeout(reveal,80);}

function toast(transition:AlertTransition){
 const node=document.createElement('button');node.type='button';node.className=`hxQualityToast ${transition.kind}`;node.setAttribute('role','status');
 const strong=document.createElement('strong'),detail=document.createElement('span');
 strong.textContent=transition.kind==='activated'?'Protección de calidad activada':'Calidad recuperada';
 detail.textContent=transition.kind==='activated'?`${transition.alert.task}: ${transition.alert.reason}`:`${transition.alert.task} volvió a estado estable.`;
 node.append(strong,detail);node.onclick=openQualityAlerts;document.body.append(node);
 window.setTimeout(()=>node.classList.add('visible'),20);window.setTimeout(()=>{node.classList.remove('visible');window.setTimeout(()=>node.remove(),250);},6500);
}

export function installGlobalQualityAlertIndicator(){
 let badge:HTMLButtonElement|undefined,timer:number|undefined,initialized=false;
 const mount=()=>{
  const top=document.querySelector<HTMLElement>('.cxSidebarTop');if(!top)return false;
  badge=top.querySelector<HTMLButtonElement>('.hxQualityIndicator')||document.createElement('button');
  if(!badge.classList.contains('hxQualityIndicator')){badge.type='button';badge.className='hxQualityIndicator';badge.setAttribute('aria-label','Abrir alertas de calidad');badge.onclick=openQualityAlerts;top.append(badge);}
  return true;
 };
 const load=async()=>{
  if(!mount())return;
  try{
   const data=await api<{items:GlobalQualityAlert[]}>('/api/intelligence/budget/quality-alerts'),items=data.items||[],attention=alertsRequiringAttention(items),previous=loadSnapshot(),transitions=detectAlertTransitions(previous,items,initialized);
   badge!.textContent=attention.length?`Calidad ${attention.length}`:'Calidad estable';badge!.classList.toggle('active',attention.length>0);badge!.setAttribute('aria-label',attention.length?`${attention.length} alerta${attention.length===1?'':'s'} de calidad`:'Calidad estable');
   transitions.forEach(toast);saveSnapshot(snapshotAlerts(items));initialized=true;
  }catch{badge!.textContent='Calidad —';badge!.classList.remove('active');}
 };
 const scan=()=>{if(mount()&&!timer){void load();timer=window.setInterval(load,30000);}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();
 return()=>{observer.disconnect();if(timer)window.clearInterval(timer);badge?.remove();};
}
