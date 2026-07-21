type MemoryItem={id:string;kind:string;content:string;source:string;importance:number;updated_at:string;embeddingReady:boolean};
type MemoryCoverage={total:number;ready:number;needsRefresh:number;coveragePercent:number;complete:boolean;model:string;dimensions:number};
type PreviewItem=MemoryItem&{rank:number};

const kinds=[['fact','Dato'],['preference','Preferencia'],['goal','Objetivo'],['constraint','Restricción'],['person','Persona'],['project','Proyecto'],['health','Salud'],['finance','Finanzas']] as const;
const api=async<T>(path:string,init?:RequestInit):Promise<T>=>{const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function formatDate(value:string){const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`;const date=new Date(normalized);return Number.isNaN(date.getTime())?'Fecha no disponible':date.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});}
function kindLabel(value:string){return kinds.find(([id])=>id===value)?.[1]||value;}
function option(value:string,label:string,selected=false){const node=document.createElement('option');node.value=value;node.textContent=label;node.selected=selected;return node;}
function findSettingsPage(){return[...document.querySelectorAll<HTMLElement>('.cxPage')].find(page=>page.querySelector('h1')?.textContent?.trim()==='Ajustes');}

export function installMemoryControlEnhancer(){
 let mountedRoot:HTMLElement|undefined;
 const render=async(root:HTMLElement)=>{
  if(root.dataset.memoryControlReady==='1')return;
  root.dataset.memoryControlReady='1';mountedRoot=root;
  const section=el('section','cxMemoryControl'),head=el('div','cxMemoryControlHead');
  const copy=el('div');copy.append(el('span',undefined,'Memoria verificable'),el('h2',undefined,'Lo que Héctor sabe de ti'),el('p',undefined,'Revisa, corrige y prueba los recuerdos que entrarán al contexto antes de una respuesta. El contenido es privado por usuario.'));head.append(copy);section.append(head);
  const metrics=el('div','cxMemoryMetrics'),createForm=el('form','cxMemoryCreate'),previewForm=el('form','cxMemoryPreview'),previewResults=el('div','cxMemoryPreviewResults'),notice=el('p','cxMemoryNotice'),list=el('div','cxMemoryCards');
  const content=document.createElement('textarea');content.required=true;content.maxLength=2000;content.placeholder='Ejemplo: Prefiero explicaciones técnicas y directas.';content.setAttribute('aria-label','Nueva memoria');
  const kind=document.createElement('select');kinds.forEach(([id,label])=>kind.append(option(id,label,id==='fact')));
  const importance=document.createElement('select');for(let i=5;i>=1;i--)importance.append(option(String(i),`Importancia ${i}`,i===3));
  const save=el('button','primary','Guardar memoria');save.type='submit';const fields=el('div','cxMemoryCreateFields');fields.append(kind,importance,save);createForm.append(content,fields,notice);
  const query=document.createElement('input');query.required=true;query.minLength=2;query.maxLength=2000;query.placeholder='Pregunta para probar, por ejemplo: ¿cómo prefiero aprender?';query.setAttribute('aria-label','Consulta para probar la memoria');const test=el('button',undefined,'Probar recuerdos');test.type='submit';previewForm.append(el('label',undefined,'Previsualizar memoria usada'),query,test);
  section.append(metrics,createForm,previewForm,previewResults,list);
  root.querySelector('.cxStatus')?.insertAdjacentElement('afterend',section);

  const setNotice=(message:string,state:''|'good'|'bad'='')=>{notice.className=`cxMemoryNotice ${state}`;notice.textContent=message;};
  const renderMetrics=(coverage:MemoryCoverage)=>{metrics.replaceChildren();const entries=[['Memorias',coverage.total],['Con vector',coverage.ready],['Pendientes',coverage.needsRefresh],['Cobertura',`${coverage.coveragePercent}%`]];for(const [label,value] of entries){const card=el('div');card.append(el('span',undefined,String(label)),el('strong',undefined,String(value)));metrics.append(card);}const meta=el('p','cxMemoryModel',`${coverage.model} · ${coverage.dimensions} dimensiones · regeneración progresiva`);metrics.append(meta);};
  const load=async()=>{
   try{
    const [statusResponse,itemsResponse]=await Promise.all([api<{memory:MemoryCoverage}>('/api/memory/status'),api<{items:MemoryItem[]}>('/api/memory/items')]);
    renderMetrics(statusResponse.memory);list.replaceChildren();
    if(!itemsResponse.items.length){list.append(el('div','cxMemoryEmpty','Todavía no hay recuerdos guardados.'));return;}
    for(const item of itemsResponse.items){
     const card=el('article','cxMemoryCard'),top=el('header'),title=el('div');title.append(el('strong',undefined,kindLabel(item.kind)),el('span',undefined,`${item.source} · ${formatDate(item.updated_at)}`));top.append(title,el('span',`cxMemoryEmbedding ${item.embeddingReady?'ready':'pending'}`,item.embeddingReady?'Semántica lista':'Vector pendiente'));
     const editor=document.createElement('textarea');editor.value=item.content;editor.maxLength=2000;editor.setAttribute('aria-label',`Contenido de memoria ${item.id}`);
     const controls=el('div','cxMemoryCardControls'),kindSelect=document.createElement('select'),importanceSelect=document.createElement('select');
     if(!kinds.some(([id])=>id===item.kind))kindSelect.append(option(item.kind,item.kind,true));kinds.forEach(([id,label])=>kindSelect.append(option(id,label,id===item.kind)));for(let i=5;i>=1;i--)importanceSelect.append(option(String(i),`Importancia ${i}`,i===item.importance));
     const actions=el('div','cxMemoryActions'),update=el('button',undefined,'Guardar cambios'),remove=el('button','danger','Eliminar');update.type=remove.type='button';
     update.onclick=async()=>{update.disabled=true;try{await api(`/api/memory/items/${item.id}`,{method:'PATCH',body:JSON.stringify({content:editor.value,kind:kindSelect.value,importance:Number(importanceSelect.value)})});setNotice('Memoria actualizada. Si cambió el texto, su vector se regenerará al usarla.','good');await load();}catch(error){setNotice(error instanceof Error?error.message:'No se pudo actualizar','bad');}finally{update.disabled=false;}};
     remove.onclick=async()=>{if(!window.confirm('¿Eliminar esta memoria? Héctor dejará de usarla de inmediato.'))return;remove.disabled=true;try{await api(`/api/memory/items/${item.id}`,{method:'DELETE'});setNotice('Memoria eliminada.','good');await load();}catch(error){setNotice(error instanceof Error?error.message:'No se pudo eliminar','bad');}finally{remove.disabled=false;}};
     actions.append(update,remove);controls.append(kindSelect,importanceSelect);card.append(top,editor,controls,actions);list.append(card);
    }
   }catch(error){list.replaceChildren(el('div','cxMemoryError',error instanceof Error?error.message:'No se pudo cargar la memoria'));}
  };
  createForm.onsubmit=async event=>{event.preventDefault();save.disabled=true;setNotice('Guardando…');try{await api('/api/memory/items',{method:'POST',body:JSON.stringify({content:content.value,kind:kind.value,importance:Number(importance.value)})});content.value='';setNotice('Memoria guardada.','good');await load();}catch(error){setNotice(error instanceof Error?error.message:'No se pudo guardar','bad');}finally{save.disabled=false;}};
  previewForm.onsubmit=async event=>{event.preventDefault();test.disabled=true;previewResults.replaceChildren(el('div','cxMemoryLoading','Calculando memoria relevante…'));try{const result=await api<{items:PreviewItem[];selectedCount:number}>('/api/memory/preview',{method:'POST',body:JSON.stringify({query:query.value})});previewResults.replaceChildren();if(!result.items.length){previewResults.append(el('div','cxMemoryEmpty','Héctor no usaría ninguna memoria guardada para esta consulta.'));return;}const heading=el('div','cxMemoryPreviewHead');heading.append(el('strong',undefined,`${result.items.length} recuerdos entrarían al contexto`),el('span',undefined,'Orden de relevancia'));previewResults.append(heading);for(const item of result.items){const row=el('div','cxMemoryPreviewItem');row.append(el('span',undefined,String(item.rank)),el('p',undefined,item.content),el('small',undefined,`${kindLabel(item.kind)} · importancia ${item.importance}`));previewResults.append(row);}}catch(error){previewResults.replaceChildren(el('div','cxMemoryError',error instanceof Error?error.message:'No se pudo probar la memoria'));}finally{test.disabled=false;}};
  await load();
 };
 const scan=()=>{const page=findSettingsPage();if(page&&!page.dataset.memoryControlReady)void render(page);if(mountedRoot&&!document.body.contains(mountedRoot))mountedRoot=undefined;};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();return()=>observer.disconnect();
}
