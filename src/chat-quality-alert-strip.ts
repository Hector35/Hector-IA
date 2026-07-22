export type ChatQualityAlert={id:string;task:string;state:'active'|'resolved';reason:string;sampleCount:number;acknowledgedAt:string|null;mutedUntil:string|null;muted:boolean};

export function actionableChatAlerts(items:ChatQualityAlert[],nowMs=Date.now()){
 return items.filter(item=>item.state==='active'&&!item.acknowledgedAt&&(!item.mutedUntil||new Date(item.mutedUntil).getTime()<=nowMs));
}

const api=async<T>(path:string,init?:RequestInit):Promise<T>=>{const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};
function findComposer(){return document.querySelector<HTMLFormElement>('.cxComposer');}

export function installChatQualityAlertStrip(){
 let composer:HTMLFormElement|undefined,strip:HTMLElement|undefined,timer:number|undefined;
 const remove=()=>{strip?.remove();strip=undefined;};
 const acknowledge=async(id:string,button:HTMLButtonElement)=>{button.disabled=true;try{await api(`/api/intelligence/budget/quality-alerts/${id}/action`,{method:'POST',body:JSON.stringify({action:'acknowledge'})});await load();}catch{button.disabled=false;}};
 const render=(items:ChatQualityAlert[])=>{
  if(!composer)return;const actionable=actionableChatAlerts(items);if(!actionable.length){remove();return;}
  if(!strip){strip=document.createElement('aside');strip.className='cxChatQualityAlert';strip.setAttribute('role','status');strip.setAttribute('aria-live','polite');composer.insertAdjacentElement('beforebegin',strip);}
  strip.replaceChildren();const first=actionable[0],copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),button=document.createElement('button');title.textContent=`Ahorro suspendido: ${first.task}`;detail.textContent=`${first.reason} · ${first.sampleCount} muestras${actionable.length>1?` · ${actionable.length-1} alerta${actionable.length===2?'':'s'} adicional${actionable.length===2?'':'es'}`:''}`;button.type='button';button.textContent='Reconocer';button.onclick=()=>void acknowledge(first.id,button);copy.append(title,detail);strip.append(copy,button);
 };
 const load=async()=>{try{const data=await api<{items:ChatQualityAlert[]}>('/api/intelligence/budget/quality-alerts');render(data.items||[]);}catch{remove();}};
 const mount=(form:HTMLFormElement)=>{composer=form;void load();if(timer)window.clearInterval(timer);timer=window.setInterval(()=>{if(composer&&document.body.contains(composer))void load();},30000);};
 const scan=()=>{const next=findComposer();if(next&&next!==composer)mount(next);if(composer&&!document.body.contains(composer)){composer=undefined;remove();if(timer)window.clearInterval(timer);timer=undefined;}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();return()=>{observer.disconnect();remove();if(timer)window.clearInterval(timer);};
}
