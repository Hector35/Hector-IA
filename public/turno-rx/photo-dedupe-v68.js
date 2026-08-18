const STORAGE_KEY='pendientes-table-v2';
const originalFetch=window.fetch.bind(window);
const notices=new Map();

const clean=value=>String(value??'').trim();

export function hasDuplicateFingerprint(rows,fingerprint){
  const fp=clean(fingerprint);
  if(!fp||!Array.isArray(rows))return false;
  return rows.some(row=>clean(row?.imageFingerprint)===fp);
}

export function duplicatePatientsForFingerprint(rows,fingerprint){
  const fp=clean(fingerprint);
  if(!fp||!Array.isArray(rows))return [];
  return rows
    .filter(row=>clean(row?.imageFingerprint)===fp)
    .map(row=>({
      handwrittenBed:clean(row?.bed),
      formBed:'',
      bed:clean(row?.bed),
      name:clean(row?.name),
      age:row?.age??null,
      sex:clean(row?.sex)||'No visible',
      category:clean(row?.category),
      modality:clean(row?.modality),
      target:clean(row?.target),
      study:clean(row?.target),
      destination:clean(row?.destination),
      destinationFloor:clean(row?.destinationFloor),
      destinationBlock:clean(row?.destinationBlock),
      requestingDoctor:clean(row?.requestingDoctor),
      service:clean(row?.service),
      originService:clean(row?.originService),
      requestDate:clean(row?.requestDate),
      requestTime:clean(row?.requestTime),
      transferNotes:clean(row?.transferNotes),
      recognizedText:clean(row?.recognizedText),
      confidence:row?.confidence&&typeof row.confidence==='object'?row.confidence:{},
      transport:clean(row?.transport),
      transportReason:clean(row?.transportReason),
      oxygenProbable:Boolean(row?.oxygenProbable),
      oxygenReason:clean(row?.oxygenReason)
    }));
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

window.fetch=async function pendientesPhotoDedupeV69(input,init){
  const url=typeof input==='string'?input:input?.url;
  const vision=typeof url==='string'&&url.includes('/api/turno-rx/vision');
  if(vision&&init?.body instanceof FormData){
    const file=init.body.get('image');
    if(file instanceof File){
      const fingerprint=await fileFingerprint(file);
      const rows=readRows();
      if(hasDuplicateFingerprint(rows,fingerprint)){
        const index=currentQueueIndex();
        if(index)notices.set(index,Date.now()+15000);
        queueMicrotask(applyDuplicateNotices);
        const patients=duplicatePatientsForFingerprint(rows,fingerprint);
        return new Response(JSON.stringify({patients,duplicatePhoto:true}),{
          status:200,
          headers:{'Content-Type':'application/json','X-Pendientes-Duplicate':'1'}
        });
      }
    }
  }
  return originalFetch(input,init);
};

window.__pendientesPhotoDedupeV69={hasDuplicateFingerprint,duplicatePatientsForFingerprint,fileFingerprint};
