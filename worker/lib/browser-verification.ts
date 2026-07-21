export type BrowserVerificationStatus='queued'|'running'|'completed'|'failed';
export type BrowserVerificationOutcome='completed'|'failed';

export function canTransitionBrowserVerification(from:BrowserVerificationStatus,to:BrowserVerificationStatus){
 if(from===to)return true;
 if(from==='queued')return to==='running'||to==='completed'||to==='failed';
 if(from==='running')return to==='completed'||to==='failed';
 return false;
}

export function resolveBrowserVerificationOutcome(status:number|null|undefined,explicit?:BrowserVerificationOutcome):BrowserVerificationOutcome{
 if(explicit)return explicit;
 return typeof status==='number'&&status>=100&&status<400?'completed':'failed';
}

export function browserVerificationError(errors:string[]){
 const message=errors.find(value=>value.trim())?.trim();
 return message?message.slice(0,500):null;
}
