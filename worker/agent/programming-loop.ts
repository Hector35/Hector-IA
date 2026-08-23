export const PROGRAMMING_STATE_PREFIX='HECTOR_AGENT_PROGRAMMING_V2:';

export const PRODUCTION_CONTEXTS=[
 'deploy/production',
 'pwa/production-smoke',
 'context-platform/production-audit',
 'pwa/browser-production-audit',
 'hector-agent/production-audit'
] as const;

export type ProgrammingLoopState={
 version:2;
 phase:'pr'|'production';
 branch:string;
 prNumber:number;
 prUrl:string;
 headSha:string;
 mergeSha?:string;
 needsProduction:boolean;
 changePaths:string[];
 repairCount:number;
 lastFailure?:string;
};

export type VerificationDecision={state:'pending'|'success'|'failure';message:string};

type WorkflowRun={name?:string;status?:string;conclusion?:string|null};
type CommitStatus={context?:string;state?:string;description?:string|null};

export function encodeProgrammingState(state:ProgrammingLoopState){return `${PROGRAMMING_STATE_PREFIX}${JSON.stringify(state)}`;}

export function decodeProgrammingState(value:string|null|undefined):ProgrammingLoopState|null{
 if(!value?.startsWith(PROGRAMMING_STATE_PREFIX))return null;
 try{
  const parsed=JSON.parse(value.slice(PROGRAMMING_STATE_PREFIX.length)) as ProgrammingLoopState;
  if(parsed?.version!==2||!['pr','production'].includes(parsed.phase)||!parsed.branch||!parsed.prNumber||!parsed.prUrl||!parsed.headSha||!Array.isArray(parsed.changePaths))return null;
  return parsed;
 }catch{return null;}
}

export function changesNeedProduction(paths:string[]){
 return paths.some(path=>path.startsWith('public/')||path.startsWith('src/')||path.startsWith('worker/')||path==='package.json'||path==='package-lock.json');
}

export function assessPullRequestRuns(runs:WorkflowRun[]):VerificationDecision{
 if(!runs.length)return{state:'pending',message:'Esperando que aparezcan checks del Pull Request'};
 const unfinished=runs.filter(run=>run.status!=='completed');
 if(unfinished.length)return{state:'pending',message:`Checks en curso: ${unfinished.map(run=>run.name||'workflow').join(', ')}`};
 const bad=new Set(['failure','cancelled','timed_out','action_required','startup_failure','stale']);
 const failed=runs.filter(run=>bad.has(String(run.conclusion||'')));
 if(failed.length)return{state:'failure',message:`Checks fallidos: ${failed.map(run=>`${run.name||'workflow'} (${run.conclusion})`).join(', ')}`};
 const repositoryChecks=runs.find(run=>run.name==='Repository PR Checks');
 if(!repositoryChecks)return{state:'pending',message:'Esperando Repository PR Checks'};
 if(repositoryChecks.conclusion!=='success')return{state:'failure',message:`Repository PR Checks terminó en ${repositoryChecks.conclusion||'estado desconocido'}`};
 return{state:'success',message:`${runs.length} workflow${runs.length===1?'':'s'} del PR completados sin fallo`};
}

export function assessProductionStatuses(statuses:CommitStatus[],required:readonly string[]=PRODUCTION_CONTEXTS):VerificationDecision{
 const latest=new Map<string,CommitStatus>();
 for(const status of statuses)if(status.context&&!latest.has(status.context))latest.set(status.context,status);
 const missing=required.filter(context=>!latest.has(context));
 if(missing.length)return{state:'pending',message:`Esperando validación de producción: ${missing.join(', ')}`};
 const failed=required.map(context=>latest.get(context)!).filter(status=>['failure','error'].includes(String(status.state)));
 if(failed.length)return{state:'failure',message:`Producción falló: ${failed.map(status=>`${status.context}${status.description?` — ${status.description}`:''}`).join('; ')}`};
 const pending=required.map(context=>latest.get(context)!).filter(status=>status.state!=='success');
 if(pending.length)return{state:'pending',message:`Validación de producción en curso: ${pending.map(status=>`${status.context} (${status.state})`).join(', ')}`};
 return{state:'success',message:`Producción verificada: ${required.join(', ')}`};
}
