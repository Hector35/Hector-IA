export const JOB_LEASE_SECONDS=300;
export const MAX_RETRY_DELAY_SECONDS=3600;

export function retryDelaySeconds(attempt:number){
 const safe=Math.max(1,Math.floor(attempt));
 return Math.min(MAX_RETRY_DELAY_SECONDS,30*2**(safe-1));
}

export function canRetry(attemptCount:number,maxAttempts:number){
 return Math.max(0,attemptCount)<Math.max(1,maxAttempts);
}
