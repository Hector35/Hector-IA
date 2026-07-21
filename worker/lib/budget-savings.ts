import {estimateModelCost} from './model-pricing';

export type BudgetUsageRow={model?:string|null;input_units?:number|null;cached_input_units?:number|null;output_units?:number|null;estimated_cost_usd?:number|null;metadata_json?:string|null};
export type BudgetSavingsSummary={actualCostUsd:number;counterfactualCostUsd:number;savedUsd:number;savingsPercent:number;degradedRequests:number;qualitySamples:number;averageQuality:number|null;acceptedRequests:number;acceptanceRate:number|null;byService:Record<string,{requests:number;actualCostUsd:number;savedUsd:number}>};

function finite(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>=0?n:0;}
function metadata(value:unknown):Record<string,any>{try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{return{};}}

export function aggregateBudgetSavings(rows:BudgetUsageRow[]):BudgetSavingsSummary{
 let actualCostUsd=0,counterfactualCostUsd=0,degradedRequests=0,qualityTotal=0,qualitySamples=0,acceptedRequests=0;
 const byService:BudgetSavingsSummary['byService']={};
 for(const row of rows){
  const meta=metadata(row.metadata_json),decision=meta.budgetDecision,actual=finite(row.estimated_cost_usd),service=String(meta.service||meta.task||'general');
  actualCostUsd+=actual;
  let counterfactual=actual;
  if(decision?.action==='degrade'&&decision?.projection?.model){
   const estimate=estimateModelCost({input_tokens:finite(row.input_units),input_tokens_details:{cached_tokens:finite(row.cached_input_units)},output_tokens:finite(row.output_units)},String(decision.projection.model));
   if(estimate.pricingKnown&&estimate.costUsd>=actual){counterfactual=estimate.costUsd;degradedRequests++;}
  }
  counterfactualCostUsd+=counterfactual;
  const quality=Number(meta.qualityScore);if(Number.isFinite(quality)){qualityTotal+=Math.max(0,Math.min(100,quality));qualitySamples++;if(meta.qualityAccepted!==false)acceptedRequests++;}
  const bucket=byService[service]||{requests:0,actualCostUsd:0,savedUsd:0};bucket.requests++;bucket.actualCostUsd+=actual;bucket.savedUsd+=Math.max(0,counterfactual-actual);byService[service]=bucket;
 }
 const savedUsd=Math.max(0,counterfactualCostUsd-actualCostUsd),savingsPercent=counterfactualCostUsd>0?savedUsd/counterfactualCostUsd*100:0;
 return{actualCostUsd,counterfactualCostUsd,savedUsd,savingsPercent,degradedRequests,qualitySamples,averageQuality:qualitySamples?qualityTotal/qualitySamples:null,acceptedRequests,acceptanceRate:qualitySamples?acceptedRequests/qualitySamples*100:null,byService};
}
