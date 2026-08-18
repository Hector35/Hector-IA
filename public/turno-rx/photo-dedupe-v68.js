const STORAGE_KEY='pendientes-table-v2';
const originalFetch=window.fetch.bind(window);
const notices=new Map();

const clean=value=>String(value??'').trim();

export function hasDuplicateFingerprint(rows,fingerprint){
  const fp=clean(fingerprint);
  if(!fp||!Array.isArray(rows))return false;
  return rows.some(row=>clean(row?.imageFingerprint)===fp);
}

function readRows(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    return Array.isArray(parsed)?parsed:[];
  }catch{return[];}
}

async function fileFingerprint(file){
  if(!(file instanceof File)||!globalThis.crypto?.subtle)return'';
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function currentQueueIndex(){
  const text=document.querySelector('#stabilityQueue .stability-queue-head strong')?.textContent||'';
  const match=text.match(/Analizando foto\s+(\d+)\s+de/i);
  return match?Number(match[1]):null;
}

function applyDuplicateNotices(){
  const jobs=[...document.querySelectorAll('#stabilityQueue .stability-jobs > div')];
  for(const [index,expiresAt] of notices){
    if(expiresAt<=Date.now()){notices.delete(index);continue;}
    const job=jobs[index-1];if(!job)continue;
    const message=job.querySelector('span:first-child small');
    const state=job.querySelector('span:last-child');
    if(!message||!state)continue;
    if(/lista/i.test(state.textContent||'')&&!clean(message.textContent))message.textContent='Foto duplicada · sin cambios';
  }
}

const observer=new MutationObserver(()=>queueMicrotask(applyDuplicateNotices));
const observeTarget=document.getElementById('app')||document.body;
if(observeTarget)observer.observe(observeTarget,{childList:true,subtree:true});

window.fetch=async function pendientesPhotoDedupeV68(input,init){
  const url=typeof input==='string'?input:input?.url;
  const vision=typeof url==='string'&&url.includes('/api/turno-rx/vision');
  if(vision&&init?.body instanceof FormData){
    const file=init.body.get('image');
    if(file instanceof File){
      const fingerprint=await fileFingerprint(file);
      if(hasDuplicateFingerprint(readRows(),fingerprint)){
        const index=currentQueueIndex();
        if(index)notices.set(index,Date.now()+15000);
        queueMicrotask(applyDuplicateNotices);
        return new Response(JSON.stringify({patients:[]}),{
          status:200,
          headers:{'Content-Type':'application/json','X-Pendientes-Duplicate':'1'}
        });
      }
    }
  }
  return originalFetch(input,init);
};

window.__pendientesPhotoDedupeV68={hasDuplicateFingerprint,fileFingerprint};
