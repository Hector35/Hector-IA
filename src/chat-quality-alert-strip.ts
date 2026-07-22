import {summarizeQualityProtectionImpact,type QualityImpactResponse,type QualityImpactSummary} from './quality-impact-summary';

export type ChatQualityAlert={id:string;task:string;state:'active'|'resolved';reason:string;sampleCount:number;acknowledgedAt:string|null;mutedUntil:string|null;muted:boolean};
export type ChatQualityAction='probe'|'protect'|'auto'|'mute'|'acknowledge';
export type GovernanceMode='auto'|'protect'|'probe'|'allow';
export type GovernanceResult={task:string;governance?:{mode?:GovernanceMode;reason?:string|null};policy?:{state?:string;reason?:string;nextProbeAt?:string|null}};

export function actionableChatAlerts(items:ChatQualityAlert[],nowMs=Date.now()){
 return items.filter(item=>item.state==='active'&&!item.acknowledgedAt&&(!item.mutedUntil||new Date(item.mutedUntil).getTime()<=nowMs));
}

export function governanceReason(action:'probe'|'protect'|'auto',task:string){
 if(action==='probe')return`Prueba controlada solicitada desde la alerta del chat para ${task}.`;
 if(action==='protect')return`Protección manual aplicada desde la alerta del chat para ${task}.`;
 return`Control automático restablecido desde la alerta del chat para ${task}.`;
}

export function governanceConfirmation(action:'probe'|'protect'|'auto',task:string,result?:GovernanceResult){
 const policyReason=result?.policy?.reason?.trim();
 if(action==='probe')return`Prueba controlada activa para ${task}. La siguiente respuesta elegible comprobará si el ahorro puede recuperarse.${policyReason?` ${policyReason}`:''}`;
 if(action==='protect')return`Inteligencia alta protegida para ${task}. No habrá degradaciones hasta restablecer el control automático.`;
 return`Control automático restablecido para ${task}. El circuit breaker volverá a decidir con la evidencia reciente.${policyReason?` ${policyReason}`:''}`;
}

const api=async<T>(path:string,init?:RequestInit):Promise<T>=>{const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};
function findComposer(){return document.querySelector<HTMLFormElement>('.cxComposer');}

export function installChatQualityAlertStrip(){
 let composer:HTMLFormElement|undefined,strip:HTMLElement|undefined,confirmation:HTMLElement|undefined,timer:number|undefined,confirmationTimer:number|undefined,loadVersion=0;
 const remove=()=>{strip?.remove();strip=undefined;};
 const disable=(buttons:HTMLButtonElement[],value:boolean)=>buttons.forEach(button=>button.disabled=value);
 const showConfirmation=(text:string,state:'good'|'bad'='good')=>{if(!composer)return;confirmation?.remove();confirmation=document.createElement('div');confirmation.className=`cxChatQualityConfirmation ${state}`;confirmation.setAttribute('role','status');confirmation.setAttribute('aria-live','polite');confirmation.textContent=text;composer.insertAdjacentElement('beforebegin',confirmation);if(confirmationTimer)window.clearTimeout(confirmationTimer);confirmationTimer=window.setTimeout(()=>{confirmation?.remove();confirmation=undefined;},8000);};
 const alertAction=async(alert:ChatQualityAlert,action:ChatQualityAction,buttons:HTMLButtonElement[])=>{
  disable(buttons,true);
  try{
   let result:GovernanceResult|undefined;
   if(action==='probe'||action==='protect'||action==='auto')result=await api<GovernanceResult>(`/api/intelligence/budget/quality-governance/${encodeURIComponent(alert.task)}`,{method:'PUT',body:JSON.stringify({mode:action,reason:governanceReason(action,alert.task)})});
   await api(`/api/intelligence/budget/quality-alerts/${alert.id}/action`,{method:'POST',body:JSON.stringify(action==='mute'?{action:'mute',muteHours:24}:{action:'acknowledge'})});
   if(action==='mute')showConfirmation(`Alerta de ${alert.task} silenciada durante 24 horas.`);
   else if(action==='probe'||action==='protect'||action==='auto'){
    showConfirmation(governanceConfirmation(action,alert.task,result));
    window.dispatchEvent(new CustomEvent('hector:budget-policy-changed',{detail:{task:alert.task,mode:action,policy:result?.policy}}));
   }
   await load();
  }catch(error){disable(buttons,false);showConfirmation(error instanceof Error?error.message:'No se pudo aplicar la decisión.','bad');}
 };
 const renderImpact=(parent:HTMLElement,impact?:QualityImpactSummary)=>{
  if(!impact)return;
  const box=document.createElement('div'),heading=document.createElement('b'),detail=document.createElement('small'),metrics=document.createElement('div');
  box.className=`cxChatQualityImpact ${impact.tone}`;heading.textContent=impact.title;detail.textContent=impact.detail;metrics.className='cxChatQualityImpactMetrics';
  impact.metrics.forEach(metric=>{const item=document.createElement('span');item.textContent=metric;metrics.append(item);});
  box.append(heading,detail,metrics);parent.append(box);
 };
 const render=(items:ChatQualityAlert[],impact?:QualityImpactSummary)=>{
  if(!composer)return;const actionable=actionableChatAlerts(items);if(!actionable.length){remove();return;}
  if(!strip){strip=document.createElement('aside');strip.className='cxChatQualityAlert';strip.setAttribute('role','alert');strip.setAttribute('aria-live','polite');composer.insertAdjacentElement('beforebegin',strip);}
  strip.replaceChildren();const first=actionable[0],copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),actions=document.createElement('div');actions.className='cxChatQualityAlertActions';title.textContent=`Ahorro suspendido: ${first.task}`;detail.textContent=`${first.reason} · ${first.sampleCount} muestras${actionable.length>1?` · ${actionable.length-1} alerta${actionable.length===2?'':'s'} adicional${actionable.length===2?'':'es'}`:''}`;
  const probe=document.createElement('button'),protect=document.createElement('button'),auto=document.createElement('button'),mute=document.createElement('button'),buttons=[probe,protect,auto,mute];
  probe.type=protect.type=auto.type=mute.type='button';probe.textContent='Probar ahora';protect.textContent='Mantener protegida';auto.textContent='Restablecer automático';mute.textContent='Silenciar 24 h';probe.onclick=()=>void alertAction(first,'probe',buttons);protect.onclick=()=>void alertAction(first,'protect',buttons);auto.onclick=()=>void alertAction(first,'auto',buttons);mute.onclick=()=>void alertAction(first,'mute',buttons);actions.append(probe,protect,auto,mute);copy.append(title,detail);renderImpact(copy,impact);strip.append(copy,actions);
 };
 const load=async()=>{const version=++loadVersion;try{const data=await api<{items:ChatQualityAlert[]}>('/api/intelligence/budget/quality-alerts'),actionable=actionableChatAlerts(data.items||[]),first=actionable[0];let impact:QualityImpactSummary|undefined;if(first){try{impact=summarizeQualityProtectionImpact(await api<QualityImpactResponse>(`/api/intelligence/budget/quality-alerts/${first.id}/impact`));}catch{impact=undefined;}}if(version===loadVersion)render(data.items||[],impact);}catch{if(version===loadVersion)remove();}};
 const mount=(form:HTMLFormElement)=>{composer=form;void load();if(timer)window.clearInterval(timer);timer=window.setInterval(()=>{if(composer&&document.body.contains(composer))void load();},30000);};
 const scan=()=>{const next=findComposer();if(next&&next!==composer)mount(next);if(composer&&!document.body.contains(composer)){composer=undefined;remove();confirmation?.remove();confirmation=undefined;if(timer)window.clearInterval(timer);timer=undefined;if(confirmationTimer)window.clearTimeout(confirmationTimer);confirmationTimer=undefined;}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();return()=>{observer.disconnect();remove();confirmation?.remove();if(timer)window.clearInterval(timer);if(confirmationTimer)window.clearTimeout(confirmationTimer);};
}
