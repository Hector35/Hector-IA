export type QualityProviderName='cloudflare'|'huggingface'|'openai';
export type ProviderQualityAssessment={accepted:boolean;score:number;reasons:string[]};
export type ProviderQualityRow={accepted:number|boolean;fallback:number|boolean;latency_ms:number|null;created_at?:string|null};
export type ProviderHealth={sampleCount:number;acceptedRate:number;fallbackRate:number;averageLatencyMs:number|null;healthy:boolean;circuitOpen:boolean;reason:string;mostRecentAt:string|null};
export type ProviderQualityEvent={requestedProvider:QualityProviderName;actualProvider:QualityProviderName;model:string;routeTier:'fast'|'balanced'|'deep';task:string;accepted:boolean;score:number;fallback:boolean;latencyMs:number;reasons:string[]};

export const PROVIDER_HEALTH_POLICY={windowHours:24,sampleLimit:30,minSamples:8,minAcceptedRate:.75,maxFallbackRate:.35,cooldownMinutes:30};

const normalize=(value:string)=>value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

function repetitionPenalty(text:string){
 const tokens=normalize(text).match(/[a-z0-9]{2,}/g)||[];
 if(tokens.length<30)return 0;
 const unique=new Set(tokens).size/tokens.length;
 if(unique<.14)return 55;
 if(unique<.2)return 30;
 const sentences=text.split(/[.!?\n]+/).map(x=>normalize(x)).filter(x=>x.length>12);
 if(sentences.length>=3){const counts=new Map<string,number>();for(const sentence of sentences)counts.set(sentence,(counts.get(sentence)||0)+1);if(Math.max(...counts.values())>=3)return 45;}
 return 0;
}

export function assessProviderResponse(input:string,text:string):ProviderQualityAssessment{
 const value=text.trim(),reasons:string[]=[];
 if(!value)return{accepted:false,score:0,reasons:['respuesta vacía']};
 let score=100;
 if(value.length<2){score-=90;reasons.push('respuesta demasiado corta');}
 if(/<!doctype|<html|internal server error|bad gateway|service unavailable|cloudflare error/i.test(value)){score-=100;reasons.push('parece una página o error de infraestructura');}
 if(/no pude generar una respuesta|workers ai devolvi[oó] una respuesta vac[ií]a|error del proveedor de ia/i.test(value)){score-=100;reasons.push('marcador de fallo del proveedor');}
 const repetition=repetitionPenalty(value);if(repetition){score-=repetition;reasons.push('repetición excesiva');}
 if(input.trim().length>120&&value.length<40){score-=45;reasons.push('respuesta insuficiente para una solicitud extensa');}
 if(/\d+(?:[.,]\d+)?\s*[+\-*/×÷]\s*\d+(?:[.,]\d+)?/.test(input)&&!/[\d]/.test(value)){score-=55;reasons.push('faltó un resultado numérico solicitado');}
 if(/\b(resume|resumen|explica|compara|analiza)\b/i.test(input)&&value.length<24){score-=35;reasons.push('respuesta insuficiente para la operación solicitada');}
 const bounded=Math.max(0,Math.min(100,score));
 return{accepted:bounded>=60,score:bounded,reasons};
}

function timestamp(value:string|null|undefined){if(!value)return null;const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`;const time=Date.parse(normalized);return Number.isFinite(time)?time:null;}

export function summarizeProviderHealth(rows:ProviderQualityRow[],now=Date.now()):ProviderHealth{
 const sampleCount=rows.length;
 const accepted=rows.filter(row=>!!Number(row.accepted)).length;
 const fallbacks=rows.filter(row=>!!Number(row.fallback)).length;
 const latencies=rows.map(row=>Number(row.latency_ms)).filter(value=>Number.isFinite(value)&&value>=0);
 const acceptedRate=sampleCount?accepted/sampleCount:1;
 const fallbackRate=sampleCount?fallbacks/sampleCount:0;
 const averageLatencyMs=latencies.length?Math.round(latencies.reduce((sum,value)=>sum+value,0)/latencies.length):null;
 const mostRecentAt=rows[0]?.created_at||null;
 const recentTime=timestamp(mostRecentAt);
 const cooledDown=recentTime===null||now-recentTime>=PROVIDER_HEALTH_POLICY.cooldownMinutes*60_000;
 const statisticallyUnhealthy=sampleCount>=PROVIDER_HEALTH_POLICY.minSamples&&(acceptedRate<PROVIDER_HEALTH_POLICY.minAcceptedRate||fallbackRate>PROVIDER_HEALTH_POLICY.maxFallbackRate);
 const circuitOpen=statisticallyUnhealthy&&!cooledDown;
 const healthy=!circuitOpen;
 const reason=sampleCount<PROVIDER_HEALTH_POLICY.minSamples?'muestras insuficientes; exploración controlada':!statisticallyUnhealthy?'calidad reciente dentro de umbrales':cooledDown?'enfriamiento completado; se permite una prueba controlada':'circuito abierto por calidad o fallback';
 return{sampleCount,acceptedRate,fallbackRate,averageLatencyMs,healthy,circuitOpen,reason,mostRecentAt};
}

export async function loadCloudflareHealth(db:D1Database):Promise<ProviderHealth>{
 try{
  const result=await db.prepare(`SELECT accepted,fallback,latency_ms,created_at FROM provider_quality_events
   WHERE requested_provider='cloudflare' AND created_at>=datetime('now',?)
   ORDER BY created_at DESC LIMIT ?`).bind(`-${PROVIDER_HEALTH_POLICY.windowHours} hours`,PROVIDER_HEALTH_POLICY.sampleLimit).all<ProviderQualityRow>();
  return summarizeProviderHealth(result.results||[]);
 }catch{return summarizeProviderHealth([]);}
}

export async function recordProviderQuality(db:D1Database,event:ProviderQualityEvent){
 try{
  await db.prepare(`INSERT INTO provider_quality_events(id,requested_provider,actual_provider,model,route_tier,task,accepted,score,fallback,latency_ms,reasons_json)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),event.requestedProvider,event.actualProvider,event.model,event.routeTier,event.task,+event.accepted,Math.max(0,Math.min(100,Math.round(event.score))),+event.fallback,Math.max(0,Math.round(event.latencyMs)),JSON.stringify(event.reasons.slice(0,12))).run();
 }catch{}
}
