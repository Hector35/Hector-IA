(() => {
  const STORAGE_KEY='pendientes-table-v2';
  const priorSetItem=Storage.prototype.setItem;
  const nativeGetItem=Storage.prototype.getItem;

  const clean=value=>String(value??'').trim();
  const parse=(raw,fallback)=>{try{const value=JSON.parse(raw||'');return value??fallback}catch{return fallback}};
  const rowKey=row=>String(row?.id??'');
  const stableComparable=row=>JSON.stringify({
    bed:row?.bed??'',name:row?.name??'',age:row?.age??null,sex:row?.sex??'',category:row?.category??'',
    target:row?.target??'',destination:row?.destination??'',diagnosis:row?.diagnosis??'',transport:row?.transport??'',
    oxygenProbable:Boolean(row?.oxygenProbable),status:row?.status??'',updatedAt:row?.updatedAt??''
  });

  function fingerprints(row){
    const values=[...(Array.isArray(row?.imageFingerprints)?row.imageFingerprints:[]),row?.imageFingerprint]
      .map(clean).filter(Boolean);
    return [...new Set(values)];
  }

  function preserveFingerprintHistory(incoming){
    if(!Array.isArray(incoming))return incoming;
    const previous=parse(nativeGetItem.call(localStorage,STORAGE_KEY),[]);
    const byId=new Map((Array.isArray(previous)?previous:[]).filter(row=>rowKey(row)).map(row=>[rowKey(row),row]));
    const pending=window.__pendientesVisionFingerprintV70;
    const pendingFingerprint=pending&&pending.expires>Date.now()?clean(pending.fingerprint):'';
    let consumed=false;

    const next=incoming.map(row=>{
      const before=byId.get(rowKey(row));
      const changed=!before||stableComparable(before)!==stableComparable(row);
      const history=[...fingerprints(before),...fingerprints(row)];
      if(changed&&pendingFingerprint){history.push(pendingFingerprint);consumed=true;}
      const unique=[...new Set(history.filter(Boolean))];
      if(!unique.length)return row;
      const latest=changed&&pendingFingerprint?pendingFingerprint:(clean(row?.imageFingerprint)||unique.at(-1));
      return {...row,imageFingerprint:latest,imageFingerprints:unique};
    });

    if(pendingFingerprint&&(consumed||incoming.length===0||incoming.every(row=>{
      const before=byId.get(rowKey(row));
      return before&&stableComparable(before)===stableComparable(row);
    }))) window.__pendientesVisionFingerprintV70=null;

    return next;
  }

  Storage.prototype.setItem=function fingerprintHistorySetItem(key,value){
    if(this===localStorage&&key===STORAGE_KEY){
      try{
        const incoming=parse(value,null);
        if(Array.isArray(incoming))return priorSetItem.call(this,key,JSON.stringify(preserveFingerprintHistory(incoming)));
      }catch{}
    }
    return priorSetItem.call(this,key,value);
  };

  window.__pendientesFingerprintHistoryV70={preserveFingerprintHistory,fingerprints};
})();