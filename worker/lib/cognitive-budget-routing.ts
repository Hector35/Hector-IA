import type {CognitiveBudgetStatus} from './cognitive-budget';

export type BudgetRoute={model:string;tier:'fast'|'balanced'|'deep';reason:string;reasoning:'low'|'medium'|'high';task:string;needsWeb:boolean};
export type BudgetModels={fast:string;balanced:string;deep:string};
export type BudgetRoutingDecision={route:BudgetRoute;deliberation:'auto'|'off';applied:boolean;action:'allow'|'allow-protected'|'degrade';reason:string;originalTier:BudgetRoute['tier'];targetTier:BudgetRoute['tier']};

const protectedTask=/(salud|riesgo|seguridad|m[eé]dic|legal|ingenier[ií]a de software)/i;

export function isBudgetProtectedTask(task:string){return protectedTask.test(task);}

export function applyCognitiveBudgetRouting(status:CognitiveBudgetStatus,route:BudgetRoute,models:BudgetModels,explicitHigh=false):BudgetRoutingDecision{
 const originalTier=route.tier;
 if(status.enforcementMode!=='protect'||!status.exceeded){return{route,deliberation:'auto',applied:false,action:'allow',reason:'presupuesto disponible o en observación',originalTier,targetTier:route.tier};}
 if(explicitHigh||isBudgetProtectedTask(route.task)){return{route,deliberation:'auto',applied:false,action:'allow-protected',reason:explicitHigh?'razonamiento alto solicitado explícitamente':'tarea crítica protegida contra degradación automática',originalTier,targetTier:route.tier};}
 const targetTier=route.tier==='deep'?'balanced':'fast';
 const model=targetTier==='balanced'?models.balanced:models.fast;
 const reasoning=targetTier==='balanced'?'medium':'low';
 return{route:{...route,model,tier:targetTier,reasoning,reason:`${route.reason}; presupuesto cognitivo excedido: degradación controlada ${originalTier}→${targetTier}`},deliberation:'off',applied:true,action:'degrade',reason:'presupuesto excedido en modo protección; se reduce modelo y se desactiva deliberación multiagente',originalTier,targetTier};
}
