import { syncRowsFromStorageAndRender, normalizeCategory } from './app-v16.js?v=87';

// Pendientes v87 — migration-only bridge between the legacy renderer and the
// modern operational modules. The renderer now declares the modern capture
// owner directly, so this file no longer replaces live DOM nodes.
const BUILD='87';
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
  const migrated=[];
  for(const row of rows){
    // These rows were transient OCR review hints, never confirmed patients.
    // Older builds persisted them and could create long lists of "Falta".
    if(row?.captureReviewOnly&&!clean(row?.bed)){
      changed=true;
      continue;
    }
    const next=migrateLegacyFloorRow(row);if(next!==row)changed=true;migrated.push(next);
  }
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
  if(!input||input.dataset.captureOwner==='modern-v87')return false;
  input.dataset.captureOwner='modern-v87';
  return true;
}

function harden(){
  const app=document.getElementById('app');
  if(app)app.dataset.runtimeHardeningBuild=BUILD;
  detachLegacyGalleryInput();
}

applyLegacyFloorMigration();
harden();
window.__pendientesRuntimeHardeningV87={detachLegacyGalleryInput,migrateLegacyFloorRow,migrateLegacyFloorRows};
