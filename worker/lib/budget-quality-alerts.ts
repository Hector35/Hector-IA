import type {BudgetQualityCategory} from './budget-quality-breaker';

export type BudgetQualityAlertRow={
 id:string;task:string;state:'active'|'resolved';reason:string;triggersJson:string;sampleCount:number;
 firstSeenAt:string;lastSeenAt:string;acknowledgedAt:string|null;mutedUntil:string|null;resolvedAt:string|null;
};

export type BudgetQualityAlertDecision={
 state:'active'|'resolved';reason:string;triggersJson:string;sampleCount:number;
 firstSeenAt:string;lastSeenAt:string;acknowledgedAt:string|null;mutedUntil:string|null;resolvedAt:string|null;
};

function iso(value:string|null|undefined,fallback:string){const date=new Date(String(value||''));return Number.isNaN(date.getTime())?fallback:date.toISOString();}

export function reconcileBudgetQualityAlert(existing:BudgetQualityAlertRow|null,category:BudgetQualityCategory,nowIso=new Date().toISOString()):BudgetQualityAlertDecision{
 const shouldAlert=category.state==='suspended';
 if(shouldAlert){
  const reactivated=existing?.state==='resolved';
  return{
   state:'active',reason:category.reason,triggersJson:JSON.stringify(category.triggeredBy||[]),sampleCount:category.sampleCount,
   firstSeenAt:reactivated||!existing?nowIso:iso(existing.firstSeenAt,nowIso),lastSeenAt:nowIso,
   acknowledgedAt:reactivated?null:(existing?.acknowledgedAt||null),mutedUntil:reactivated?null:(existing?.mutedUntil||null),resolvedAt:null
  };
 }
 return{
  state:'resolved',reason:category.reason,triggersJson:JSON.stringify(category.triggeredBy||[]),sampleCount:category.sampleCount,
  firstSeenAt:existing?iso(existing.firstSeenAt,nowIso):nowIso,lastSeenAt:nowIso,
  acknowledgedAt:existing?.acknowledgedAt||null,mutedUntil:null,resolvedAt:existing?.state==='resolved'?(existing.resolvedAt||nowIso):nowIso
 };
}

export async function syncBudgetQualityAlerts(db:D1Database,userId:string,categories:BudgetQualityCategory[]){
 try{
  for(const category of categories){
   const existing=await db.prepare(`SELECT id,task,state,reason,triggers_json triggersJson,sample_count sampleCount,first_seen_at firstSeenAt,last_seen_at lastSeenAt,acknowledged_at acknowledgedAt,muted_until mutedUntil,resolved_at resolvedAt FROM budget_quality_alerts WHERE user_id=? AND task=?`).bind(userId,category.task).first<BudgetQualityAlertRow>();
   const nowIso=new Date().toISOString(),decision=reconcileBudgetQualityAlert(existing||null,category,nowIso),id=existing?.id||crypto.randomUUID();
   await db.prepare(`INSERT INTO budget_quality_alerts(id,user_id,task,state,reason,triggers_json,sample_count,first_seen_at,last_seen_at,acknowledged_at,muted_until,resolved_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,task) DO UPDATE SET state=excluded.state,reason=excluded.reason,triggers_json=excluded.triggers_json,sample_count=excluded.sample_count,first_seen_at=excluded.first_seen_at,last_seen_at=excluded.last_seen_at,acknowledged_at=excluded.acknowledged_at,muted_until=excluded.muted_until,resolved_at=excluded.resolved_at,updated_at=CURRENT_TIMESTAMP`)
    .bind(id,userId,category.task,decision.state,decision.reason,decision.triggersJson,decision.sampleCount,decision.firstSeenAt,decision.lastSeenAt,decision.acknowledgedAt,decision.mutedUntil,decision.resolvedAt).run();
  }
 }catch{}
}

export async function loadBudgetQualityAlerts(db:D1Database,userId:string){
 try{return (await db.prepare(`SELECT id,task,state,reason,triggers_json triggersJson,sample_count sampleCount,first_seen_at firstSeenAt,last_seen_at lastSeenAt,acknowledged_at acknowledgedAt,muted_until mutedUntil,resolved_at resolvedAt FROM budget_quality_alerts WHERE user_id=? ORDER BY CASE state WHEN 'active' THEN 0 ELSE 1 END,updated_at DESC LIMIT 50`).bind(userId).all<BudgetQualityAlertRow>()).results||[];}catch{return[];}
}
