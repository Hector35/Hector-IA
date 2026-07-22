import type {Bindings} from '../types';

export async function recordExperience(env:Bindings,input:{jobId:string;userId:string;objective:string;status:string;result?:string;skills:string[];attempts:number;durationMs:number}){
 const id=crypto.randomUUID();
 await env.DB.prepare('INSERT INTO agent_experiences(id,job_id,user_id,objective,status,result,skills_json,attempts,duration_ms) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,input.jobId,input.userId,input.objective,input.status,input.result||null,JSON.stringify(input.skills),input.attempts,input.durationMs).run();
 return id;
}

export async function repeatedFailures(env:Bindings,userId:string){
 const rows=(await env.DB.prepare("SELECT objective,result,skills_json,COUNT(*) AS occurrences FROM agent_experiences WHERE user_id=? AND status!='completed' GROUP BY objective,result,skills_json HAVING COUNT(*)>=2 ORDER BY occurrences DESC LIMIT 10").bind(userId).all<any>()).results;
 return rows.map(x=>({objective:x.objective,result:x.result,skills:JSON.parse(x.skills_json||'[]'),occurrences:x.occurrences}));
}

export function learningCandidate(input:{objective:string;result:string;skills:string[];status:string;verified?:boolean}){
 if(input.status!=='completed'||input.verified!==true)return null;
 return{title:`Patrón aprendido: ${input.skills.join(' + ')||'general'}`,trigger:input.objective.slice(0,240),procedure:input.result.slice(0,2000),confidence:.6,status:'candidate' as const};
}
