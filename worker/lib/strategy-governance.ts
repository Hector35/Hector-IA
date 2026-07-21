export type GovernanceMode='auto'|'frozen'|'excluded';
export type GovernanceAction='freeze'|'unfreeze'|'exclude'|'include'|'manual_rollback';
export type GovernedPolicy={strategy:'baseline'|'adaptive';status:string;governanceMode:GovernanceMode;governanceReason:string|null};

export const SENSITIVE_STRATEGY_CATEGORIES=new Set(['salud y análisis de riesgo','finanzas personales']);

export function normalizeGovernanceMode(value:unknown):GovernanceMode{return value==='frozen'||value==='excluded'?value:'auto';}
export function actionToMode(action:GovernanceAction):GovernanceMode{return action==='freeze'?'frozen':action==='exclude'?'excluded':'auto';}
export function applyGovernance<T extends {strategy:'baseline'|'adaptive';status:string;reason:string}>(policy:T,current?:GovernedPolicy|null):T{
 const mode=normalizeGovernanceMode(current?.governanceMode);
 if(mode==='excluded')return{...policy,strategy:'baseline',status:'excluded',reason:current?.governanceReason||'categoría excluida por el propietario'};
 if(mode==='frozen'&&current)return{...policy,strategy:current.strategy,status:'frozen',reason:current.governanceReason||'estrategia congelada por el propietario'};
 return policy;
}
export function manualGovernanceUpdate(action:GovernanceAction,current:{strategy:'baseline'|'adaptive';status:string},reason:string){
 const clean=reason.trim().slice(0,300)||'Decisión manual del propietario';
 if(action==='manual_rollback')return{strategy:'baseline' as const,status:'rolled_back',governanceMode:'frozen' as GovernanceMode,reason:clean,eventAction:action};
 const mode=actionToMode(action);
 return{strategy:action==='exclude'?'baseline' as const:current.strategy,status:action==='exclude'?'excluded':current.status,governanceMode:mode,reason:clean,eventAction:action};
}
