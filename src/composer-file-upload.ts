import {api} from './api';

const normalize=(value:string)=>value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

export function uploadedFileMessage(name:string){return `Archivo subido: ${name}`;}

function toast(message:string,tone:'good'|'bad'='good'){
 document.querySelector('.hxComposerUploadToast')?.remove();
 const node=document.createElement('div');node.className=`hxComposerUploadToast ${tone}`;node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.textContent=message;document.body.append(node);
 window.setTimeout(()=>node.remove(),5200);
}

function openFiles(name:string){
 const button=[...document.querySelectorAll<HTMLButtonElement>('.cxSidebar nav button')].find(item=>normalize(item.textContent||'').startsWith('archivos'));
 if(!button){toast('El archivo se subió, pero no se pudo abrir Archivos automáticamente.','bad');return;}
 button.click();
 let attempts=0;const timer=window.setInterval(()=>{
  const rows=[...document.querySelectorAll<HTMLElement>('.cxFileList strong')],row=rows.find(item=>item.textContent?.trim()===name);
  if(row){window.clearInterval(timer);row.closest<HTMLElement>('a,article')?.scrollIntoView({behavior:'smooth',block:'center'});row.closest<HTMLElement>('a,button')?.focus({preventScroll:true});}
  else if(++attempts>=50)window.clearInterval(timer);
 },100);
}

export function installComposerFileUpload(){
 const input=document.createElement('input');input.type='file';input.hidden=true;input.setAttribute('aria-hidden','true');document.body.append(input);
 let busy=false,activeButton:HTMLButtonElement|null=null;
 const reset=()=>{busy=false;if(activeButton){activeButton.disabled=false;activeButton.removeAttribute('aria-busy');activeButton.classList.remove('uploading');}activeButton=null;input.value='';};
 const choose=(event:MouseEvent)=>{
  const button=(event.target as Element|null)?.closest<HTMLButtonElement>('.hxComposerPlus');if(!button||busy)return;
  event.preventDefault();event.stopImmediatePropagation();activeButton=button;button.setAttribute('aria-label','Subir archivo');input.click();
 };
 input.onchange=async()=>{
  const file=input.files?.[0];if(!file){reset();return;}busy=true;if(activeButton){activeButton.disabled=true;activeButton.setAttribute('aria-busy','true');activeButton.classList.add('uploading');}
  toast(`Subiendo ${file.name}…`);
  try{await api.upload(file);toast(uploadedFileMessage(file.name));openFiles(file.name);}
  catch(error){toast(error instanceof Error?error.message:'No se pudo subir el archivo','bad');}
  finally{reset();}
 };
 const observer=new MutationObserver(()=>{const button=document.querySelector<HTMLButtonElement>('.hxComposerPlus');if(button)button.setAttribute('aria-label','Subir archivo');});
 observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('click',choose,true);
 return()=>{observer.disconnect();document.removeEventListener('click',choose,true);input.remove();};
}
