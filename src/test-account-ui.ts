type AccountRole='owner'|'test'|'other';
type TestAccountStatus={
 currentRole:AccountRole;
 account:{id:string;name:string;exists:boolean;persistent:boolean;dataIsolation:string;passwordLogin:boolean;deletionAvailable:boolean}|null;
 canEnter:boolean;
 returnRequiresOwnerLogin:boolean;
};

const api=async<T>(path:string,init?:RequestInit):Promise<T>=>{const headers=new Headers(init?.headers);headers.set('Accept','application/json');if(init?.body)headers.set('Content-Type','application/json');const response=await fetch(path,{credentials:'include',...init,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No disponible');return data as T;};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function findSettingsPage(){return[...document.querySelectorAll<HTMLElement>('.cxPage')].find(page=>page.querySelector('h1')?.textContent?.trim()==='Ajustes');}

function renderOwnerCard(page:HTMLElement,status:TestAccountStatus){
 if(page.querySelector('.cxTestAccountCard'))return;
 const section=el('section','cxTestAccountCard'),head=el('div','cxTestAccountHead'),copy=el('div');
 copy.append(el('span',undefined,'Entorno aislado'),el('h2',undefined,'Cuenta ChatGPT de pruebas'),el('p',undefined,'Identidad técnica permanente para probar Héctor OS sin mezclar conversaciones, memoria, archivos, trabajos ni métricas con tu cuenta propietaria.'));
 const badge=el('span','cxTestAccountBadge',status.account?.exists?'Lista':'Preparando');head.append(copy,badge);
 const facts=el('div','cxTestAccountFacts');[['Persistencia','No se elimina'],['Aislamiento','Por usuario'],['Contraseña','No disponible'],['Datos','Se conservan']].forEach(([label,value])=>{const item=el('div');item.append(el('span',undefined,label),el('strong',undefined,value));facts.append(item);});
 const warning=el('p','cxTestAccountWarning','Al entrar, este navegador cambiará a la cuenta de pruebas. Para volver a tu cuenta propietaria deberás iniciar sesión nuevamente; ninguna sesión ni dato se elimina.');
 const action=el('button','cxTestAccountEnter','Entrar como ChatGPT · Pruebas');action.type='button';
 const notice=el('p','cxTestAccountNotice');
 action.onclick=async()=>{if(!window.confirm('¿Cambiar este navegador a la cuenta permanente de pruebas? Tus datos personales permanecerán intactos.'))return;action.disabled=true;notice.textContent='Abriendo cuenta de pruebas…';try{await api('/api/auth/test-account/enter',{method:'POST'});window.location.reload();}catch(error){notice.textContent=error instanceof Error?error.message:'No se pudo abrir la cuenta';notice.className='cxTestAccountNotice bad';action.disabled=false;}};
 section.append(head,facts,warning,action,notice);page.querySelector('.cxPageHead')?.insertAdjacentElement('afterend',section);
}

function renderTestBadge(){
 if(document.querySelector('.cxTestAccountMode'))return;
 document.body.classList.add('cxTestAccountActive');document.title='ChatGPT · Pruebas — Héctor OS';
 const banner=el('aside','cxTestAccountMode'),mark=el('span','cxTestAccountModeMark','T'),copy=el('span','cxTestAccountModeCopy');copy.append(el('strong',undefined,'ChatGPT · Pruebas'),el('small',undefined,'Datos aislados y persistentes'));
 const exit=el('button',undefined,'Salir');exit.type='button';exit.onclick=async()=>{exit.disabled=true;try{await api('/api/auth/logout',{method:'POST'});}finally{window.location.reload();}};
 banner.append(mark,copy,exit);document.body.append(banner);
}

export function installTestAccountEnhancer(){
 let status:TestAccountStatus|undefined,loading=false;
 const load=async()=>{if(loading||status)return;loading=true;try{status=await api<TestAccountStatus>('/api/auth/test-account/status');scan();}catch{}finally{loading=false;}};
 const scan=()=>{if(!document.querySelector('.cxApp'))return;if(!status){void load();return;}if(status.currentRole==='test')renderTestBadge();if(status.currentRole==='owner'){const page=findSettingsPage();if(page)renderOwnerCard(page,status);}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();return()=>observer.disconnect();
}
