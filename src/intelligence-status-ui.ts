type DeliberationStatus={
 calls30d:number;
 calls24h:number;
 ensemble30d:number;
 ensemble24h:number;
 single30d:number;
 degraded30d:number;
 degradationRatePercent:number;
 averagePasses:number;
 estimatedCostUsd30d:number;
 estimatedCostUsd24h:number;
 health:'idle'|'healthy'|'watch'|'degraded';
 last:null|{mode:string;passes:number;reason:string;createdAt:string|null;service:string|null;model:string|null};
 contentStored:boolean;
 truncated:boolean;
};

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const api=async<T>(path:string):Promise<T>=>{const response=await fetch(path,{credentials:'include',headers:{Accept:'application/json'}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};
function findSettingsPage(){return[...document.querySelectorAll<HTMLElement>('.cxPage')].find(page=>page.querySelector('h1')?.textContent?.trim()==='Ajustes');}
function formatMoney(value:number){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:3}).format(value);}
function formatDate(value:string|null){if(!value)return'Sin ejecuciones';const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`;const date=new Date(normalized);return Number.isNaN(date.getTime())?'Fecha no disponible':date.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});}
function healthCopy(value:DeliberationStatus['health']){return value==='healthy'?['Estable','good']:value==='watch'?['En observación','watch']:value==='degraded'?['Degradada','bad']:['Sin muestras','idle'];}

export function installIntelligenceStatusEnhancer(){
 let mountedRoot:HTMLElement|undefined,timer:number|undefined;
 const render=async(root:HTMLElement)=>{
  if(root.dataset.intelligenceStatusReady==='1')return;
  root.dataset.intelligenceStatusReady='1';mountedRoot=root;
  const section=el('section','cxIntelligenceStatus'),head=el('div','cxIntelligenceStatusHead'),copy=el('div');
  copy.append(el('span',undefined,'Inteligencia verificable'),el('h2',undefined,'Deliberación y costo cognitivo'),el('p',undefined,'Mide cuándo Héctor usa una pasada simple o un conjunto arquitecto–adversario–juez. Solo se guardan métricas operativas, nunca razonamiento privado.'));
  const badge=el('span','cxIntelligenceBadge idle','Cargando');head.append(copy,badge);
  const metrics=el('div','cxIntelligenceMetrics'),detail=el('div','cxIntelligenceDetail'),notice=el('p','cxIntelligenceNotice','Actualizando métricas…');
  section.append(head,metrics,detail,notice);
  const anchor=root.querySelector('.cxMemoryControl')||root.querySelector('.cxStatus');
  anchor?.insertAdjacentElement('afterend',section);

  const load=async()=>{
   try{
    const response=await api<{deliberation:DeliberationStatus}>('/api/intelligence/deliberation-status'),status=response.deliberation,[label,state]=healthCopy(status.health);
    badge.className=`cxIntelligenceBadge ${state}`;badge.textContent=label;metrics.replaceChildren();
    const entries=[['Ensamble 24 h',status.ensemble24h],['Total 30 días',status.calls30d],['Pasadas promedio',status.averagePasses],['Costo 30 días',formatMoney(status.estimatedCostUsd30d)]];
    for(const [name,value] of entries){const card=el('div');card.append(el('span',undefined,String(name)),el('strong',undefined,String(value)));metrics.append(card);}
    detail.replaceChildren();
    const degradation=el('div','cxIntelligenceRow');degradation.append(el('span',undefined,'Ejecuciones degradadas'),el('strong',undefined,`${status.degraded30d} · ${status.degradationRatePercent}%`));detail.append(degradation);
    const dailyCost=el('div','cxIntelligenceRow');dailyCost.append(el('span',undefined,'Costo estimado últimas 24 h'),el('strong',undefined,formatMoney(status.estimatedCostUsd24h)));detail.append(dailyCost);
    const last=el('div','cxIntelligenceLast');
    if(status.last){last.append(el('span',undefined,`Última ejecución · ${formatDate(status.last.createdAt)}`),el('strong',undefined,`${status.last.mode} · ${status.last.passes} pasada${status.last.passes===1?'':'s'}`),el('p',undefined,status.last.reason||'Sin motivo registrado'));}
    else last.append(el('p',undefined,'Todavía no hay respuestas con telemetría cognitiva.'));
    detail.append(last);
    notice.textContent=status.truncated?'Vista limitada a las 500 ejecuciones más recientes.':'La telemetría no almacena prompts, respuestas ni cadenas de pensamiento.';
    notice.className='cxIntelligenceNotice good';
   }catch(error){notice.textContent=error instanceof Error?error.message:'No se pudo cargar el estado';notice.className='cxIntelligenceNotice bad';}
  };
  await load();timer=window.setInterval(load,30000);
 };
 const scan=()=>{const page=findSettingsPage();if(page&&!page.dataset.intelligenceStatusReady)void render(page);if(mountedRoot&&!document.body.contains(mountedRoot)){mountedRoot=undefined;if(timer)window.clearInterval(timer);timer=undefined;}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();
 return()=>{observer.disconnect();if(timer)window.clearInterval(timer);};
}
