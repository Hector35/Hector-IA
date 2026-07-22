export function isFailedAssistantMessage(value:string){return /^\s*(?:error|fall[oó]|no se pudo|respuesta detenida)\b/i.test(value.trim());}

export function previousUserMessage(messages:{role:string;content:string}[],index:number){
 for(let cursor=index-1;cursor>=0;cursor--){const message=messages[cursor];if(message.role==='user'&&message.content.trim())return message.content.trim();}
 return'';
}

function setComposerValue(textarea:HTMLTextAreaElement,value:string){
 const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
 if(setter)setter.call(textarea,value);else textarea.value=value;
 textarea.dispatchEvent(new Event('input',{bubbles:true}));
 textarea.focus({preventScroll:true});
 textarea.scrollIntoView({behavior:'smooth',block:'center'});
}

function messageText(message:HTMLElement){const clone=message.cloneNode(true) as HTMLElement;clone.querySelectorAll('.cxProvider,.cxMessageActions,.hxChatRetry').forEach(node=>node.remove());return(clone.innerText||clone.textContent||'').trim();}

export function installChatRetryEnhancer(){
 const decorate=()=>{
  const messages=[...document.querySelectorAll<HTMLElement>('.cxMessage')];
  messages.forEach((message,index)=>{
   if(message.dataset.retryReady==='1'||!message.classList.contains('assistant'))return;
   const content=message.querySelector<HTMLElement>(':scope > div');if(!content)return;
   const text=messageText(content);if(!isFailedAssistantMessage(text))return;
   const prior=previousUserMessage(messages.map(node=>({role:node.classList.contains('user')?'user':'assistant',content:messageText(node)})),index);if(!prior)return;
   message.dataset.retryReady='1';
   const button=document.createElement('button');button.type='button';button.className='hxChatRetry';button.textContent='Reintentar';button.setAttribute('aria-label','Recuperar la instrucción que falló');
   button.onclick=()=>{const textarea=document.querySelector<HTMLTextAreaElement>('.cxComposer textarea');if(!textarea)return;setComposerValue(textarea,prior);button.textContent='Recuperado';window.setTimeout(()=>{if(document.body.contains(button))button.textContent='Reintentar';},1800);};
   content.append(button);
  });
 };
 const observer=new MutationObserver(decorate);observer.observe(document.body,{childList:true,subtree:true,characterData:true});decorate();return()=>observer.disconnect();
}
