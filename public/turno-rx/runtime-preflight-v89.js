(() => {
  // Pendientes v91 — arranque tolerante a fallos de Storage en iPhone/PWA instalada.
  const STORAGE_KEY='pendientes-table-v2';
  const SHIFT_KEY='pendientes-shift-v1';
  const HISTORY_KEY='pendientes-shift-history-v1';
  const DB_NAME='pendientes-boleta-images-v1';
  const IMAGE_STORE='images';
  const BOOT_SAFE_KEYS=new Set([STORAGE_KEY,SHIFT_KEY,HISTORY_KEY]);
  const GUARDED_MANUAL_FIELDS=[
    'category','modality','diagnosis','diagnosisMeaning',
    'oxygenProbable','oxygenReason','destination','destinationFloor','destinationBlock'
  ];

  const clean=value=>String(value??'').trim();
  const parse=(raw,fallback)=>{try{const value=JSON.parse(raw||'');return value??fallback}catch{return fallback}};
  let bootPhase=true;

  try{
    if(typeof document==='undefined')bootPhase=false;
    else if(document.readyState&&document.readyState!=='loading')bootPhase=false;
    else if(typeof document.addEventListener==='function')document.addEventListener('DOMContentLoaded',()=>{bootPhase=false},{once:true});
  }catch{}

  function isLocalStorage(storage){
    try{return storage===globalThis.localStorage}catch{return false}
  }
  function rememberBootStorageError(key,error){
    try{
      globalThis.__PENDIENTES_BOOT_STORAGE_ERROR__={key:String(key),name:clean(error?.name)||'StorageError',message:clean(error?.message)};
      if(typeof document!=='undefined'&&document.documentElement)document.documentElement.dataset.pendientesBootStorageError='1';
    }catch{}
    console.warn('[Pendientes v91] Persistencia no disponible durante arranque; se continúa sin borrar datos',error);
  }

  // app-v16 todavía normaliza y persiste shift/rows antes del primer render. En iOS,
  // QuotaExceededError o un fallo transitorio de Storage no debe dejar la PWA en blanco.
  // Solo durante la fase de arranque se absorben errores de escritura de las claves de
  // Pendientes; después de DOMContentLoaded los errores vuelven a propagarse normalmente.
  try{
    if(typeof Storage!=='undefined'&&!Storage.prototype.__pendientesV89Guard){
      const previousSetItem=Storage.prototype.setItem;
      const nativeSet=(storage,key,value)=>{
        try{return previousSetItem.call(storage,key,value)}
        catch(error){
          if(bootPhase&&isLocalStorage(storage)&&BOOT_SAFE_KEYS.has(String(key))){rememberBootStorageError(key,error);return undefined}
          throw error;
        }
      };

      Storage.prototype.setItem=function pendientesV91SetItem(key,value){
        const isLocal=isLocalStorage(this);
        if(isLocal&&key===STORAGE_KEY&&globalThis.__PENDIENTES_MANUAL_WRITE__!==true){
          try{
            const incoming=parse(value,null),previous=parse(this.getItem(STORAGE_KEY),[]);
            if(Array.isArray(incoming)&&Array.isArray(previous)){
              const byId=new Map(previous.filter(row=>row?.id).map(row=>[String(row.id),row]));
              const protectedRows=incoming.map(row=>{
                const before=row?.id?byId.get(String(row.id)):null;
                if(!before)return row;
                const manual={...(before.manualOverrides||{}),...(row.manualOverrides||{})};
                let next=row;
                let touched=false;
                for(const field of GUARDED_MANUAL_FIELDS){
                  if(before.manualOverrides?.[field]===true){
                    if(!touched){next={...row};touched=true}
                    next[field]=before[field];
                  }
                }
                if(Object.keys(manual).length){
                  if(!touched)next={...row};
                  next.manualOverrides=manual;
                }
                return next;
              });
              return nativeSet(this,key,JSON.stringify(protectedRows));
            }
          }catch(error){console.warn('[Pendientes v91] Guardia manual omitida sin bloquear arranque',error)}
        }
        return nativeSet(this,key,value);
      };
      try{Object.defineProperty(Storage.prototype,'__pendientesV89Guard',{value:true,configurable:true})}catch{}
    }
  }catch(error){console.warn('[Pendientes v91] Storage guard no disponible; se continúa',error)}

  try{
    if(typeof IDBObjectStore!=='undefined'&&!IDBObjectStore.prototype.__pendientesV89PutCompat){
      const nativePut=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function pendientesV91Put(value,key){
        try{
          const dbName=this.transaction?.db?.name;
          const keyless=this.keyPath===null||this.keyPath===undefined||clean(this.keyPath)==='';
          if(dbName===DB_NAME&&this.name===IMAGE_STORE&&keyless&&arguments.length===1&&clean(value?.fp)){
            return nativePut.call(this,value,clean(value.fp));
          }
        }catch(error){console.warn('[Pendientes v91] Compatibilidad de boleta omitida',error)}
        return arguments.length>1?nativePut.call(this,value,key):nativePut.call(this,value);
      };
      try{Object.defineProperty(IDBObjectStore.prototype,'__pendientesV89PutCompat',{value:true,configurable:true})}catch{}
    }
  }catch(error){console.warn('[Pendientes v91] IndexedDB guard no disponible; se continúa',error)}

  try{if(typeof document!=='undefined'&&document.documentElement)document.documentElement.dataset.pendientesPreflightBuild='91'}catch{}
})();
