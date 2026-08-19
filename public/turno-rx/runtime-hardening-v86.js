import { syncRowsFromStorageAndRender, normalizeCategory } from './app-v16.js?v=65';

// Pendientes v86 — runtime hardening between the legacy renderer and the modern capture owner.
// app-v16 still renders the shell/manual form, but its direct galleryInput listener is detached.
// capture-fix-v80.js?v=81 remains the only effective photo-analysis owner.
const BUILD='86';
const STORAGE_KEY='pendientes-table-v2';

const clean=value=>String(value??'').trim();
const plain=value=>clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

const DESTINATION_SERVICES=new Map([
  ['nefrologia',{floor:'Primero',block:'B'}],
  ['cirugia',{floor:'Segundo',block:'B'}],
  ['cirugia trauma',{floor:'Segundo',block:'B'}],
  ['trauma',{floor:'Segundo',block:'B'}],
  ['traumatologia',{floor:'Segundo',block:'B'}],
  ['medicina interna',{floor:'Tercero',block:'B'}],
  ['mi',{floor:'Tercero',block:'B'}],
  ['obstetricia',{floor:'Segundo',block:'A'}],
  ['pediatria',{floor:'Tercero',block:'A'}],
  ['ginecologia',{floor:'Quinto',block:'A'}]
]);

function serviceDestination(value){
  const key=plain(value);
  if(DESTINATION_SERVICES.has(key))return DESTINATION_SERVICES.get(key);
  if(key.includes('cirugia')||key.includes('trauma'))return DESTINATION_SERVICES.get('cirugia trauma');
  if(key.includes('medicina interna'))return DESTINATION_SERVICES.get('medicina interna');
  return null;
}

export function migrateLegacyFloorRow(row){
  if(!row||normalizeCategory(row.category,row.modality,row.target)!=='Piso')return row;
  const service=clean(row.service),originService=clean(row.originService),destinationService=clean(row.destinationService);
  const candidate=destinationService||service||originService;
  const mapped=serviceDestination(candidate);
  if(!mapped)return row;

  const next={...row};
  let changed=false;
  if(!destinationService){next.destinationService=candidate;changed=true;}
  if(!clean(next.destinationFloor)){next.destinationFloor=mapped.floor;changed=true;}
  if(!clean(next.destinationBlock)){next.destinationBlock=mapped.block;changed=true;}

  // Legacy Piso captures copied the destination service into service/originService.
  // Remove that false provenance while preserving a genuinely different explicit origin.
  if(service&&plain(service)===plain(candidate)){
    const explicitOrigin=originService&&plain(originService)!==plain(candidate)?originService:'';
    if(next.service!==explicitOrigin){next.service=explicitOrigin;changed=true;}
  }
  if(originService&&plain(originService)===plain(candidate)){
    next.originService='';changed=true;
  }
  if(clean(next.originService)&&clean(next.service)!==clean(next.originService)){
    next.service=clean(next.originService);changed=true;
  }

  if(!changed)return row;
  next.schemaVersion=Math.max(Number(next.schemaVersion)||0,86);
  next.updatedAt=next.updatedAt||new Date().toISOString();
  return next;
}

export function migrateLegacyFloorRows(rows){
  if(!Array.isArray(rows))return {rows:[],changed:false};
  let changed=false;
  const migrated=rows.map(row=>{const next=migrateLegacyFloorRow(row);if(next!==row)changed=true;return next;});
  return {rows:migrated,changed};
}

function readRows(){
  try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(parsed)?parsed:[]}
  catch{return[]}
}

function applyLegacyFloorMigration(){
  const current=readRows(),result=migrateLegacyFloorRows(current);
  if(!result.changed)return false;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(result.rows));
  syncRowsFromStorageAndRender();
  return true;
}

export function detachLegacyGalleryInput(){
  const input=document.getElementById('galleryInput');
  if(!input||input.dataset.captureOwner==='modern-v86')return false;
  const clone=input.cloneNode(true);
  clone.dataset.captureOwner='modern-v86';
  // Replacing the node removes app-v16's directly-bound handlePhotoInput listener.
  // The modern capture owner listens on document capture, so it continues to receive changes.
  input.replaceWith(clone);
  return true;
}

let scheduled=false;
function harden(){
  const app=document.getElementById('app');
  if(app)app.dataset.runtimeHardeningBuild=BUILD;
  detachLegacyGalleryInput();
}

const app=document.getElementById('app');
if(app){
  const observer=new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;harden()});
  });
  observer.observe(app,{childList:true,subtree:true});
}

applyLegacyFloorMigration();
harden();
window.__pendientesRuntimeHardeningV86={detachLegacyGalleryInput,migrateLegacyFloorRow,migrateLegacyFloorRows};
