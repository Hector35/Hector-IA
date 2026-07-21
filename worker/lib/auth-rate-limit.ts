export type RateLimitDecision={blocked:boolean;failures:number;retryAfterSeconds?:number};

export const AUTH_WINDOW_MS=15*60_000;

export function rateLimitDecision(
 row:{failures:number;window_started_at:string;blocked_until?:string|null}|null,
 now=Date.now()
):RateLimitDecision{
 if(!row)return {blocked:false,failures:0};
 const blockedUntil=row.blocked_until?Date.parse(row.blocked_until):0;
 if(Number.isFinite(blockedUntil)&&blockedUntil>now){
  return {blocked:true,failures:row.failures,retryAfterSeconds:Math.ceil((blockedUntil-now)/1000)};
 }
 const windowStarted=Date.parse(row.window_started_at);
 if(!Number.isFinite(windowStarted)||now-windowStarted>AUTH_WINDOW_MS)return {blocked:false,failures:0};
 return {blocked:false,failures:row.failures};
}
