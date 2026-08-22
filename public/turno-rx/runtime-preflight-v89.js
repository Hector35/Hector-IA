(() => {
  // Pendientes v89 — preflight de coherencia antes de cargar los runtimes operativos.
  const STORAGE_KEY='pendientes-table-v2';
  const DB_NAME='pendientes-boleta-images-v1';
  const IMAGE_STORE='images';
  const GUARDED_MANUAL_FIELDS=[
    'category','modality','diagnosis','diagnosisMeaning',
    'oxygenProbable','oxygenReason','destination','destinationFloor','destinationBlock'
  ];

  const clean=value=>String(value??'').trim();
  const plain=value=>clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const parse=(raw,fallback)=>{try{const value=JSON.parse(raw||'');return value??fallback}catch{return fallback}};

  function pisoDestination(value){
    const text=clean(value).toUpperCase().replace(/\s+/g,' ');
    const match=text.match(/^(?:CAMA(?: DE PISO)?\s*)?#?\s*(\d{1,3})$/);
    if(!match)return null;
    const n=Number(match[1]);
    if(n>=1&&n<=44)return{floor:'Primero',block:'B'};
    if(n<=88)return{floor:'Segundo',block:'B'};
    if(n<=132)return{floor:'Tercero',block:'B'};
    if(n<=165)return{floor:'Segundo',block:'A'};
    if(n<=198)return{floor:'Tercero',block:'A'};
    if(n<=231)return{floor:'Quinto',block:'A'};
    return null;
  }

  // Repair legacy rows before app-v16 performs its first render. The old fallback
  // grouped 166-189 and 190-204; authoritative Clínica 7 ranges are 166-198 and
  // 199-231. Skip any field the user explicitly corrected manually.
  try{
    const current=parse(localStorage?.getItem?.(STORAGE_KEY),null);
    if(Array.isArray(current)){
      let changed=false;
      const repaired=current.map(row=>{
        const category=plain(row?.category),candidate=clean(row?.destination||row?.target);
        const mapped=pisoDestination(candidate);
        const legacyFloor=!category&&Boolean(mapped);
        if(!mapped||(!legacyFloor&&category!=='piso'))return row;
        const overrides=row?.manualOverrides||{};
        let next=row;
        if(overrides.destinationFloor!==true&&clean(row?.destinationFloor)!==mapped.floor){next={...next,destinationFloor:mapped.floor};changed=true}
        if(overrides.destinationBlock!==true&&clean(row?.destinationBlock).toUpperCase()!==mapped.block){next={...next,destinationBlock:mapped.block};changed=true}
        if(category==='piso'&&!clean(row?.destination)){next={...next,destination:candidate};changed=true}
        return next;
      });
      if(changed)localStorage.setItem(STORAGE_KEY,JSON.stringify(repaired));
    }
  }catch(error){console.warn('[Pendientes v89] No se pudo normalizar Piso antes del primer render',error)}

  // Capture/reconciliation may revisit a row after the user corrected it manually.
  // Preserve the extra fields that capture-fix does not protect itself. Manual form
  // writes explicitly opt out through __PENDIENTES_MANUAL_WRITE__ so a user can
  // still change or clear a previous manual correction.
  if(typeof Storage!=='undefined'&&!Storage.prototype.__pendientesV89Guard){
    const previousSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function pendientesV89SetItem(key,value){
      if(this===localStorage&&key===STORAGE_KEY&&globalThis.__PENDIENTES_MANUAL_WRITE__!==true){
        try{
          const incoming=parse(value,null),previous=parse(this.getItem(STORAGE_KEY),[]);
          if(Array.isArray(incoming)&&Array.isArray(previous)){
            const byId=new Map(previous.filter(row=>row?.id).map(row=>[String(row.id),row]));
            const protectedRows=incoming.map(row=>{
              const before=row?.id?byId.get(String(row.id)):null;
              if(!before)return row;
              const manual={...(before.manualOverrides||{}),...(row.manualOverrides||{})};
              let next={...row,manualOverrides:manual};
              for(const field of GUARDED_MANUAL_FIELDS){
                if(before.manualOverrides?.[field]===true)next[field]=before[field];
              }
              return next;
            });
            return previousSetItem.call(this,key,JSON.stringify(protectedRows));
          }
        }catch(error){console.warn('[Pendientes v89] No se pudo aplicar guardia manual',error)}
      }
      return previousSetItem.call(this,key,value);
    };
    Object.defineProperty(Storage.prototype,'__pendientesV89Guard',{value:true,configurable:true});
  }

  // v87 detail/history could create the image store without keyPath. Existing
  // installations with that schema throw DataError when capture-fix calls put()
  // without an explicit key. Keep those databases usable without deleting photos.
  if(typeof IDBObjectStore!=='undefined'&&!IDBObjectStore.prototype.__pendientesV89PutCompat){
    const nativePut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function pendientesV89Put(value,key){
      const dbName=this.transaction?.db?.name;
      const keyless=this.keyPath===null||this.keyPath===undefined||clean(this.keyPath)==='';
      if(dbName===DB_NAME&&this.name===IMAGE_STORE&&keyless&&arguments.length===1&&clean(value?.fp)){
        return nativePut.call(this,value,clean(value.fp));
      }
      return arguments.length>1?nativePut.call(this,value,key):nativePut.call(this,value);
    };
    Object.defineProperty(IDBObjectStore.prototype,'__pendientesV89PutCompat',{value:true,configurable:true});
  }

  document.documentElement.dataset.pendientesPreflightBuild='89';
})();
