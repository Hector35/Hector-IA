export function shouldShowJump(scrollTop:number,clientHeight:number,scrollHeight:number,threshold=120){return scrollHeight-scrollTop-clientHeight>threshold;}

function makeButton(){
 const button=document.createElement('button');button.type='button';button.className='hxJumpLatest';button.setAttribute('aria-label','Ir al mensaje más reciente');
 const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='↓';
 const label=document.createElement('span');label.textContent='Ir al final';
 const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');
 button.append(arrow,label,dot);return button;
}

export function installChatJumpLatestEnhancer(){
 let current:HTMLElement|undefined,button:HTMLButtonElement|undefined,messagesObserver:MutationObserver|undefined;
 const detach=()=>{messagesObserver?.disconnect();messagesObserver=undefined;button?.remove();button=undefined;current=undefined;};
 const mount=(messages:HTMLElement)=>{
  if(current===messages)return;detach();current=messages;const conversation=messages.closest<HTMLElement>('.cxConversation');if(!conversation)return;
  button=makeButton();conversation.append(button);
  const update=()=>{if(!button||!current)return;const visible=shouldShowJump(current.scrollTop,current.clientHeight,current.scrollHeight);button.classList.toggle('visible',visible);if(!visible)button.classList.remove('unread');};
  button.onclick=()=>{messages.scrollTo({top:messages.scrollHeight,behavior:'smooth'});button?.classList.remove('unread');};
  messages.addEventListener('scroll',update,{passive:true});
  messagesObserver=new MutationObserver(()=>{const away=shouldShowJump(messages.scrollTop,messages.clientHeight,messages.scrollHeight);if(away)button?.classList.add('unread');requestAnimationFrame(update);});
  messagesObserver.observe(messages,{childList:true,subtree:true,characterData:true});
  update();
 };
 const scan=()=>{const messages=document.querySelector<HTMLElement>('.cxMessages');if(messages)mount(messages);else if(current)detach();};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();
 return()=>{observer.disconnect();detach();};
}
