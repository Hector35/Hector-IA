(() => {
  // Pendientes v90 — preflight seguro: nunca migra datos antes del primer render.
  const STORAGE_KEY='pendientes-table-v2';
  const DB_NAME='pendientes-boleta-images-v1';
  const IMAGE_STORE='images';
  const GUARDED_MANUAL_FIELDS=[
    'category','modality','diagnosis','diagnosisMeaning',
    'oxygenProbable','oxygenReason','destination','destinationFloor','destinationBlock'
  ];

  const clean=value=>String(value??'').trim();
  const parse=(raw,fallback)=>{try{const value=JSON.parse(raw||'');return value??fallback}catch{return fallback}};

  // Important: no read-modify-write migration is allowed here. This file runs before
  // app-v16 paints the first screen. Any migration failure, quota error or iOS storage
  // edge case must not be able to prevent Pendientes from opening.

  try{
    if(typeof Storage!=='undefined'&&!Storage.prototype.__pendientesV89Guard){
      const previousSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function pendientesV90SetItem(key,value){
        let isLocal=false;
        try{isLocal=this===globalThis.localStorage}catch{}
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
              return previousSetItem.call(this,key,JSON.stringify(protectedRows));
            }
          }catch(error){console.warn('[Pendientes v90] Guardia manual omitida sin bloquear arranque',error)}
        }
        return previousSetItem.call(this,key,value);
      };
      try{Object.defineProperty(Storage.prototype,'__pendientesV89Guard',{value:true,configurable:true})}catch{}
    }
  }catch(error){console.warn('[Pendientes v90] Storage guard no disponible; se continúa',error)}

  try{
    if(typeof IDBObjectStore!=='undefined'&&!IDBObjectStore.prototype.__pendientesV89PutCompat){
      const nativePut=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function pendientesV90Put(value,key){
        try{
          const dbName=this.transaction?.db?.name;
          const keyless=this.keyPath===null||this.keyPath===undefined||clean(this.keyPath)==='';
          if(dbName===DB_NAME&&this.name===IMAGE_STORE&&keyless&&arguments.length===1&&clean(value?.fp)){
            return nativePut.call(this,value,clean(value.fp));
          }
        }catch(error){console.warn('[Pendientes v90] Compatibilidad de boleta omitida',error)}
        return arguments.length>1?nativePut.call(this,value,key):nativePut.call(this,value);
      };
      try{Object.defineProperty(IDBObjectStore.prototype,'__pendientesV89PutCompat',{value:true,configurable:true})}catch{}
    }
  }catch(error){console.warn('[Pendientes v90] IndexedDB guard no disponible; se continúa',error)}

  try{if(typeof document!=='undefined'&&document.documentElement)document.documentElement.dataset.pendientesPreflightBuild='90'}catch{}
})();
