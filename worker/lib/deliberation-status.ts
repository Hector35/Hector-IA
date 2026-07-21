export type DeliberationUsageRow={
 service?:string|null;
 model?:string|null;
 estimated_cost_usd?:number|string|null;
 metadata_json?:string|null;
 created_at?:string|null;
};

type CognitiveMetadata={
 cognitiveMode?:string;
 deliberationPasses?:number;
 deliberationReason?:string;
};

function parseMetadata(value:string|null|undefined):CognitiveMetadata{
 if(!value)return{};
 try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'?parsed:{}}catch{return{}};
}
function timestamp(value:string|null|undefined){
 if(!value)return 0;
 const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`;
 const time=Date.parse(normalized);return Number.isFinite(time)?time:0;
}
function money(value:number){return Math.round(value*1_000_000)/1_000_000;}

export function aggregateDeliberationStatus(rows:DeliberationUsageRow[],now=Date.now()){
 const dayAgo=now-24*60*60*1000;
 const records=rows.flatMap(row=>{
  const metadata=parseMetadata(row.metadata_json),mode=typeof metadata.cognitiveMode==='string'?metadata.cognitiveMode:'';
  if(!mode)return[];
  const passes=Number.isFinite(metadata.deliberationPasses)?Math.max(1,Number(metadata.deliberationPasses)):1;
  const cost=Number(row.estimated_cost_usd)||0;
  return[{mode,passes,reason:typeof metadata.deliberationReason==='string'?metadata.deliberationReason:'',cost,createdAt:row.created_at||null,time:timestamp(row.created_at),service:row.service||null,model:row.model||null}];
 });
 const recent=records.filter(item=>item.time>=dayAgo),ensemble=records.filter(item=>item.mode.startsWith('ensemble')),degraded=records.filter(item=>item.mode==='ensemble-degraded');
 const ensembleRecent=recent.filter(item=>item.mode.startsWith('ensemble'));
 const degradationRate=ensemble.length?degraded.length/ensemble.length:0;
 const health=ensemble.length===0?'idle':degradationRate>.5?'degraded':degradationRate>.2?'watch':'healthy';
 const last=records[0];
 return{
  calls30d:records.length,
  calls24h:recent.length,
  ensemble30d:ensemble.length,
  ensemble24h:ensembleRecent.length,
  single30d:records.filter(item=>item.mode==='single').length,
  degraded30d:degraded.length,
  degradationRatePercent:Math.round(degradationRate*100),
  averagePasses:records.length?Math.round(records.reduce((sum,item)=>sum+item.passes,0)/records.length*10)/10:0,
  estimatedCostUsd30d:money(records.reduce((sum,item)=>sum+item.cost,0)),
  estimatedCostUsd24h:money(recent.reduce((sum,item)=>sum+item.cost,0)),
  last:last?{mode:last.mode,passes:last.passes,reason:last.reason,createdAt:last.createdAt,service:last.service,model:last.model}:null,
  health,
  contentStored:false,
  sampleLimit:500,
  truncated:rows.length>=500
 };
}
