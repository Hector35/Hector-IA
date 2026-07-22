export function normalizeConversationText(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}

export function conversationMatches(title:string,query:string){const needle=normalizeConversationText(query);return !needle||normalizeConversationText(title).includes(needle);}

export function installChatHistorySearchEnhancer(){
 let mounted:HTMLElement|undefined;
 const mount=(history:HTMLElement)=>{
  if(history.dataset.searchReady==='1')return;history.dataset.searchReady='1';mounted=history;
  const list=history.querySelector<HTMLElement>('.cxHistoryList');if(!list)return;
  const shell=document.createElement('div');shell.className='hxHistorySearch';
  const input=document.createElement('input');input.type='search';input.placeholder='Buscar conversación';input.autocomplete='off';input.setAttribute('aria-label','Buscar conversaciones');
  const count=document.createElement('span');count.setAttribute('aria-live','polite');
  const empty=document.createElement('div');empty.className='hxHistorySearchEmpty';empty.textContent='No hay conversaciones con ese nombre.';empty.hidden=true;
  const apply=()=>{const buttons=[...list.querySelectorAll<HTMLButtonElement>(':scope > button')],query=input.value;let visible=0;for(const button of buttons){const title=button.querySelector('strong')?.textContent||button.querySelector('span')?.textContent||button.textContent||'';const show=conversationMatches(title,query);button.hidden=!show;if(show)visible++;}count.textContent=query.trim()?`${visible} resultado${visible===1?'':'s'}`:`${buttons.length} guardada${buttons.length===1?'':'s'}`;empty.hidden=visible>0||!query.trim();};
  input.addEventListener('input',apply);shell.append(input,count);list.insertAdjacentElement('beforebegin',shell);list.insertAdjacentElement('afterend',empty);
  const observer=new MutationObserver(apply);observer.observe(list,{childList:true,subtree:true});apply();
 };
 const scan=()=>{const history=document.querySelector<HTMLElement>('.cxHistory');if(history&&!history.dataset.searchReady)mount(history);if(mounted&&!document.body.contains(mounted))mounted=undefined;};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();return()=>observer.disconnect();
}
