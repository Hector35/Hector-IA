const normalize=(value:string)=>value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

export function matchesFileName(name:string,query:string){
 const needle=normalize(query);
 return !needle||normalize(name).includes(needle);
}

export function installFileSearchEnhancer(){
 let mounted:HTMLElement|undefined;
 const enhance=()=>{
  const page=[...document.querySelectorAll<HTMLElement>('.cxPage')].find(node=>node.querySelector('h1')?.textContent?.trim()==='Archivos');
  if(!page||page.dataset.fileSearchReady==='1')return;
  const list=page.querySelector<HTMLElement>('.cxFileList');if(!list)return;
  page.dataset.fileSearchReady='1';mounted=page;
  const search=document.createElement('label');search.className='hxFileSearch';
  search.innerHTML='<span>Buscar archivos</span>';
  const input=document.createElement('input');input.type='search';input.placeholder='Escribe parte del nombre';input.autocomplete='off';input.setAttribute('aria-label','Buscar archivos por nombre');
  const count=document.createElement('small');count.setAttribute('aria-live','polite');
  search.append(input,count);list.insertAdjacentElement('beforebegin',search);
  const empty=document.createElement('div');empty.className='hxFileSearchEmpty';empty.textContent='No hay archivos con ese nombre.';empty.hidden=true;list.insertAdjacentElement('afterend',empty);
  const apply=()=>{
   const links=[...list.querySelectorAll<HTMLAnchorElement>(':scope > a')],query=input.value;
   let visible=0;
   for(const link of links){const name=link.querySelector('strong')?.textContent||link.textContent||'';const show=matchesFileName(name,query);link.hidden=!show;if(show)visible++;}
   count.textContent=query.trim()?`${visible} resultado${visible===1?'':'s'}`:`${links.length} archivo${links.length===1?'':'s'}`;
   empty.hidden=!query.trim()||visible>0;
  };
  input.addEventListener('input',apply);
  const observer=new MutationObserver(apply);observer.observe(list,{childList:true,subtree:true});apply();
 };
 const observer=new MutationObserver(()=>{if(mounted&&!document.body.contains(mounted))mounted=undefined;enhance();});observer.observe(document.body,{childList:true,subtree:true});enhance();return()=>observer.disconnect();
}
