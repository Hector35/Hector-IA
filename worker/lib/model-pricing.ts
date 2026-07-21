export type PricingUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number}};
export type ModelPricing={family:string;inputPerMTok:number;cachedInputPerMTok:number;outputPerMTok:number;cacheWriteMultiplier:number;longContextThreshold?:number;longInputMultiplier?:number;longOutputMultiplier?:number;known:boolean;source:string};

const GPT_56_COMMON={cacheWriteMultiplier:1.25,longContextThreshold:272_000,longInputMultiplier:2,longOutputMultiplier:1.5,known:true,source:'openai-pricing-2026-07'} as const;
const LEGACY_FALLBACK:ModelPricing={family:'unknown',inputPerMTok:.75,cachedInputPerMTok:.075,outputPerMTok:4.5,cacheWriteMultiplier:1,known:false,source:'legacy-fallback'};

export function pricingForModel(model:string|undefined):ModelPricing{
 const id=(model||'').toLowerCase();
 if(id==='gpt-5.6'||id.startsWith('gpt-5.6-sol'))return{family:'gpt-5.6-sol',inputPerMTok:5,cachedInputPerMTok:.5,outputPerMTok:30,...GPT_56_COMMON};
 if(id.startsWith('gpt-5.6-terra'))return{family:'gpt-5.6-terra',inputPerMTok:2.5,cachedInputPerMTok:.25,outputPerMTok:15,...GPT_56_COMMON};
 if(id.startsWith('gpt-5.6-luna'))return{family:'gpt-5.6-luna',inputPerMTok:1,cachedInputPerMTok:.1,outputPerMTok:6,...GPT_56_COMMON};
 return{...LEGACY_FALLBACK,family:id||'unknown'};
}

export function estimateModelCost(usage:PricingUsage|undefined,model?:string){
 const input=Math.max(0,Number(usage?.input_tokens||0)),output=Math.max(0,Number(usage?.output_tokens||0));
 const cached=Math.min(input,Math.max(0,Number(usage?.input_tokens_details?.cached_tokens||0)));
 const cacheWrite=Math.min(Math.max(0,input-cached),Math.max(0,Number(usage?.input_tokens_details?.cache_write_tokens||0)));
 const uncached=Math.max(0,input-cached-cacheWrite),pricing=pricingForModel(model);
 const longContext=Boolean(pricing.longContextThreshold&&input>pricing.longContextThreshold);
 const inputMultiplier=longContext?(pricing.longInputMultiplier||1):1,outputMultiplier=longContext?(pricing.longOutputMultiplier||1):1;
 const inputCost=(uncached*pricing.inputPerMTok+cached*pricing.cachedInputPerMTok+cacheWrite*pricing.inputPerMTok*pricing.cacheWriteMultiplier)*inputMultiplier/1_000_000;
 const outputCost=output*pricing.outputPerMTok*outputMultiplier/1_000_000;
 return{input,cached,cacheWrite,output,costUsd:inputCost+outputCost,pricingModel:pricing.family,pricingKnown:pricing.known,pricingSource:pricing.source,longContext};
}
