const CHAT_PATH='/api/intelligence/chat';

export function isChatRequest(input:RequestInfo|URL){
 const value=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 try{return new URL(value,window.location.origin).pathname===CHAT_PATH;}catch{return false;}
}

function announce(message:string){
 let node=document.querySelector<HTMLElement>('.hxChatStopStatus');
 if(!node){node=document.createElement('p');node.className='hxChatStopStatus';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.append(node);}
 node.textContent=message;
 window.setTimeout(()=>{if(node?.textContent===message)node.remove();},3200);
}

export function installChatStopEnhancer(){
 const originalFetch=window.fetch.bind(window);
 let active:AbortController|null=null;
 const render=()=>{
  const composer=document.querySelector<HTMLFormElement>('.cxComposer');
  if(!composer)return;
  let button=composer.querySelector<HTMLButtonElement>('.hxChatStop');
  if(active&&!button){
   button=document.createElement('button');button.type='button';button.className='hxChatStop';button.setAttribute('aria-label','Detener respuesta');button.innerHTML='<span aria-hidden="true"></span><b>Detener</b>';
   button.onclick=()=>{if(!active)return;active.abort('Detenido por el usuario');active=null;button?.remove();announce('Respuesta detenida. Puedes escribir otra instrucción.');};
   composer.append(button);
  }else if(!active&&button)button.remove();
 };
 window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(!isChatRequest(input))return originalFetch(input,init);
  const controller=new AbortController();active=controller;render();
  const external=init?.signal;
  const abort=()=>controller.abort(external?.reason);
  if(external?.aborted)abort();else external?.addEventListener('abort',abort,{once:true});
  try{return await originalFetch(input,{...init,signal:controller.signal});}
  finally{external?.removeEventListener('abort',abort);if(active===controller)active=null;render();}
 }) as typeof window.fetch;
 const observer=new MutationObserver(render);observer.observe(document.body,{childList:true,subtree:true});render();
 return()=>{observer.disconnect();active?.abort();active=null;window.fetch=originalFetch;document.querySelector('.hxChatStop')?.remove();};
}
