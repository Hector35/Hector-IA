import type {BudgetQualityPolicy} from './budget-quality-breaker';

export type BudgetQualityGovernanceMode='auto'|'protect'|'probe'|'allow';
export type BudgetQualityGovernance={mode:BudgetQualityGovernanceMode;reason:string|null;updatedAt:string|null};

export function normalizeBudgetQualityGovernanceMode(value:unknown):BudgetQualityGovernanceMode{
 return value==='protect'||value==='probe'||value==='allow'?value:'auto';
}

export function applyBudgetQualityGovernance(policy:BudgetQualityPolicy,governance:BudgetQualityGovernance):BudgetQualityPolicy{
 const mode=normalizeBudgetQualityGovernanceMode(governance.mode),reason=governance.reason?.trim()||null;
 if(mode==='auto')return{...policy,governanceMode:mode,governanceReason:reason};
 if(mode==='protect')return{...policy,state:'suspended',reason:reason||'ahorro desactivado manualmente para proteger calidad',governanceMode:mode,governanceReason:reason};
 if(mode==='probe')return{...policy,state:'probe',reason:reason||'solo se permiten pruebas controladas por decisión del propietario',governanceMode:mode,governanceReason:reason};
 return{...policy,state:'healthy',reason:reason||'ahorro permitido manualmente por el propietario',governanceMode:mode,governanceReason:reason};
}

export async function loadBudgetQualityGovernance(db:D1Database,userId:string,task:string):Promise<BudgetQualityGovernance>{
 try{
  const row=await db.prepare('SELECT mode,reason,updated_at FROM budget_quality_governance WHERE user_id=? AND task=?').bind(userId,task).first<any>();
  return{mode:normalizeBudgetQualityGovernanceMode(row?.mode),reason:row?.reason?String(row.reason):null,updatedAt:row?.updated_at?String(row.updated_at):null};
 }catch{return{mode:'auto',reason:null,updatedAt:null};}
}
