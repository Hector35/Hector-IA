import type {Bindings} from '../types';

export async function dispatchAgentRunner(env:Bindings,jobId:string,task:string,maxAttempts=3){
 const token=env.GITHUB_RUNNER_TOKEN?.trim();
 if(!token)throw new Error('GITHUB_RUNNER_TOKEN no configurado');
 const attempts=Math.max(1,Math.min(5,Math.trunc(maxAttempts)||3));
 const response=await fetch('https://api.github.com/repos/Hector35/Hector-IA/actions/workflows/agent-code-runner.yml/dispatches',{
  method:'POST',
  headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Hector-OS-Agent','Content-Type':'application/json'},
  body:JSON.stringify({ref:'main',inputs:{job_id:jobId,task,max_attempts:String(attempts)}})
 });
 if(!response.ok){
  const data=await response.json<any>().catch(()=>({}));
  throw new Error(`No se pudo iniciar runner: ${response.status} ${data?.message||''}`.trim());
 }
}