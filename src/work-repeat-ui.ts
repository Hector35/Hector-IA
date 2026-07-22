type WorkCreationResponse={item:{id:string;title:string}};

const request=async<T>(path:string,init?:RequestInit):Promise<T>=>{
 const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');
 const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'No disponible');return data as T;
};

export function repeatWorkPayload(goal:string){
 const normalized=goal.trim();
 if(normalized.length<10)throw new Error('La meta no tiene suficiente información para repetirse.');
 return{goal:normalized};
}

function repeatable(detail:HTMLElement){
 const label=detail.querySelector<HTMLElement>('.hxWorkDetailHead span')?.textContent?.trim().toLowerCase()||'';
 return['completado','pausado','necesita reanudarse'].includes(label);
}

function notice(message:string,tone:'good'|'bad'='good'){
 const target=document.querySelector<HTMLElement>('.hxWorkNotice');
 if(target){target.className=`hxWorkNotice ${tone}`;target.textContent=message;target.scrollIntoView({behavior:'smooth',block:'nearest'});return;}
 let toast=document.querySelector<HTMLElement>('.hxWorkRepeatToast');
 if(!toast){toast=document.createElement('p');toast.className='hxWorkRepeatToast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);}
 toast.className=`hxWorkRepeatToast ${tone}`;toast.textContent=message;window.setTimeout(()=>toast?.remove(),5000);
}

function decorate(detail:HTMLElement){
 if(detail.dataset.repeatReady==='1'||!repeatable(detail))return;
 const goal=detail.querySelector<HTMLElement>('.hxWorkGoal')?.textContent?.trim();if(!goal)return;
 let controls=detail.querySelector<HTMLElement>('.hxWorkControls');
 if(!controls){controls=document.createElement('div');controls.className='hxWorkControls';detail.append(controls);}
 const button=document.createElement('button');button.type='button';button.className='hxWorkRepeat';button.textContent='Repetir trabajo';button.setAttribute('aria-label','Crear un nuevo trabajo con la misma meta');
 button.onclick=async()=>{
  button.disabled=true;button.textContent='Creando…';
  try{
   const response=await request<WorkCreationResponse>('/api/work-mode',{method:'POST',body:JSON.stringify(repeatWorkPayload(goal))});
   notice(`Nuevo trabajo creado: ${response.item.title}`);
   window.setTimeout(()=>{
    const card=[...document.querySelectorAll<HTMLElement>('.hxWorkCard')].find(item=>item.querySelector('strong')?.textContent?.trim()===response.item.title);
    card?.scrollIntoView({behavior:'smooth',block:'center'});card?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});
   },5200);
  }catch(error){notice(error instanceof Error?error.message:'No se pudo repetir el trabajo','bad');}
  finally{button.disabled=false;button.textContent='Repetir trabajo';}
 };
 controls.prepend(button);detail.dataset.repeatReady='1';
}

export function installWorkRepeatEnhancer(){
 const scan=()=>document.querySelectorAll<HTMLElement>('.hxWorkDetail').forEach(decorate);
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true,characterData:true});scan();
 return()=>observer.disconnect();
}
