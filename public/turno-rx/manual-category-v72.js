(() => {
  // Pendientes v94 — categoría manual autoritativa y coherencia de Piso; observer idempotente en WebKit.
  const STORAGE_KEY='pendientes-table-v2';
  const VALUE_FOR_TAB={RX:'Rayos X',TAC:'TAC',USG:'Ultrasonido',Piso:'Piso'};
  const MANUAL_FIELDS=['bed','name','age','sex','target','category','modality','diagnosis','diagnosisMeaning','transport','transportReason','oxygenProbable','oxygenReason'];
  let editingId=null;

  const clean=value=>String(value??'').trim();
  const plain=value=>clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const readRows=()=>{try{const rows=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return[]}};
  const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);

  function activeTab(){return document.querySelector('[data-category-tab].is-active')?.dataset.categoryTab||'RX'}
  function ensureCategorySelect(){
    const select=document.getElementById('modality');if(!select)return null;
    if(!select.querySelector('option[value="Piso"]')){const option=document.createElement('option');option.value='Piso';option.textContent='Piso';select.appendChild(option)}
    const label=select.closest('label')?.querySelector('span');if(label&&label.textContent!=='Categoría')label.textContent='Categoría';
    return select;
  }
  function valueForRow(row){
    const category=plain(row?.category),modality=plain(row?.modality);
    if(category==='piso')return'Piso';
    if(category==='tac'||modality==='tac')return'TAC';
    if(category==='usg'||category.includes('ultrason')||modality.includes('ultrason'))return'Ultrasonido';
    if(category.includes('rayos')||category==='rx'||modality.includes('rayos'))return'Rayos X';
    return'Otro';
  }
  function prepareNew(){queueMicrotask(()=>{const select=ensureCategorySelect();if(select)select.value=VALUE_FOR_TAB[activeTab()]||'Rayos X'})}
  function prepareEdit(id){queueMicrotask(()=>{const backdrop=document.getElementById('sheetBackdrop');if(!backdrop||backdrop.hidden)return;const row=readRows().find(item=>String(item.id)===String(id)),select=ensureCategorySelect();if(row&&select)select.value=valueForRow(row)})}

  function floorDestination(value){
    const text=clean(value).toUpperCase().replace(/\s+/g,' '),match=text.match(/^(?:CAMA(?: DE PISO)?\s*)?#?\s*(\d{1,3})$/);if(!match)return null;
    const n=Number(match[1]);if(n>=1&&n<=44)return{floor:'Primero',block:'B'};if(n<=88)return{floor:'Segundo',block:'B'};if(n<=132)return{floor:'Tercero',block:'B'};if(n<=165)return{floor:'Segundo',block:'A'};if(n<=198)return{floor:'Tercero',block:'A'};if(n<=231)return{floor:'Quinto',block:'A'};return null;
  }
  function originKey(value){
    let text=clean(value).toUpperCase().replace(/^C\/\s*(?=CE\s*\d+)/,'').replace(/[\s#]+/g,'');if(!text)return'';
    let match=text.match(/^(CE|UP|UI)0*(\d+)$/);if(match)return`${match[1]}:${Number(match[2])}`;
    match=text.match(/^(?:UA|C|CAMA)?0*(\d+)$/);if(match)return`N:${Number(match[1])}`;
    return text;
  }
  function categoryData(selected){
    if(selected==='Piso')return{category:'Piso',modality:'Otro'};
    if(selected==='TAC')return{category:'TAC',modality:'TAC'};
    if(selected==='Ultrasonido')return{category:'USG',modality:'Ultrasonido'};
    if(selected==='Rayos X')return{category:'Rayos X',modality:'Rayos X'};
    return{category:'Otro',modality:'Otro'};
  }
  function normalizeManualRow(row,selected,before,isNew){
    const mappedCategory=categoryData(selected),next={...row,...mappedCategory,updatedAt:new Date().toISOString()};
    if(mappedCategory.category==='Piso'){
      next.destination=clean(next.target||next.destination);
      const mapped=floorDestination(next.destination);
      if(mapped){next.destinationFloor=mapped.floor;next.destinationBlock=mapped.block}
    }else if(plain(before?.category)==='piso'){
      next.destination='';next.destinationFloor='';next.destinationBlock='';next.destinationService='';
    }
    const overrides={...(before?.manualOverrides||{}),...(row.manualOverrides||{})};
    if(isNew){for(const field of MANUAL_FIELDS)overrides[field]=true}
    else{
      for(const field of MANUAL_FIELDS)if(!same(before?.[field],next[field]))overrides[field]=true;
      overrides.category=true;overrides.modality=true;
    }
    if(mappedCategory.category==='Piso'){overrides.destination=true;overrides.destinationFloor=true;overrides.destinationBlock=true}
    next.manualOverrides=overrides;
    return next;
  }
  function migrateFloorRows({render=false}={}){
    const rows=readRows();let changed=false;
    const migrated=rows.map(row=>{
      if(plain(row?.category)!=='piso')return row;
      const mapped=floorDestination(row.destination||row.target);if(!mapped)return row;
      if(clean(row.destinationFloor)===mapped.floor&&clean(row.destinationBlock).toUpperCase()===mapped.block)return row;
      changed=true;return{...row,destination:clean(row.destination||row.target),destinationFloor:mapped.floor,destinationBlock:mapped.block};
    });
    if(changed){localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));if(render)document.dispatchEvent(new CustomEvent('pendientes:status-changed'))}
    return changed;
  }
  function showPisoConflict(bed){
    const error=document.getElementById('formError');if(error){error.hidden=false;error.textContent=`La cama ${bed} ya tiene otro paciente a Piso en este turno. Revisa antes de guardar.`}
    document.getElementById('bed')?.focus();
  }

  window.addEventListener('click',event=>{
    const row=event.target.closest?.('.patient-row[data-id]');
    if(row){editingId=row.dataset.id;prepareEdit(editingId)}
    if(event.target.closest?.('#manualCapture')){editingId=null;prepareNew()}
    if(event.target.closest?.('#closeSheet')||event.target.id==='sheetBackdrop')editingId=null;
  },true);

  window.addEventListener('submit',event=>{
    if(event.target?.id!=='patientForm')return;
    const select=ensureCategorySelect(),selected=select?.value||VALUE_FOR_TAB[activeTab()]||'Rayos X';
    const beforeRows=readRows(),beforeIds=new Set(beforeRows.map(row=>String(row.id))),editId=editingId,before=editId?beforeRows.find(row=>String(row.id)===String(editId)):null;
    if(selected==='Piso'){
      const bed=clean(event.target.querySelector('#bed')?.value),key=originKey(bed);
      const conflict=key&&beforeRows.find(row=>String(row.id)!==String(editId||'')&&plain(row.status)!=='realizado'&&plain(row.category)==='piso'&&originKey(row.bed)===key);
      if(conflict){event.preventDefault();event.stopImmediatePropagation();showPisoConflict(bed);return}
    }
    globalThis.__PENDIENTES_MANUAL_WRITE__=true;
    queueMicrotask(()=>{
      try{
        const backdrop=document.getElementById('sheetBackdrop');if(backdrop&&!backdrop.hidden)return;
        const rows=readRows();let index=-1;
        if(editId)index=rows.findIndex(row=>String(row.id)===String(editId));
        else index=rows.findIndex(row=>!beforeIds.has(String(row.id)));
        if(index<0)return;
        rows[index]=normalizeManualRow(rows[index],selected,before,!editId);
        localStorage.setItem(STORAGE_KEY,JSON.stringify(rows));
        document.dispatchEvent(new CustomEvent('pendientes:status-changed'));
        editingId=null;
      }finally{globalThis.__PENDIENTES_MANUAL_WRITE__=false}
    });
  },true);

  const observer=new MutationObserver(()=>ensureCategorySelect());
  const root=document.getElementById('app');if(root)observer.observe(root,{childList:true,subtree:true});
  window.addEventListener('pendientes:v80-updated',()=>migrateFloorRows({render:true}));
  window.addEventListener('pageshow',()=>migrateFloorRows({render:true}));
  migrateFloorRows({render:true});ensureCategorySelect();
  document.documentElement.dataset.pendientesManualBuild='94';
})();
