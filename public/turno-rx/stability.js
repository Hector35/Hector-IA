import {
  syncRowsFromStorageAndRender,
  normalizeAge,
  normalizeStudyDisplay,
  normalizeCategory,
  canonicalOrigin,
  displayOrigin
} from './app-v16.js?v=65';

const BUILD='2026.08.18.1';
const STORAGE_KEY='pendientes-table-v2';
const SHIFT_KEY='pendientes-shift-v1';
const HISTORY_KEY='pendientes-shift-history-v1';
const ACTIVE_TAB_KEY='pendientes-active-category-v49';
const TABS=['Piso','RX','TAC','USG'];
const VISION_PROMPT=`Analiza esta foto de una solicitud, boleta o pizarrón hospitalario. Devuelve SOLO JSON válido:
{"patients":[{"category":"Rayos X|TAC|USG|Piso","handwrittenBed":"","formBed":"","bed":"","name":"","birthDate":null,"age":null,"sex":"Mujer|Hombre|No visible","target":"","destination":"","destinationFloor":"","destinationBlock":"","modality":"Rayos X|TAC|Ultrasonido|Otro","diagnosis":"","diagnosisMeaning":"","service":"","originService":"","recognizedText":"","confidence":{"bed":"high|medium|low","name":"high|medium|low","age":"high|medium|low","sex":"high|medium|low","target":"high|medium|low"},"transport":"Silla|Camilla|No trasladar|Por definir","transportReason":"","oxygenProbable":false,"oxygenReason":""}]}.
Reglas: usa solo datos visibles y nunca inventes. CE1, UP1 y UI1 son áreas especiales y nunca se convierten en cama 1. "C/ CE4" significa CE4. "PISO = 11" es solo un total y nunca crea 11 pacientes: para Piso crea un paciente solo si hay cama/área real del renglón; si hay información parcial sin cama, devuélvela como lectura parcial. H y M en columnas de Piso significan Hombre y Mujer. TAC/TC/tomografía/AngioTAC -> TAC; USG/ultrasonido/ecografía -> USG; RX/radiografía/placa/tele de tórax -> Rayos X. target es el estudio o, para Piso, el destino visible. Si hay tórax junto con otro estudio conserva ambos. PORTÁTIL -> No trasladar. Si no hay base para traslado usa Por definir. Oxígeno solo con evidencia visible. Confidence low si un campo es dudoso.`;

let editingId=null;
let queue=[];
let processing=false;
let stopQueue=false;
let gesture=null;
let suppressClickUntil=0;
let observerScheduled=false;
let undo=null;
let undoTimer=null;

const clean=v=>String(v??'').trim();
const plain=v=>clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now=()=>new Date().toISOString();
const study=v=>clean(v)?normalizeStudyDisplay(v):'';
function read(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}}
function write(key,val){localStorage.setItem(key,JSON.stringify(val))}
function rows(){const r=read(STORAGE_KEY,[]);return Array.isArray(r)?r:[]}
function activeTab(){return document.querySelector('[data-category-tab].is-active')?.dataset.categoryTab||read(ACTIVE_TAB_KEY,'RX')||'RX'}
function isPending(r){return plain(r?.status)!=='realizado'}
function normalizeBed(v){
  const raw=clean(v);if(!raw||/sala\s+de\s+espera/i.test(raw))return '';
  let s=raw.replace(/^C\/\s*(?=CE\s*\d+)/i,'').trim().toUpperCase().replace(/\s+/g,'');
  let m=s.match(/^CE0*(\d+)$/);if(m)return `CE${Number(m[1])}`;
  m=s.match(/^UP0*(\d+)$/);if(m)return `UP${Number(m[1])}`;
  m=s.match(/^UI0*(\d+)$/);if(m)return `UI${Number(m[1])}`;
  m=s.match(/^UA0*(\d+)$/);if(m)return String(Number(m[1]));
  m=s.match(/^C(?:AMA)?#?0*(\d+)$/);if(m)return String(Number(m[1]));
  if(/^0*\d+$/.test(s))return String(Number(s));
  return raw;
}
function normSex(v){const t=plain(v);if(['mujer','femenino','femenina','f'].includes(t))return'Mujer';if(['hombre','masculino','masculina','m','h'].includes(t))return'Hombre';return'No visible'}
function normTransport(v){const t=plain(v);if(t.includes('no traslad')||t.includes('portatil'))return'No trasladar';if(t.includes('camilla'))return'Camilla';if(t.includes('silla'))return'Silla';return'Por definir'}
function categoryFrom(category,modality,target){
  const c=plain(category),m=plain(modality),t=plain(target);
  if(c==='piso')return'Piso';
  if(c==='tac'||m==='tac'||/\b(tac|tc|tomografia|angiotac)\b/.test(t))return'TAC';
  if(c==='usg'||c==='ultrasonido'||m==='ultrasonido'||/\b(usg|ultrasonido|ecografia)\b/.test(t))return'USG';
  return'RX';
}
function ageFromBirth(v){const s=clean(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(`${s}T12:00:00`);if(Number.isNaN(d.getTime()))return null;const td=new Date();let a=td.getFullYear()-d.getFullYear();const md=td.getMonth()-d.getMonth();if(md<0||(md===0&&td.getDate()<d.getDate()))a--;return a>=0&&a<=130?a:null}
function showToast(msg,tone='info',actionText='',action=null,ms=2600){
  document.getElementById('stabilityToast')?.remove();
  const el=document.createElement('div');el.id='stabilityToast';el.className=`stability-toast ${tone}`;
  el.innerHTML=`<span>${esc(msg)}</span>${actionText?`<button type="button">${esc(actionText)}</button>`:''}`;
  document.body.appendChild(el);
  if(actionText)el.querySelector('button').onclick=()=>{el.remove();action?.()};
  if(ms>0)setTimeout(()=>el.remove(),ms);
}
function sync(){syncRowsFromStorageAndRender();queueMicrotask(enhance)}
function transportCycle(id){
  const list=rows(),i=list.findIndex(r=>String(r.id)===String(id));if(i<0)return;
  const current=normTransport(list[i].transport);if(current==='No trasladar')return;
  const seq=['Silla','Camilla','Por definir'],next=seq[(seq.indexOf(current)+1)%seq.length]||'Silla';
  list[i]={...list[i],transport:next,updatedAt:now(),manualOverrides:{...(list[i].manualOverrides||{}),transport:true}};
  write(STORAGE_KEY,list);sync();showToast(`Traslado: ${next}`,'success','',null,1300);
}
function setStatus(id,status){
  const list=rows(),i=list.findIndex(r=>String(r.id)===String(id));if(i<0)return;
  const prev=clean(list[i].status)||'Pendiente';if(plain(prev)===plain(status))return;
  list[i]={...list[i],status,statusUpdatedAt:now(),completedAt:status==='Realizado'?now():list[i].completedAt,reopenedAt:status==='Pendiente'?now():list[i].reopenedAt};
  write(STORAGE_KEY,list);sync();refreshRealized();
  showToast(status==='Realizado'?'Marcado como realizado':'Regresó a pendiente','success','Deshacer',()=>setStatus(id,prev),5000);
}
function safeDelete(id){
  const list=rows(),i=list.findIndex(r=>String(r.id)===String(id));if(i<0)return;
  const [removed]=list.splice(i,1);write(STORAGE_KEY,list);editingId=null;sync();
  undo={row:removed,index:i};clearTimeout(undoTimer);undoTimer=setTimeout(()=>undo=null,7100);
  showToast('Paciente eliminado','warning','Deshacer',()=>{if(!undo)return;const next=rows();next.splice(Math.min(undo.index,next.length),0,undo.row);undo=null;write(STORAGE_KEY,next);sync()},7000);
}

function enhance(){
  const app=document.getElementById('app');if(!app)return;
  app.dataset.stabilityBuild=BUILD;
  const actions=app.querySelector('.capture-actions');
  if(actions&&!document.getElementById('cameraCapture')){
    const camera=document.createElement('button');camera.id='cameraCapture';camera.type='button';camera.className='capture-icon-btn stability-camera';camera.setAttribute('aria-label','Tomar foto');camera.innerHTML='⌾';
    actions.insertBefore(camera,actions.querySelector('#galleryCapture'));
    const input=document.createElement('input');input.id='cameraInput';input.type='file';input.accept='image/*';input.setAttribute('capture','environment');input.hidden=true;actions.appendChild(input);
  }
  if(actions&&!document.getElementById('historyCapture')){
    const h=document.createElement('button');h.id='historyCapture';h.type='button';h.className='capture-icon-btn';h.setAttribute('aria-label','Historial');h.innerHTML='◷';actions.insertBefore(h,actions.firstChild);
  }
  app.querySelectorAll('.remove-btn').forEach(b=>b.tabIndex=-1);
  app.querySelectorAll('.imaging-row[data-id] .transport-cell').forEach(cell=>{cell.dataset.stabilityTransport=cell.closest('[data-id]')?.dataset.id||'';cell.setAttribute('role','button');cell.setAttribute('aria-label','Cambiar traslado')});
  const form=app.querySelector('#patientForm');
  if(form&&editingId&&!form.querySelector('#stabilityDelete')){
    const save=form.querySelector('.save-btn');if(save){const del=document.createElement('button');del.type='button';del.id='stabilityDelete';del.className='stability-delete';del.textContent='Eliminar';save.parentElement?.insertBefore(del,save)}
  }
  renderQueue();
  refreshRealized();
}
const observer=new MutationObserver(()=>{if(observerScheduled)return;observerScheduled=true;queueMicrotask(()=>{observerScheduled=false;enhance()})});
observer.observe(document.getElementById('app'),{childList:true,subtree:true});

function refreshRealized(){
  const tab=activeTab(),list=rows().filter(r=>!isPending(r)&&categoryFrom(r.category,r.modality,r.target)===tab);
  let pill=document.getElementById('stabilityRealizedPill');
  if(!list.length){pill?.remove();if(document.getElementById('stabilityRealizedSheet'))renderRealizedSheet(false);return}
  if(!pill){pill=document.createElement('button');pill.id='stabilityRealizedPill';pill.className='stability-realized-pill';pill.type='button';document.body.appendChild(pill)}
  pill.textContent=`✓ Realizados ${list.length}`;pill.onclick=()=>renderRealizedSheet(true);
  if(document.getElementById('stabilityRealizedSheet'))renderRealizedSheet(true);
}
function renderRealizedSheet(open=true){
  document.getElementById('stabilityRealizedSheet')?.remove();if(!open)return;
  const tab=activeTab(),list=rows().filter(r=>!isPending(r)&&categoryFrom(r.category,r.modality,r.target)===tab);
  const back=document.createElement('div');back.id='stabilityRealizedSheet';back.className='stability-backdrop';
  back.innerHTML=`<section class="stability-sheet"><div class="stability-handle"></div><header><div><small>ESTADO</small><h2>Realizados · ${esc(tab)}</h2></div><button data-close>×</button></header><p>Desliza a la derecha o toca Pendiente para regresar.</p><div class="stability-realized-list">${list.map(r=>`<article data-realized-id="${esc(r.id)}"><div><strong>${esc(displayOrigin(r.bed))} · ${esc(r.name||normalizeStudyDisplay(r.target)||'Paciente')}</strong><span>${esc(normalizeStudyDisplay(r.target)||r.destination||'')}</span></div><button data-restore="${esc(r.id)}">↩ Pendiente</button></article>`).join('')||'<div class="stability-empty">Sin realizados.</div>'}</div></section>`;
  back.addEventListener('click',e=>{if(e.target===back||e.target.closest('[data-close]'))return renderRealizedSheet(false);const b=e.target.closest('[data-restore]');if(b)setStatus(b.dataset.restore,'Pendiente')});
  document.body.appendChild(back);
}
function renderHistory(){
  const history=read(HISTORY_KEY,[]);document.getElementById('stabilityHistory')?.remove();
  const back=document.createElement('div');back.id='stabilityHistory';back.className='stability-backdrop';
  back.innerHTML=`<section class="stability-sheet"><div class="stability-handle"></div><header><div><small>TURNOS</small><h2>Historial</h2></div><button data-close>×</button></header><div class="stability-history">${history.length?history.map((h,i)=>`<button data-history="${i}"><span><strong>${new Date(h.shift?.startedAt||h.archivedAt).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}</strong><small>${new Date(h.shift?.startedAt||h.archivedAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</small></span><b>${Array.isArray(h.rows)?h.rows.length:0}</b></button>`).join(''):'<div class="stability-empty">Aún no hay turnos archivados.</div>'}</div></section>`;
  back.addEventListener('click',e=>{if(e.target===back||e.target.closest('[data-close]'))back.remove();const b=e.target.closest('[data-history]');if(b)renderHistoryDetail(history[Number(b.dataset.history)])});
  document.body.appendChild(back);
}
function renderHistoryDetail(h){
  const back=document.getElementById('stabilityHistory');if(!back)return;const list=Array.isArray(h?.rows)?h.rows:[];
  back.querySelector('.stability-sheet').innerHTML=`<div class="stability-handle"></div><header><div><small>HISTORIAL</small><h2>${new Date(h.shift?.startedAt||h.archivedAt).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})}</h2></div><button data-close>×</button></header><div class="stability-history-rows">${list.map(r=>`<article><strong>${esc(categoryFrom(r.category,r.modality,r.target))} · ${esc(displayOrigin(r.bed))} · ${esc(r.name||'—')}</strong><span>${esc(normalizeStudyDisplay(r.target)||r.destination||'—')} · ${esc(r.status||'Pendiente')}</span></article>`).join('')||'<div class="stability-empty">Turno vacío.</div>'}</div>`;
}
function startNewShift(){
  if(processing){showToast('Termina o detén el análisis de fotos antes de cambiar de turno.','warning');return}
  const list=rows();if(list.length&&!confirm(`Archivar ${list.length} registros e iniciar un turno nuevo?`))return;
  const shift=read(SHIFT_KEY,{id:uid(),startedAt:now()});const hist=read(HISTORY_KEY,[]);
  if(list.length)hist.unshift({shift:{...shift,status:'ARCHIVED',endedAt:now()},rows:list,archivedAt:now()});
  write(HISTORY_KEY,hist.slice(0,60));write(SHIFT_KEY,{id:uid(),startedAt:now(),status:'ACTIVE'});write(STORAGE_KEY,[]);localStorage.setItem(ACTIVE_TAB_KEY,'RX');location.reload();
}

function manualSubmit(form){
  const list=rows(),fd=new FormData(form),existing=editingId?list.find(r=>String(r.id)===String(editingId)):null;
  const tab=activeTab(),modality=clean(fd.get('modality')),target=clean(fd.get('target'));
  const category=existing?categoryFrom(existing.category,existing.modality,existing.target):(tab==='Piso'?'Piso':categoryFrom('',modality,target));
  const next={
    bed:normalizeBed(fd.get('bed')),name:clean(fd.get('name')),age:normalizeAge(fd.get('age')),sex:normSex(fd.get('sex')),
    category,modality:category==='TAC'?'TAC':category==='USG'?'Ultrasonido':'Rayos X',
    target:category==='Piso'?target:study(target),destination:category==='Piso'?target:'',
    diagnosis:clean(fd.get('diagnosis')),diagnosisMeaning:clean(fd.get('diagnosisMeaning')),
    transport:/port[áa]til/i.test(target)?'No trasladar':normTransport(fd.get('transport')),
    transportReason:clean(fd.get('transportReason')),oxygenProbable:fd.get('oxygenProbable')==='on',
    oxygenReason:fd.get('oxygenProbable')==='on'?clean(fd.get('oxygenReason')):'',
    manualOverrides:{bed:true,name:true,age:true,sex:true,target:true,transport:true,diagnosis:true,oxygenProbable:true},updatedAt:now()
  };
  if(!next.bed&&!next.name&&!next.target){showToast('Agrega cama, nombre o destino/estudio.','warning');return}
  if(category==='Piso'&&next.bed){
    const conflict=list.find(r=>String(r.id)!==String(editingId)&&isPending(r)&&categoryFrom(r.category,r.modality,r.target)==='Piso'&&canonicalOrigin(r.bed)===canonicalOrigin(next.bed));
    if(conflict){showToast(`La cama ${next.bed} ya está pendiente a Piso.`,'warning');return}
  }
  if(existing){const i=list.findIndex(r=>String(r.id)===String(editingId));list[i]={...existing,...next}}
  else{const shift=read(SHIFT_KEY,{id:uid(),startedAt:now()});list.unshift({id:uid(),shiftId:shift.id,status:'Pendiente',createdAt:now(),needsReview:false,reviewFields:[],imageFingerprint:'',...next})}
  write(STORAGE_KEY,list);editingId=null;sync();showToast('Guardado','success','',null,1200);
}

async function fingerprint(file){const buf=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buf);return[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function parseJSON(v){if(v&&typeof v==='object')return v;const s=clean(v),f=s.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()||s;try{return JSON.parse(f)}catch{const a=f.indexOf('{'),b=f.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(f.slice(a,b+1));throw new Error('Respuesta de análisis inválida.')}}
function normalizePhotoRow(p,fp,shiftId){
  const rawTarget=clean(p?.target||p?.study||p?.destination),category=categoryFrom(p?.category,p?.modality,rawTarget),bed=normalizeBed(p?.handwrittenBed)||normalizeBed(p?.formBed)||normalizeBed(p?.bed),target=category==='Piso'?clean(p?.destination||rawTarget):study(rawTarget);
  const low=Object.entries(p?.confidence||{}).filter(([,v])=>plain(v)==='low').map(([k])=>k);
  return{id:uid(),shiftId,category,bed,name:clean(p?.name),age:normalizeAge(p?.age)??ageFromBirth(p?.birthDate),sex:normSex(p?.sex),target,destination:category==='Piso'?target:clean(p?.destination),modality:category==='TAC'?'TAC':category==='USG'?'Ultrasonido':'Rayos X',diagnosis:clean(p?.diagnosis),diagnosisMeaning:clean(p?.diagnosisMeaning),service:clean(p?.service||p?.originService),recognizedText:clean(p?.recognizedText),transport:/port[áa]til/i.test(target)?'No trasladar':normTransport(p?.transport),transportReason:clean(p?.transportReason),oxygenProbable:Boolean(p?.oxygenProbable),oxygenReason:p?.oxygenProbable?clean(p?.oxygenReason):'',status:'Pendiente',needsReview:low.length>0,reviewFields:low,imageFingerprint:fp,manualOverrides:{},createdAt:now(),updatedAt:now()}
}
function sameName(a,b){const A=plain(a),B=plain(b);return!!A&&!!B&&(A===B||(A.length>=6&&B.length>=6&&(A.includes(B)||B.includes(A))))}
function mergeRow(existing,incoming){
  const o=existing.manualOverrides||{},pick=f=>o[f]?existing[f]:(incoming[f]!==''&&incoming[f]!==null&&incoming[f]!==undefined?incoming[f]:existing[f]);
  return{...existing,bed:pick('bed'),name:pick('name'),age:pick('age'),sex:pick('sex'),target:pick('target'),destination:incoming.destination||existing.destination,transport:pick('transport'),transportReason:pick('transportReason'),diagnosis:pick('diagnosis'),diagnosisMeaning:incoming.diagnosisMeaning||existing.diagnosisMeaning,service:incoming.service||existing.service,recognizedText:incoming.recognizedText||existing.recognizedText,oxygenProbable:o.oxygenProbable?existing.oxygenProbable:Boolean(existing.oxygenProbable||incoming.oxygenProbable),oxygenReason:pick('oxygenReason'),needsReview:Boolean(existing.needsReview||incoming.needsReview),reviewFields:[...new Set([...(existing.reviewFields||[]),...(incoming.reviewFields||[])])],updatedAt:now()}
}
function commitPhoto(job,patients){
  const list=rows(),warnings=[];let added=0,updated=0,skipped=0,partials=0;
  for(const p of patients){
    const incoming=normalizePhotoRow(p,job.fp,job.shiftId);
    if(incoming.category==='Piso'&&!incoming.bed){
      const header=plain(incoming.recognizedText);if(/^piso(?: total)? \d+$/.test(header)||header==='piso'||(/^\d+$/.test(header)&&plain(p?.category)==='piso'))continue;
      if(incoming.name||incoming.service||incoming.recognizedText)partials++;
      continue;
    }
    if(incoming.category!=='Piso'&&!incoming.bed&&!incoming.name&&!incoming.target)continue;
    const exact=list.find(r=>r.shiftId===job.shiftId&&r.imageFingerprint===job.fp&&categoryFrom(r.category,r.modality,r.target)===incoming.category&&((incoming.bed&&canonicalOrigin(r.bed)===canonicalOrigin(incoming.bed))||(incoming.name&&sameName(r.name,incoming.name))));
    if(exact){if(isPending(exact)){const i=list.findIndex(r=>r.id===exact.id);list[i]=mergeRow(exact,incoming);updated++}else skipped++;continue}
    if(incoming.category==='Piso'&&incoming.bed){
      const occupied=list.find(r=>r.shiftId===job.shiftId&&isPending(r)&&categoryFrom(r.category,r.modality,r.target)==='Piso'&&canonicalOrigin(r.bed)===canonicalOrigin(incoming.bed));
      if(occupied){if(sameName(occupied.name,incoming.name)||(!occupied.name&&!incoming.name)){const i=list.findIndex(r=>r.id===occupied.id);list[i]=mergeRow(occupied,incoming);updated++}else{warnings.push(`cama ${incoming.bed}`);skipped++}continue}
    }else{
      const match=list.find(r=>r.shiftId===job.shiftId&&isPending(r)&&categoryFrom(r.category,r.modality,r.target)===incoming.category&&incoming.name&&sameName(r.name,incoming.name)&&((incoming.bed&&canonicalOrigin(r.bed)===canonicalOrigin(incoming.bed))||plain(r.target)===plain(incoming.target)));
      if(match){const i=list.findIndex(r=>r.id===match.id);list[i]=mergeRow(match,incoming);updated++;continue}
    }
    list.unshift(incoming);added++;
  }
  write(STORAGE_KEY,list);sync();return{added,updated,skipped,partials,warnings}
}
async function analyze(job){
  if(!(job.file instanceof File)||!job.file.type.startsWith('image/'))throw new Error('Imagen inválida.');
  if(job.file.size>12*1024*1024)throw new Error('La foto pesa más de 12 MB.');
  job.state='Analizando';renderQueue();job.fp=await fingerprint(job.file);
  const form=new FormData();form.append('image',job.file);form.append('prompt',VISION_PROMPT);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
    const res=await fetch('/api/turno-rx/vision',{method:'POST',headers:{'X-Turno-RX':'1'},body:form,credentials:'same-origin',signal:controller.signal});
    const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Error ${res.status}`);
    const parsed=parseJSON(data.text||data.answer||data.output_text||data),patients=Array.isArray(parsed?.patients)?parsed.patients:[parsed];
    return commitPhoto(job,patients);
  }catch(e){if(e.name==='AbortError')throw new Error('El análisis tardó demasiado.');throw e}finally{clearTimeout(timer)}
}
async function processJobs(jobs=queue.filter(j=>j.state==='En espera')){
  if(processing)return;processing=true;stopQueue=false;renderQueue();
  for(const job of jobs){
    if(stopQueue){if(job.state==='En espera')job.state='Cancelada';continue}
    try{const r=await analyze(job);job.added=r.added;job.state=(r.partials||r.warnings.length)?'Revisar':'Lista';job.message=[r.added?`${r.added} agregado${r.added===1?'':'s'}`:'',r.updated?`${r.updated} actualizado${r.updated===1?'':'s'}`:'',r.skipped?`${r.skipped} omitido${r.skipped===1?'':'s'}`:'',r.partials?`${r.partials} lectura${r.partials===1?'':'s'} parcial${r.partials===1?'':'es'}`:'',r.warnings.length?`Revisar ${[...new Set(r.warnings)].join(', ')}`:''].filter(Boolean).join(' · ')}
    catch(e){job.state='Error';job.message=e?.message||'Error inesperado'}renderQueue()
  }
  processing=false;renderQueue();showToast(queue.some(j=>j.state==='Error')?'Proceso terminado con errores.':'Fotos procesadas.',queue.some(j=>j.state==='Error')?'warning':'success','',null,1800);
}
function addFiles(files){
  const list=[...(files||[])];if(!list.length)return;const shift=read(SHIFT_KEY,{id:uid(),startedAt:now()}),offset=queue.length;
  queue.push(...list.map((file,i)=>({id:uid(),index:offset+i,file,shiftId:shift.id,state:'En espera',message:'',added:0,fp:''})));renderQueue();processJobs();
}
function renderQueue(){
  const app=document.getElementById('app');if(!app)return;let box=app.querySelector('#stabilityQueue');
  if(!queue.length){box?.remove();return}
  if(!box){box=document.createElement('section');box.id='stabilityQueue';box.className='stability-queue';const anchor=app.querySelector('.capture-status');anchor?.insertAdjacentElement('afterend',box)}
  const done=queue.filter(j=>['Lista','Revisar','Error'].includes(j.state)).length,added=queue.reduce((n,j)=>n+(j.added||0),0),active=queue.find(j=>j.state==='Analizando');
  const html=`<div class="stability-queue-head"><div><strong>${active?`Analizando foto ${active.index+1} de ${queue.length}`:`${done} de ${queue.length} procesadas`}</strong><small>${added} agregados</small></div>${processing?'<button data-stop-queue>Detener</button>':'<button data-clear-queue>Ocultar</button>'}</div><div class="stability-jobs">${queue.map(j=>`<div><span><b>Foto ${j.index+1}</b><small>${esc(j.message)}</small></span><span class="${j.state.toLowerCase()}">${esc(j.state)}${j.state==='Error'?` <button data-retry="${j.id}">Reintentar</button>`:''}</span></div>`).join('')}</div>`;
  if(box.innerHTML!==html)box.innerHTML=html;
}

document.addEventListener('click',e=>{
  if(Date.now()<suppressClickUntil&&e.target.closest('.patient-row,[data-realized-id]')){e.preventDefault();e.stopImmediatePropagation();return}
  const row=e.target.closest('.patient-row[data-id]');
  if(row&&!e.target.closest('button,input,select,textarea,label'))editingId=row.dataset.id;
  if(e.target.closest('#manualCapture'))editingId=null;
  if(e.target.closest('#closeSheet')||e.target.id==='sheetBackdrop')editingId=null;
  if(e.target.closest('#cameraCapture')){e.preventDefault();e.stopImmediatePropagation();document.getElementById('cameraInput')?.click();return}
  if(e.target.closest('#historyCapture')){e.preventDefault();e.stopImmediatePropagation();renderHistory();return}
  if(e.target.closest('#newShift')){e.preventDefault();e.stopImmediatePropagation();startNewShift();return}
  const t=e.target.closest('[data-quick-transport]');if(t){e.preventDefault();e.stopImmediatePropagation();transportCycle(t.dataset.patientId);return}
  const tc=e.target.closest('[data-stability-transport]');if(tc){e.preventDefault();e.stopImmediatePropagation();transportCycle(tc.dataset.stabilityTransport);return}
  if(e.target.closest('#stabilityDelete')){e.preventDefault();e.stopImmediatePropagation();if(editingId)safeDelete(editingId);return}
  const retry=e.target.closest('[data-retry]');if(retry){e.preventDefault();const j=queue.find(x=>x.id===retry.dataset.retry);if(j&&!processing){j.state='En espera';j.message='';processJobs([j])}return}
  if(e.target.closest('[data-stop-queue]')){stopQueue=true;showToast('Se detendrá después de la foto actual.','warning');return}
  if(e.target.closest('[data-clear-queue]')){queue=[];renderQueue();return}
  if(e.target.closest('[data-category-tab]'))queueMicrotask(refreshRealized);
},true);

document.addEventListener('submit',e=>{
  if(e.target.id!=='patientForm')return;
  e.preventDefault();e.stopImmediatePropagation();manualSubmit(e.target);
},true);

document.addEventListener('change',e=>{
  if(e.target.id!=='galleryInput'&&e.target.id!=='cameraInput')return;
  e.stopImmediatePropagation();const files=e.target.files;e.target.value='';addFiles(files);
},true);

document.addEventListener('pointerdown',e=>{
  const row=e.target.closest('.patient-row[data-id]'),realized=e.target.closest('[data-realized-id]');
  if((row&&e.target.closest('button,input,select,textarea,label'))||(!row&&!realized))return;
  gesture={id:row?.dataset.id||realized?.dataset.realizedId,mode:row?'pending':'realized',x:e.clientX,y:e.clientY,row:row||realized,pointerId:e.pointerId,armed:false};
},{passive:true,capture:true});
document.addEventListener('pointermove',e=>{
  if(!gesture||gesture.pointerId!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.abs(dy)>Math.abs(dx)*.9){gesture.row.style.transform='';gesture.armed=false;return}
  const allowed=gesture.mode==='pending'?dx<0:dx>0;if(!allowed)return;gesture.row.style.transform=`translateX(${Math.max(-90,Math.min(90,dx))}px)`;gesture.armed=Math.abs(dx)>=72;
},{passive:true,capture:true});
document.addEventListener('pointerup',e=>{
  if(!gesture||gesture.pointerId!==e.pointerId)return;const g=gesture;gesture=null;g.row.style.transform='';const dx=e.clientX-g.x,dy=e.clientY-g.y;if(g.armed&&Math.abs(dx)>Math.abs(dy)*1.25){suppressClickUntil=Date.now()+450;if(g.mode==='pending'&&dx<0)setStatus(g.id,'Realizado');if(g.mode==='realized'&&dx>0)setStatus(g.id,'Pendiente')}
},{passive:true,capture:true});
document.addEventListener('pointercancel',()=>{if(gesture)gesture.row.style.transform='';gesture=null},{passive:true,capture:true});

enhance();
