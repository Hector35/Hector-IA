(() => {
  const STORAGE_KEY='pendientes-table-v2';
  const priorSetItem=Storage.prototype.setItem;
  const nativeGetItem=Storage.prototype.getItem;
  const originalFetch=window.fetch.bind(window);
  let hints=[];

  const clean=v=>String(v??'').trim();
  const plain=v=>clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const parse=v=>{if(v&&typeof v==='object')return v;const s=clean(v),f=s.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()||s;try{return JSON.parse(f)}catch{const a=f.indexOf('{'),b=f.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(f.slice(a,b+1))}catch{}}return null}};
  const bed=v=>plain(v).replace(/^cama /,'').replace(/^c /,'').replace(/\s+/g,'');
  const category=p=>{const c=plain(p?.category),m=plain(p?.modality),t=plain(p?.target||p?.study||p?.destination);if(c==='piso')return'Piso';if(c==='tac'||m==='tac'||/\b(tac|tc|tomografia|angiotac)\b/.test(t))return'TAC';if(c==='usg'||c==='ultrasonido'||m==='ultrasonido'||/\b(usg|ultrasonido|ecografia)\b/.test(t))return'USG';return'RX'};
  const hasValue=(row,field)=>field==='bed'?Boolean(clean(row?.bed)):field==='name'?Boolean(clean(row?.name)):field==='age'?row?.age!==null&&row?.age!==undefined&&row?.age!=='':field==='sex'?!['','no visible'].includes(plain(row?.sex)):field==='target'?Boolean(clean(row?.target||row?.destination)):Boolean(clean(row?.[field]));
  const comparable=(row,field)=>field==='target'?clean(row?.target||row?.destination):field==='age'?String(row?.age??''):field==='oxygenProbable'?String(Boolean(row?.oxygenProbable)):clean(row?.[field]);
  const UPDATE_FIELDS=['bed','name','age','sex','target','destination','diagnosis','diagnosisMeaning','transport','oxygenProbable','updatedAt','imageFingerprint'];

  function captureHints(data){
    const payload=parse(data?.text??data?.answer??data?.output_text??data);if(!payload)return;
    const patients=Array.isArray(payload?.patients)?payload.patients:[payload];
    const now=Date.now();
    hints=patients.map(p=>({
      category:category(p),
      bed:bed(p?.handwrittenBed||p?.formBed||p?.bed),
      name:plain(p?.name),
      target:plain(p?.target||p?.study||p?.destination),
      high:new Set(Object.entries(p?.confidence||{}).filter(([,v])=>plain(v)==='high').map(([k])=>k)),
      expires:now+60000
    })).filter(h=>h.high.size);
  }

  function bestHint(row){
    const now=Date.now();hints=hints.filter(h=>h.expires>now);
    const rc=category(row),rb=bed(row?.bed),rn=plain(row?.name),rt=plain(row?.target||row?.destination);
    let best=null,bestScore=0;
    for(const h of hints){if(h.category!==rc)continue;let score=0;if(rb&&h.bed&&rb===h.bed)score+=4;if(rn&&h.name&&rn===h.name)score+=4;if(rt&&h.target&&rt===h.target)score+=2;if(score>bestScore){best=h;bestScore=score}}
    return bestScore>=4?best:null;
  }

  function rowWasUpdated(before,row){
    if(!before||!row)return false;
    return UPDATE_FIELDS.some(field=>comparable(before,field)!==comparable(row,field));
  }

  function resolveConfirmedReview(incoming){
    if(!Array.isArray(incoming))return incoming;
    const before=parse(nativeGetItem.call(localStorage,STORAGE_KEY))||[];
    const previous=new Map((Array.isArray(before)?before:[]).filter(r=>r?.id).map(r=>[String(r.id),r]));
    return incoming.map(row=>{
      if(!row?.id||!row?.needsReview||!Array.isArray(row.reviewFields)||!row.reviewFields.length||!previous.has(String(row.id)))return row;
      const prior=previous.get(String(row.id));
      if(!rowWasUpdated(prior,row))return row;
      const hint=bestHint(row);if(!hint)return row;
      const remaining=row.reviewFields.filter(field=>!(hint.high.has(field)&&hasValue(row,field)));
      return remaining.length===row.reviewFields.length?row:{...row,needsReview:remaining.length>0,reviewFields:remaining};
    });
  }

  Storage.prototype.setItem=function v67SetItem(key,value){
    if(this===localStorage&&key===STORAGE_KEY){
      try{const incoming=parse(value);if(Array.isArray(incoming))return priorSetItem.call(this,key,JSON.stringify(resolveConfirmedReview(incoming)))}catch{}
    }
    return priorSetItem.call(this,key,value);
  };

  window.fetch=async function v67Fetch(input,init){
    const response=await originalFetch(input,init);const url=typeof input==='string'?input:input?.url;
    if(typeof url!=='string'||!url.includes('/api/turno-rx/vision')||!response?.ok||typeof response.json!=='function')return response;
    const upstream=response.json.bind(response);
    try{Object.defineProperty(response,'json',{configurable:true,value:async(...args)=>{const data=await upstream(...args);captureHints(data);return data}})}catch{}
    return response;
  };

  window.__pendientesReviewConfidenceV67={resolveConfirmedReview,captureHints,rowWasUpdated};
})();