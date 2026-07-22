import {parseProgrammedText} from './scheduled-tasks-ui';

export type OneCommandIntent='chat'|'work'|'programmed';

const normalize=(value:string)=>value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^¿/,'');

export function classifyOneCommand(value:string):OneCommandIntent{
 const raw=value.trim();
 if(!raw)return'chat';
 const text=normalize(raw),question=raw.includes('?')||/^(?:que|como|por que|para que|cual|cuando|donde|cuanto|cada cuanto|explica|puedes explicar)\b/.test(text);
 const supportedSchedule=/\b(?:cada\s+(?:\d{1,5}\s*(?:minutos?|horas?)|(?:una\s+)?hora|media\s+hora|(?:un\s+)?cuarto\s+de\s+hora|dia|semana)|diari[oa]|semanal(?:mente)?|(?:en|dentro\s+de)\s+\d{1,5}\s+minutos?|a\s+las?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/.test(text);
 const scheduleCommand=/^(?:programa(?:me)?|agenda|recuerdame|crea\s+(?:una\s+)?(?:tarea\s+)?programada|cada\b|diariamente\b|semanalmente\b|todos\s+los\b|todas\s+las\b)/.test(text);
 if(!question&&scheduleCommand&&supportedSchedule)return'programmed';
 const persistent=/\b(?:no\s+te\s+detengas|sigue\s+intentando|reintenta\s+hasta|busca\s+otra\s+alternativa|hasta\s+(?:terminar|completar|resolver|dejar(?:lo|la)?\s+funcionando))\b/.test(text);
 const workCommand=/^(?:modo\s+trabajo\b|trabaja\s+(?:en|hasta)\b|encargate\s+de\b|continua\s+(?:con|hasta)\b|termina\s+(?:la|el|este|esta|mi)\s+(?:app|aplicacion|proyecto|sistema|trabajo|implementacion)\b)/.test(text);
 return!question&&(persistent||workCommand)?'work':'chat';
}

const request=async<T>(path:string,init?:RequestInit):Promise<T>=>{
 const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');
 const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'No disponible');return data as T;
};

function setTextareaValue(textarea:HTMLTextAreaElement,value:string){
 const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
 if(setter)setter.call(textarea,value);else textarea.value=value;
 textarea.dispatchEvent(new Event('input',{bubbles:true}));
}

function showToast(message:string,tone:'good'|'bad'='good'){
 document.querySelector('.hxOneCommandToast')?.remove();
 const toast=document.createElement('div');toast.className=`hxOneCommandToast ${tone}`;toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.textContent=message;document.body.append(toast);
 window.setTimeout(()=>toast.remove(),5200);
}

function openWorkSection(selector:string){
 const workButton=[...document.querySelectorAll<HTMLButtonElement>('.cxSidebar nav button')].find(button=>normalize(button.textContent||'').startsWith('trabajo'));
 if(!workButton){showToast('La acción se creó, pero no se pudo abrir Trabajo automáticamente.','bad');return;}
 workButton.click();
 let attempts=0;const timer=window.setInterval(()=>{const target=document.querySelector<HTMLElement>(selector);if(target){window.clearInterval(timer);target.scrollIntoView({behavior:'smooth',block:'start'});target.querySelector<HTMLElement>('textarea,button')?.focus({preventScroll:true});}else if(++attempts>=50){window.clearInterval(timer);showToast('La acción se creó, pero la sección tardó demasiado en abrir.','bad');}},100);
}

function decorateHome(){
 const welcome=document.querySelector<HTMLElement>('.cxWelcome');
 if(welcome&&!welcome.querySelector('.hxOneCommandHint')){
  const hint=document.createElement('p');hint.className='hxOneCommandHint';hint.textContent='Escribe una orden directa: “cada hora revisa…” o “termina el proyecto y no te detengas”.';welcome.append(hint);
 }
 const textarea=document.querySelector<HTMLTextAreaElement>('.cxComposer textarea');
 if(textarea)textarea.placeholder='Pregunta, inicia un trabajo o crea un programado';
}

export function installOneCommandEnhancer(){
 let processing=false;
 const execute=async(event:Event,form:HTMLFormElement,textarea:HTMLTextAreaElement)=>{
  const command=textarea.value.trim(),intent=classifyOneCommand(command);if(intent==='chat')return false;
  event.preventDefault();event.stopImmediatePropagation();if(processing)return true;processing=true;form.classList.add('hxRouting');
  const button=form.querySelector<HTMLButtonElement>('button[type="submit"],button');if(button)button.disabled=true;
  try{
   if(intent==='work'){
    await request<{item:{id:string;title:string}}>('/api/work-mode',{method:'POST',body:JSON.stringify({goal:command})});
    setTextareaValue(textarea,'');showToast('Modo Trabajo activado. Héctor OS seguirá hasta verificar el objetivo.');openWorkSection('.hxWorkMode');
   }else{
    const parsed=parseProgrammedText(command);
    await request<{item:{id:string}}>('/api/schedules',{method:'POST',body:JSON.stringify({title:parsed.title,prompt:parsed.prompt,kind:'agent',cadence:parsed.cadence,intervalMinutes:parsed.cadence==='custom_minutes'?parsed.intervalMinutes:undefined,firstRunAt:new Date(parsed.firstRunAt).toISOString(),reasoningLevel:'high',autonomyMode:'continuous',allowWeb:true})});
    setTextareaValue(textarea,'');showToast(`Programado creado: ${parsed.title}`);openWorkSection('.cxSchedules');
   }
  }catch(error){setTextareaValue(textarea,command);showToast(error instanceof Error?error.message:'No se pudo completar la orden','bad');}
  finally{processing=false;form.classList.remove('hxRouting');if(button)button.disabled=!textarea.value.trim();}
  return true;
 };
 const submit=(event:Event)=>{
  const form=event.target instanceof HTMLFormElement?event.target:null;if(!form?.matches('.cxComposer'))return;
  const textarea=form.querySelector<HTMLTextAreaElement>('textarea');if(textarea)void execute(event,form,textarea);
 };
 const keydown=(event:KeyboardEvent)=>{
  if(event.key!=='Enter'||event.shiftKey||event.isComposing)return;
  const textarea=event.target instanceof HTMLTextAreaElement?event.target:null,form=textarea?.closest<HTMLFormElement>('.cxComposer');
  if(form&&textarea)void execute(event,form,textarea);
 };
 document.addEventListener('submit',submit,true);document.addEventListener('keydown',keydown,true);
 const observer=new MutationObserver(decorateHome);observer.observe(document.body,{childList:true,subtree:true});decorateHome();
 return()=>{document.removeEventListener('submit',submit,true);document.removeEventListener('keydown',keydown,true);observer.disconnect();};
}
