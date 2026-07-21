type Capability={capability:string;components:readonly string[];evidence:string;limit:string};
type SelfModel={
 identity:{name:string;mission:string;knowledgeVersion:string;knowledgeVerifiedAt:string;contextualEngineVersion:string};
 owner:{name:string;technicalLevel:string;learningStyle:string;autonomyPreference:string;intelligencePreference:string};
 architecture:string[];
 models:{fast:string;balanced:string;reasoning:string;critic:string;policy:Record<string,string>};
 capabilities:Capability[];
 runtime:{memories:number;workJobs:{total:number;completed:number;blocked:number};scheduledTasks:{total:number;active:number};responseTraces:number;activeSystemContexts:number;latestEvaluation:any};
 limitations:string[];
};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const fetchModel=async()=>{const response=await fetch('/api/intelligence/self-model',{credentials:'include',headers:{Accept:'application/json'}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as SelfModel;};
function findSettingsPage(){return[...document.querySelectorAll<HTMLElement>('.cxPage')].find(page=>page.querySelector('h1')?.textContent?.trim()==='Ajustes');}
function card(label:string,value:string){const node=el('div','cxSelfMetric');node.append(el('span',undefined,label),el('strong',undefined,value));return node;}
function capabilityRow(item:Capability){const details=el('details','cxSelfCapability'),summary=el('summary');summary.append(el('strong',undefined,item.capability),el('span',undefined,item.components.join(' · ')));const body=el('div');body.append(el('p',undefined,`Evidencia: ${item.evidence}`),el('p',undefined,`Límite: ${item.limit}`));details.append(summary,body);return details;}
export function installSelfModelEnhancer(){
 let mounted:HTMLElement|undefined;
 const render=async(root:HTMLElement)=>{
  if(root.dataset.selfModelReady==='1')return;root.dataset.selfModelReady='1';mounted=root;
  const section=el('section','cxSelfModel'),head=el('div','cxSelfModelHead'),copy=el('div');copy.append(el('span',undefined,'Autoconocimiento verificable'),el('h2',undefined,'Modelo propio de Héctor OS'),el('p',undefined,'Identidad, arquitectura, modelos y capacidades declaradas con evidencia observable.'));
  const badge=el('span','cxSelfBadge','Cargando');head.append(copy,badge);
  const models=el('div','cxSelfModels'),runtime=el('div','cxSelfRuntime'),architecture=el('div','cxSelfArchitecture'),capabilities=el('div','cxSelfCapabilities'),limits=el('div','cxSelfLimits'),notice=el('p','cxSelfNotice','Consultando estado…');
  section.append(head,models,runtime,architecture,capabilities,limits,notice);
  const anchor=root.querySelector('.cxIntelligenceStatus')||root.querySelector('.cxMemoryControl')||root.querySelector('.cxStatus');anchor?.insertAdjacentElement('afterend',section);
  try{
   const data=await fetchModel();badge.textContent=`Conocimiento ${data.identity.knowledgeVersion}`;badge.className='cxSelfBadge ready';
   models.replaceChildren(card('Rápido',data.models.fast),card('Balanceado',data.models.balanced),card('Profundo',data.models.reasoning),card('Juez',data.models.critic));
   runtime.replaceChildren(card('Memorias',String(data.runtime.memories)),card('Trabajos',`${data.runtime.workJobs.completed}/${data.runtime.workJobs.total}`),card('Tareas activas',`${data.runtime.scheduledTasks.active}/${data.runtime.scheduledTasks.total}`),card('Trazas',String(data.runtime.responseTraces)));
   architecture.replaceChildren(el('h3',undefined,'Arquitectura'),...data.architecture.map(x=>el('span','cxSelfChip',x)));
   capabilities.replaceChildren(el('h3',undefined,'Capacidades y límites'),...data.capabilities.map(capabilityRow));
   limits.replaceChildren(el('h3',undefined,'Límites declarados'),...data.limitations.map(x=>el('p',undefined,x)));
   notice.textContent=`${data.identity.name} · ${data.identity.mission} Verificado: ${data.identity.knowledgeVerifiedAt}. Motor: ${data.identity.contextualEngineVersion}.`;
   notice.className='cxSelfNotice ready';
  }catch(error){badge.textContent='No disponible';badge.className='cxSelfBadge bad';notice.textContent=error instanceof Error?error.message:'No se pudo cargar el modelo propio';notice.className='cxSelfNotice bad';}
 };
 const scan=()=>{const page=findSettingsPage();if(page&&!page.dataset.selfModelReady)void render(page);if(mounted&&!document.body.contains(mounted))mounted=undefined;};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();return()=>observer.disconnect();
}
