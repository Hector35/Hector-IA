import {
  syncRowsFromStorageAndRender,
  normalizeStudyDisplay,
  normalizeCategory,
  displayOrigin
} from './app-v16.js?v=87';

// Pendientes v89 — interaction-only runtime.
// IMPORTANT: this module intentionally owns NO photo analysis, vision prompt,
// /api/turno-rx/vision request, photo queue, or vision reconciliation.
// capture-fix-v80.js?v=87 is the sole photo-capture owner.
const BUILD='89';
const STORAGE_KEY='pendientes-table-v2';
const SHIFT_KEY='pendientes-shift-v1';
const HISTORY_KEY='pendientes-shift-history-v1';
const ACTIVE_TAB_KEY='pendientes-active-category-v49';

let editingId=null;
let gesture=null;
let sideGesture=null;
let suppressClickUntil=0;
let observerScheduled=false;
let undo=null;
let undoTimer=null;

const clean=v=>String(v??'').trim();
const plain=v=>clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now=()=>new Date().toISOString();
function read(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}}
function write(key,val){localStorage.setItem(key,JSON.stringify(val))}
function rows(){const r=read(STORAGE_KEY,[]);return Array.isArray(r)?r:[]}
function activeTab(){return document.querySelector('[data-category-tab].is-active')?.dataset.categoryTab||read(ACTIVE_TAB_KEY,'RX')||'RX'}
function isPending(r){return plain(r?.status)!=='realizado'}
function categoryTabFrom(category,modality,target){
  const normalized=normalizeCategory(category,modality,target);
  if(normalized==='Piso')return'Piso';
  if(normalized==='TAC')return'TAC';
  if(normalized==='USG'||normalized==='Ultrasonido')return'USG';
  // Interconsulta, Apoyo para movimiento, Rayos X y otros estudios viven en el panel RX.
  return'RX';
}
function normTransport(v){const t=plain(v);if(t.includes('no traslad')||t.includes('portatil'))return'No trasladar';if(t.includes('camilla'))return'Camilla';if(t.includes('silla'))return'Silla';return'Por definir'}
function showToast(msg,tone='info',actionText='',action=null,ms=2600){document.getElementById('stabilityToast')?.remove();const el=document.createElement('div');el.id='stabilityToast';el.className=`stability-toast ${tone}`;el.innerHTML=`<span>${esc(msg)}</span>${actionText?`<button type="button">${esc(actionText)}</button>`:''}`;document.body.appendChild(el);if(actionText)el.querySelector('button').onclick=()=>{el.remove();action?.()};if(ms>0)setTimeout(()=>el.remove(),ms)}
function sync(){syncRowsFromStorageAndRender();queueMicrotask(enhance)}

function transportCycle(id){
  const list=rows(),i=list.findIndex(r=>String(r.id)===String(id));if(i<0)return;
  const row=list[i];
  if(/\bportatil\b/.test(plain(row.target))){showToast('Estudio portátil: no trasladar','info','',null,1500);return}
  const current=normTransport(row.transport),seq=['Por definir','Silla','Camilla'];
  const position=seq.indexOf(current),next=position<0?'Por definir':seq[(position+1)%seq.length];
  const automaticReason=clean(row.transportReasonAuto||row.transportReason);
  list[i]={
    ...row,
    transport:next,
    transportReason:'',
    transportReasonAuto:automaticReason,
    updatedAt:now(),
    manualOverrides:{...(row.manualOverrides||{}),transport:true,transportReason:true}
  };
  write(STORAGE_KEY,list);sync();showToast(`Traslado: ${next}`,'success','',null,1300)
}
function setStatus(id,status){const list=rows(),i=list.findIndex(r=>String(r.id)===String(id));if(i<0)return;const prev=clean(list[i].status)||'Pendiente';if(plain(prev)===plain(status))return;list[i]={...list[i],status,statusUpdatedAt:now(),completedAt:status==='Realizado'?now():null,reopenedAt:status==='Pendiente'?now():list[i].reopenedAt};write(STORAGE_KEY,list);sync();refreshRealized();showToast(status==='Realizado'?'Marcado como realizado':'Regresó a pendiente','success','Deshacer',()=>setStatus(id,prev),5000)}
function safeDelete(id){const list=rows(),i=list.findIndex(r=>String(r.id)===String(id));if(i<0)return;const [removed]=list.splice(i,1);write(STORAGE_KEY,list);editingId=null;sync();undo={row:removed,index:i};clearTimeout(undoTimer);undoTimer=setTimeout(()=>undo=null,7100);showToast('Paciente eliminado','warning','Deshacer',()=>{if(!undo)return;const next=rows();next.splice(Math.min(undo.index,next.length),0,undo.row);undo=null;write(STORAGE_KEY,next);sync()},7000)}

function isPhotoProcessing(){const status=document.getElementById('captureStatus');return Boolean(status&&!status.hidden&&status.dataset.state==='busy')}
function startNewShift(){if(isPhotoProcessing()){showToast('Termina el análisis de fotos antes de cambiar de turno.','warning');return}const list=rows();if(list.length&&!confirm(`Archivar ${list.length} registros e iniciar un turno nuevo?`))return;const shift=read(SHIFT_KEY,{id:uid(),startedAt:now()}),hist=read(HISTORY_KEY,[]);if(list.length)hist.unshift({shift:{...shift,status:'ARCHIVED',endedAt:now()},rows:list,archivedAt:now()});write(HISTORY_KEY,hist.slice(0,60));write(SHIFT_KEY,{id:uid(),startedAt:now(),status:'ACTIVE'});write(STORAGE_KEY,[]);write(ACTIVE_TAB_KEY,'RX');sync();refreshRealized();showToast('Turno nuevo iniciado','success')}

function sideMenu(){return document.getElementById('stabilitySideMenu')}
function openSideMenu(){ensureSideMenu();const menu=sideMenu();if(!menu)return;menu.classList.add('is-open');menu.setAttribute('aria-hidden','false');document.body.classList.add('stability-menu-open');menu.querySelector('.stability-side-sheet')?.focus()}
function closeSideMenu(){const menu=sideMenu();if(!menu)return;menu.classList.remove('is-open');menu.setAttribute('aria-hidden','true');document.body.classList.remove('stability-menu-open')}
function runSideAction(action){closeSideMenu();queueMicrotask(()=>{if(action==='history')document.getElementById('historyCapture')?.click();if(action==='shift')document.getElementById('newShift')?.click();if(action==='camera')document.getElementById('cameraCapture')?.click();if(action==='gallery')document.getElementById('galleryCapture')?.click();if(action==='manual')document.getElementById('manualCapture')?.click()})}
function ensureSideMenu(){
  if(sideMenu())return;
  const menu=document.createElement('div');menu.id='stabilitySideMenu';menu.className='stability-side-menu';menu.setAttribute('aria-hidden','true');
  menu.innerHTML=`<button type="button" class="stability-side-backdrop" data-side-close aria-label="Cerrar menú"></button><aside class="stability-side-sheet" role="dialog" aria-modal="true" aria-label="Menú de Pendientes" tabindex="-1"><div class="stability-side-head"><div><small>PENDIENTES</small><strong>Acciones del turno</strong></div><button type="button" data-side-close aria-label="Cerrar menú">×</button></div><div class="stability-side-actions"><button type="button" data-side-action="history"><span>◷</span><b>Historial</b></button><button type="button" data-side-action="shift"><span>↻</span><b>Nuevo turno</b></button><button type="button" data-side-action="camera"><span>⌾</span><b>Cámara</b></button><button type="button" data-side-action="gallery"><span>▧</span><b>Foto</b></button><button type="button" data-side-action="manual"><span>✎</span><b>Manual</b></button></div><p>Desliza hacia la izquierda para cerrar.</p></aside>`;
  menu.addEventListener('click',event=>{if(event.target.closest('[data-side-close]')){closeSideMenu();return}const action=event.target.closest('[data-side-action]')?.dataset.sideAction;if(action)runSideAction(action)});
  document.body.appendChild(menu);
}

function enhance(){const app=document.getElementById('app');if(!app)return;app.dataset.interactionBuild=BUILD;ensureSideMenu();const actions=app.querySelector('.capture-actions');if(actions&&!document.getElementById('cameraCapture')){const camera=document.createElement('button');camera.id='cameraCapture';camera.type='button';camera.className='capture-icon-btn stability-camera';camera.setAttribute('aria-label','Tomar foto');camera.innerHTML='⌾';actions.insertBefore(camera,actions.querySelector('#galleryCapture'));const input=document.createElement('input');input.id='cameraInput';input.type='file';input.accept='image/*';input.setAttribute('capture','environment');input.hidden=true;actions.appendChild(input)}if(actions&&!document.getElementById('historyCapture')){const h=document.createElement('button');h.id='historyCapture';h.type='button';h.className='capture-icon-btn';h.setAttribute('aria-label','Historial');h.innerHTML='◷';actions.insertBefore(h,actions.firstChild)}app.querySelectorAll('.remove-btn').forEach(b=>b.tabIndex=-1);app.querySelectorAll('.imaging-row[data-id] .transport-cell').forEach(cell=>{cell.dataset.stabilityTransport=cell.closest('[data-id]')?.dataset.id||'';cell.setAttribute('role','button');cell.setAttribute('aria-label','Cambiar traslado')});const form=app.querySelector('#patientForm');if(form&&editingId&&!form.querySelector('#stabilityDelete')){const save=form.querySelector('.save-btn');if(save){const del=document.createElement('button');del.type='button';del.id='stabilityDelete';del.className='stability-delete';del.textContent='Eliminar';save.parentElement?.insertBefore(del,save)}}refreshRealized()}
const observer=new MutationObserver(()=>{if(observerScheduled)return;observerScheduled=true;queueMicrotask(()=>{observerScheduled=false;enhance()})});
observer.observe(document.getElementById('app'),{childList:true,subtree:true});

function refreshRealized(){const tab=activeTab(),list=rows().filter(r=>!isPending(r)&&categoryTabFrom(r.category,r.modality,r.target)===tab);let pill=document.getElementById('stabilityRealizedPill');if(!list.length){pill?.remove();if(document.getElementById('stabilityRealizedSheet'))renderRealizedSheet(false);return}if(!pill){pill=document.createElement('button');pill.id='stabilityRealizedPill';pill.className='stability-realized-pill';pill.type='button';document.body.appendChild(pill)}pill.textContent=`✓ Realizados ${list.length}`;pill.onclick=()=>renderRealizedSheet(true);if(document.getElementById('stabilityRealizedSheet'))renderRealizedSheet(true)}
function renderRealizedSheet(open=true){document.getElementById('stabilityRealizedSheet')?.remove();if(!open)return;const tab=activeTab(),list=rows().filter(r=>!isPending(r)&&categoryTabFrom(r.category,r.modality,r.target)===tab);const back=document.createElement('div');back.id='stabilityRealizedSheet';back.className='stability-backdrop';back.innerHTML=`<section class="stability-sheet" role="dialog" aria-modal="true" aria-labelledby="stabilityRealizedTitle"><div class="stability-handle"></div><header><div><small>ESTADO</small><h2 id="stabilityRealizedTitle">Realizados · ${esc(tab)}</h2></div><button data-close aria-label="Cerrar realizados">×</button></header><p>Desliza a la derecha o toca Pendiente para regresar.</p><div class="stability-realized-list">${list.map(r=>`<article data-realized-id="${esc(r.id)}"><div><strong>${esc(displayOrigin(r.bed))} · ${esc(r.name||normalizeStudyDisplay(r.target)||'Paciente')}</strong><span>${esc(normalizeStudyDisplay(r.target)||r.destination||'')}</span></div><button data-restore="${esc(r.id)}">↩ Pendiente</button></article>`).join('')||'<div class="stability-empty">Sin realizados.</div>'}</div></section>`;back.addEventListener('click',e=>{if(e.target===back||e.target.closest('[data-close]'))return renderRealizedSheet(false);const b=e.target.closest('[data-restore]');if(b)setStatus(b.dataset.restore,'Pendiente')});document.body.appendChild(back);back.querySelector('[data-close]')?.focus()}

document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(sideMenu()?.classList.contains('is-open')){closeSideMenu();return}if(document.getElementById('stabilityRealizedSheet'))renderRealizedSheet(false)});

document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest('.patient-row,[data-realized-id]')){e.preventDefault();e.stopImmediatePropagation();return}const row=e.target.closest('.patient-row[data-id]');if(row&&!e.target.closest('button,input,select,textarea,label'))editingId=row.dataset.id;if(e.target.closest('#manualCapture'))editingId=null;if(e.target.closest('#closeSheet')||e.target.id==='sheetBackdrop')editingId=null;if(e.target.closest('#cameraCapture')){e.preventDefault();e.stopImmediatePropagation();document.getElementById('cameraInput')?.click();return}if(e.target.closest('#newShift')){e.preventDefault();e.stopImmediatePropagation();startNewShift();return}const t=e.target.closest('[data-quick-transport]');if(t){e.preventDefault();e.stopImmediatePropagation();transportCycle(t.dataset.patientId);return}const tc=e.target.closest('[data-stability-transport]');if(tc){e.preventDefault();e.stopImmediatePropagation();transportCycle(tc.dataset.stabilityTransport);return}if(e.target.closest('#stabilityDelete')){e.preventDefault();e.stopImmediatePropagation();if(editingId)safeDelete(editingId);return}if(e.target.closest('[data-category-tab]'))queueMicrotask(refreshRealized)},true);

document.addEventListener('pointerdown',e=>{
  const menuOpen=sideMenu()?.classList.contains('is-open');
  if(menuOpen&&e.target.closest('.stability-side-sheet')){sideGesture={mode:'close',x:e.clientX,y:e.clientY,pointerId:e.pointerId};return}
  const sheetOpen=document.getElementById('sheetBackdrop')&&!document.getElementById('sheetBackdrop').hidden;
  if(!menuOpen&&!sheetOpen&&e.clientX<=32&&!e.target.closest('input,select,textarea')){sideGesture={mode:'open',x:e.clientX,y:e.clientY,pointerId:e.pointerId};return}
  const row=e.target.closest('.patient-row[data-id]'),realized=e.target.closest('[data-realized-id]');if((row&&e.target.closest('button,input,select,textarea,label'))||(!row&&!realized))return;gesture={id:row?.dataset.id||realized?.dataset.realizedId,mode:row?'pending':'realized',x:e.clientX,y:e.clientY,row:row||realized,pointerId:e.pointerId,armed:false}
},{passive:true,capture:true});
document.addEventListener('pointermove',e=>{if(sideGesture&&sideGesture.pointerId===e.pointerId)return;if(!gesture||gesture.pointerId!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.abs(dy)>Math.abs(dx)*.9){gesture.row.style.transform='';gesture.armed=false;return}const allowed=gesture.mode==='pending'?dx<0:dx>0;if(!allowed)return;gesture.row.style.transform=`translateX(${Math.max(-90,Math.min(90,dx))}px)`;gesture.armed=Math.abs(dx)>=72},{passive:true,capture:true});
document.addEventListener('pointerup',e=>{
  if(sideGesture&&sideGesture.pointerId===e.pointerId){const g=sideGesture;sideGesture=null;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.abs(dx)>Math.abs(dy)*1.35){if(g.mode==='open'&&dx>=72)openSideMenu();if(g.mode==='close'&&dx<=-72)closeSideMenu()}return}
  if(!gesture||gesture.pointerId!==e.pointerId)return;const g=gesture;gesture=null;g.row.style.transform='';const dx=e.clientX-g.x,dy=e.clientY-g.y;if(g.armed&&Math.abs(dx)>Math.abs(dy)*1.25){suppressClickUntil=Date.now()+450;if(g.mode==='pending'&&dx<0)setStatus(g.id,'Realizado');if(g.mode==='realized'&&dx>0)setStatus(g.id,'Pendiente')}
},{passive:true,capture:true});
document.addEventListener('pointercancel',()=>{if(gesture)gesture.row.style.transform='';gesture=null;sideGesture=null},{passive:true,capture:true});

window.__PENDIENTES_INTERACTION_OWNER__=BUILD;
document.documentElement.dataset.pendientesInteractionBuild=BUILD;
enhance();

if('serviceWorker' in navigator){
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading)return;
    const reload=()=>{if(reloading)return;reloading=true;location.reload()};
    if(isPhotoProcessing()){showToast('Actualización lista. Se aplicará al terminar las fotos.','info','Aplicar ahora',reload,0);const timer=setInterval(()=>{if(!isPhotoProcessing()){clearInterval(timer);reload()}},500);return}
    reload();
  });
}

export { transportCycle, setStatus, startNewShift, categoryTabFrom, openSideMenu, closeSideMenu };
