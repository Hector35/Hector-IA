import type {DriftCause,DriftIncident} from './plan-drift-incidents';

export type DriftContainmentStatus='healthy'|'watching'|'contained'|'probe-ready';
export type DriftContainmentGroup={cause:DriftCause;status:DriftContainmentStatus;incidents:number;active:number;recovered:number;retryFailed:number;firstSeenAt:string;lastSeenAt:string;nextProbeAt:string|null;reason:string};

const causes:DriftCause[]=['router','budget','feedback','provider','cognition','unknown'];
const HOUR=60*60*1000;

export function aggregateDriftContainment(items:DriftIncident[],now=Date.now()):DriftContainmentGroup[]{
 return causes.flatMap(cause=>{
  const rows=items.filter(item=>item.cause===cause).sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
  if(!rows.length)return[];
  const recent=rows.filter(item=>now-new Date(item.createdAt).getTime()<=24*HOUR),active=recent.filter(item=>item.status==='active'||item.status==='retrying'||item.status==='retry-failed').length,recovered=recent.filter(item=>item.status==='recovered').length,retryFailed=recent.filter(item=>item.status==='retry-failed').length,last=rows[rows.length-1],lastMs=new Date(last.createdAt).getTime(),threshold=recent.length>=3&&(active>=2||retryFailed>=2),cooldownUntil=threshold&&Number.isFinite(lastMs)?lastMs+6*HOUR:null,probeReady=threshold&&cooldownUntil!==null&&now>=cooldownUntil;
  const status:DriftContainmentStatus=threshold?(probeReady?'probe-ready':'contained'):recent.length>=2?'watching':'healthy';
  const reason=status==='contained'?`${recent.length} desviaciones en 24 h; se recomienda aislar ${cause} durante 6 h.`:status==='probe-ready'?`El enfriamiento terminó; ${cause} puede probarse de forma controlada.`:status==='watching'?`${recent.length} desviaciones recientes; aún no se supera el umbral de contención.`:'Sin repetición suficiente para intervenir.';
  return[{cause,status,incidents:recent.length,active,recovered,retryFailed,firstSeenAt:rows[0].createdAt,lastSeenAt:last.createdAt,nextProbeAt:cooldownUntil?new Date(cooldownUntil).toISOString():null,reason}];
 });
}
