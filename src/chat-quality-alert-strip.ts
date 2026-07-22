export type ChatQualityAlert={id:string;task:string;state:'active'|'resolved';reason:string;sampleCount:number;acknowledgedAt:string|null;mutedUntil:string|null;muted:boolean};
export type ChatQualityAction='probe'|'protect'|'mute'|'acknowledge';

export function actionableChatAlerts(items:ChatQualityAlert[],nowMs=Date.now()){
 return items.filter(item=>item.state==='active'&&!item.acknowledgedAt&&(!item.mutedUntil||new Date(item.mutedUntil).getTime()<=nowMs));
}

export function governanceReason(action:'probe'|'protect',task:string){
 return action==='probe'?`Prueba controlada solicitada desde la alerta del chat para ${task}.`:`Protección manual aplicada desde la alerta del chat para ${task}.`;
}

const api=async<T>(path:string,init?:RequestInit):Promise<T>=>{const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};
function findComposer(){return document.querySelector<HTMLFormElement>('.cxComposer');}

export function installChatQualityAlertStrip(){
 let composer:HTMLFormElement|undefined,strip:HTMLElement|undefined,timer:number|undefined;
 const remove=()=>{strip?.remove();strip=undefined;};
 const disable=(buttons:HTMLButtonElement[],value:boolean)=>buttons.forEach(button=>button.disabled=value);
 const alertAction=async(alert:ChatQualityAlert,action:ChatQualityAction,buttons:HTMLButtonElement[])=>{
  disable(buttons,true);
  try{
   if(action==='probe'||action==='protect')await api(`/api/intelligence/budget/quality-governance/${encodeURIComponent(alert.task)}`,{method:'PUT',body:JSON.stringify({mode:action,reason:governanceReason(action,alert.task)})});
   await api(`/api/intelligence/budget/quality-alerts/${alert.id}/action`,{method:'POST',body:JSON.stringify(action==='mute'?{action:'mute',muteHours:24}:{action:'acknowledge'})});
   await load();
  }catch{disable(buttons,false);}
 };
 const render=(items:ChatQualityAlert[])=>{
  if(!composer)return;const actionable=actionableChatAlerts(items);if(!actionable.length){remove();return;}
  if(!strip){strip=document.createElement('aside');strip.className='cxChatQualityAlert';strip.setAttribute('role','alert');strip.setAttribute('aria-live','polite');composer.insertAdjacentElement('beforebegin',strip);}
  strip.replaceChildren();const first=actionable[0],copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),actions=document.createElement('div');actions.className='cxChatQualityAlertActions';title.textContent=`Ahorro suspendido: ${first.task}`;detail.textContent=`${first.reason} · ${first.sampleCount} muestras${actionable.length>1?` · ${actionable.length-1} alerta${actionable.length===2?'':'s'} adicional${actionable.length===2?'':'es'}`:''}`;
  const probe=document.createElement('button'),protect=document.createElement('button'),mute=document.createElement('button'),buttons=[probe,protect,mute];
  probe.type=protect.type=mute.type='button';probe.textContent='Probar ahora';protect.textContent='Mantener protegida';mute.textContent='Silenciar 24 h';probe.onclick=()=>void alertAction(first,'probe',buttons);protect.onclick=()=>void alertAction(first,'protect',buttons);mute.onclick=()=>void alertAction(first,'mute',buttons);actions.append(probe,protect,mute);copy.append(title,detail);strip.append(copy,actions);
 };
 const load=async()=>{try{const data=await api<{items:ChatQualityAlert[]}>('/api/intelligence/budget/quality-alerts');render(data.items||[]);}catch{remove();}};
 const mount=(form:HTMLFormElement)=>{composer=form;void load();if(timer)window.clearInterval(timer);timer=window.setInterval(()=>{if(composer&&document.body.contains(composer))void load();},30000);};
 const scan=()=>{const next=findComposer();if(next&&next!==composer)mount(next);if(composer&&!document.body.contains(composer)){composer=undefined;remove();if(timer)window.clearInterval(timer);timer=undefined;}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();return()=>{observer.disconnect();remove();if(timer)window.clearInterval(timer);};
}
