(() => {
  const STORAGE_KEY='pendientes-table-v2';
  const HISTORY_KEY='pendientes-shift-history-v1';
  const nativeGetItem=Storage.prototype.getItem;
  const nativeSetItem=Storage.prototype.setItem;

  const clean=(value)=>String(value??'').trim();
  const plain=(value)=>clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const parse=(raw,fallback)=>{try{const value=JSON.parse(raw||'');return value??fallback}catch{return fallback}};
  const historyKey=(entry)=>String(entry?.shift?.id||entry?.shift?.startedAt||entry?.archivedAt||'');
  const hasValue=(row,field)=>{
    if(field==='bed')return Boolean(clean(row?.bed));
    if(field==='name')return Boolean(clean(row?.name));
    if(field==='age')return row?.age!==null&&row?.age!==undefined&&row?.age!=='';
    if(field==='sex')return !['','no visible'].includes(plain(row?.sex));
    if(field==='target')return Boolean(clean(row?.target||row?.destination));
    return Boolean(clean(row?.[field]));
  };
  const fieldValue=(row,field)=>field==='target'?clean(row?.target||row?.destination):clean(row?.[field]);

  function preserveHistory(incoming){
    if(!Array.isArray(incoming))return incoming;
    const current=parse(nativeGetItem.call(localStorage,HISTORY_KEY),[]);
    if(!Array.isArray(current)||!current.length)return incoming;
    const seen=new Set(incoming.map(historyKey).filter(Boolean));
    const merged=[...incoming];
    for(const entry of current){
      const key=historyKey(entry);
      if(key&&seen.has(key))continue;
      merged.push(entry);
      if(key)seen.add(key);
    }
    return merged;
  }

  function clearResolvedReview(incoming){
    if(!Array.isArray(incoming))return incoming;
    const previous=parse(nativeGetItem.call(localStorage,STORAGE_KEY),[]);
    const byId=new Map((Array.isArray(previous)?previous:[]).filter(row=>row?.id).map(row=>[String(row.id),row]));
    return incoming.map(row=>{
      if(!row?.id||!row?.needsReview||!Array.isArray(row?.reviewFields)||!row.reviewFields.length)return row;
      const before=byId.get(String(row.id));
      if(!before)return row;
      const manual=row.manualOverrides||{};
      const remaining=row.reviewFields.filter(field=>{
        if(!hasValue(row,field))return true;
        if(manual[field]===true)return false;
        if(!Array.isArray(before.reviewFields)||!before.reviewFields.includes(field))return true;
        return fieldValue(before,field)===fieldValue(row,field);
      });
      if(remaining.length===row.reviewFields.length)return row;
      return {...row,needsReview:remaining.length>0,reviewFields:remaining};
    });
  }

  Storage.prototype.setItem=function guardedSetItem(key,value){
    if(this!==localStorage)return nativeSetItem.call(this,key,value);
    try{
      if(key===HISTORY_KEY){
        const incoming=parse(value,null);
        if(Array.isArray(incoming))return nativeSetItem.call(this,key,JSON.stringify(preserveHistory(incoming)));
      }
      if(key===STORAGE_KEY){
        const incoming=parse(value,null);
        if(Array.isArray(incoming))return nativeSetItem.call(this,key,JSON.stringify(clearResolvedReview(incoming)));
      }
    }catch{}
    return nativeSetItem.call(this,key,value);
  };
})();
