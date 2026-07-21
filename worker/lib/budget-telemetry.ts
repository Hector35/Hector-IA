export type BudgetTelemetry=Record<string,unknown>|null;

export function normalizeBudgetTelemetry(value:unknown):BudgetTelemetry{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 try{
  const serialized=JSON.stringify(value);
  if(!serialized)return null;
  const parsed=JSON.parse(serialized);
  return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;
 }catch{return null;}
}
