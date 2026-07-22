export type FreeCapability='rules'|'retrieval'|'embedding'|'classification'|'extraction'|'summarization'|'generation'|'verification'|'storage'|'sandbox';
export type ResourceTier='deterministic'|'browser-local'|'cloudflare-free'|'github-free'|'paid-fallback';

export type FreeResourceDecision={
 id:string;
 tier:ResourceTier;
 capabilities:FreeCapability[];
 recurringCostUsd:number;
 privacy:'local'|'first-party-cloud'|'third-party-cloud';
 license:string;
 enabledByDefault:boolean;
 constraints:string[];
};

export const FREE_RESOURCE_REGISTRY:readonly FreeResourceDecision[]=[
 {id:'typescript-rules',tier:'deterministic',capabilities:['rules','classification','extraction','verification'],recurringCostUsd:0,privacy:'local',license:'project',enabledByDefault:true,constraints:['Only deterministic, testable transformations']},
 {id:'d1-hybrid-retrieval',tier:'cloudflare-free',capabilities:['retrieval','storage'],recurringCostUsd:0,privacy:'first-party-cloud',license:'Cloudflare service terms',enabledByDefault:true,constraints:['Stay inside current D1 free limits','Use indexed queries and bounded candidate sets']},
 {id:'r2-artifact-store',tier:'cloudflare-free',capabilities:['storage'],recurringCostUsd:0,privacy:'first-party-cloud',license:'Cloudflare service terms',enabledByDefault:true,constraints:['Standard storage only for free allocation','Store large immutable artifacts, not hot metadata']},
 {id:'workers-ai-free',tier:'cloudflare-free',capabilities:['embedding','classification','extraction','summarization','generation'],recurringCostUsd:0,privacy:'first-party-cloud',license:'Model-specific license plus Cloudflare terms',enabledByDefault:false,constraints:['Daily free allocation is finite','Model license must be allow-listed','Never be required for core deterministic flows']},
 {id:'transformers-js-browser',tier:'browser-local',capabilities:['embedding','classification','extraction','summarization'],recurringCostUsd:0,privacy:'local',license:'Apache-2.0 runtime; model-specific license',enabledByDefault:false,constraints:['Feature-detect WebGPU and WASM','Lazy-load models','Respect iPhone memory and battery limits','No background assumption on iOS']},
 {id:'github-actions-public',tier:'github-free',capabilities:['verification','sandbox'],recurringCostUsd:0,privacy:'third-party-cloud',license:'GitHub terms; action-specific licenses',enabledByDefault:true,constraints:['Public repository standard runners only','Pin third-party actions to immutable commit SHAs']}
] as const;

export type FreeFirstRequest={capability:FreeCapability;allowBrowserLocal?:boolean;allowCloudflareAi?:boolean;requiresPrivateLocalExecution?:boolean};

export function selectFreeResource(input:FreeFirstRequest){
 return FREE_RESOURCE_REGISTRY.find(resource=>
  resource.capabilities.includes(input.capability)&&
  resource.enabledByDefault&&
  (!input.requiresPrivateLocalExecution||resource.privacy==='local')
 )??FREE_RESOURCE_REGISTRY.find(resource=>
  resource.capabilities.includes(input.capability)&&
  ((input.allowBrowserLocal&&resource.tier==='browser-local')||(input.allowCloudflareAi&&resource.id==='workers-ai-free'))&&
  (!input.requiresPrivateLocalExecution||resource.privacy==='local')
 )??null;
}

export function requiresPaidFallback(input:FreeFirstRequest){return selectFreeResource(input)===null;}
