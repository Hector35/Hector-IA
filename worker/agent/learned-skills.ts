import type {Bindings} from '../types';

export type LearnedSkillStatus='candidate'|'active'|'degraded'|'disabled';
export type LearnedSkillSignal={successes:number;failures:number;confidence:number;status:LearnedSkillStatus};
export type VerifiedLearningInput={experienceId:string;userId:string;objective:string;procedure:string;skills:string[];verified:boolean;evidence:Record<string,unknown>};

export function normalizeLearningText(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
export function learnedSkillFingerprint(objective:string,skills:string[]){const words=normalizeLearningText(objective).split(' ').filter(word=>word.length>2).slice(0,24).sort();const tags=[...new Set(skills.map(normalizeLearningText).filter(Boolean))].sort();return [...tags,'::',...words].join('|').slice(0,480);}
export function learnedSkillTitle(skills:string[]){return `Patrón aprendido: ${skills.join(' + ')||'general'}`.slice(0,160);}
export function nextLearnedSkillSignal(current:LearnedSkillSignal,outcome:'success'|'failure'):LearnedSkillSignal{
 const successes=current.successes+(outcome==='success'?1:0),failures=current.failures+(outcome==='failure'?1:0);
 const confidence=Math.max(0.05,Math.min(0.98,current.confidence+(outcome==='success'?0.18:-0.28)));
 let status=current.status;
 if(status!=='disabled'){
  if(failures>=3||confidence<0.20)status='disabled';
  else if(failures>=2||confidence<0.45)status='degraded';
  else if(successes>=3&&failures===0&&confidence>=0.75)status='active';
  else if(status==='degraded'&&successes>=failures+3&&confidence>=0.70)status='active';
 }
 return{successes,failures,confidence:Number(confidence.toFixed(4)),status};
}

async function event(env:Bindings,input:{skillId:string;userId:string;type:string;from:LearnedSkillStatus|null;to:LearnedSkillStatus;confidence:number;experienceId?:string;details?:Record<string,unknown>}){
 await env.DB.prepare('INSERT INTO learned_skill_events(id,learned_skill_id,user_id,event_type,from_status,to_status,confidence,experience_id,details_json) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),input.skillId,input.userId,input.type,input.from,input.to,input.confidence,input.experienceId||null,JSON.stringify(input.details||{})).run();
}

export async function observeVerifiedLearning(env:Bindings,input:VerifiedLearningInput){
 if(!input.verified||!input.procedure.trim())return null;
 const fingerprint=learnedSkillFingerprint(input.objective,input.skills);if(!fingerprint)return null;
 const existing=await env.DB.prepare('SELECT * FROM learned_skills WHERE user_id=? AND fingerprint=?').bind(input.userId,fingerprint).first<any>();
 if(!existing){
  const id=crypto.randomUUID(),signal=nextLearnedSkillSignal({successes:0,failures:0,confidence:.40,status:'candidate'},'success');
  await env.DB.batch([
   env.DB.prepare('INSERT INTO learned_skills(id,user_id,fingerprint,title,trigger_text,procedure_text,skills_json,status,confidence,success_count,failure_count,version,active_version,last_experience_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,input.userId,fingerprint,learnedSkillTitle(input.skills),input.objective.slice(0,500),input.procedure.slice(0,6000),JSON.stringify(input.skills),signal.status,signal.confidence,signal.successes,signal.failures,1,1,input.experienceId),
   env.DB.prepare('INSERT INTO learned_skill_versions(id,learned_skill_id,version,trigger_text,procedure_text,skills_json,evidence_json,source_experience_id) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,1,input.objective.slice(0,500),input.procedure.slice(0,6000),JSON.stringify(input.skills),JSON.stringify(input.evidence),input.experienceId)
  ]);
  await event(env,{skillId:id,userId:input.userId,type:'candidate_created',from:null,to:signal.status,confidence:signal.confidence,experienceId:input.experienceId});
  return{id,status:signal.status,confidence:signal.confidence,created:true};
 }
 if(existing.status==='disabled')return{id:existing.id,status:'disabled' as const,confidence:Number(existing.confidence),created:false};
 const signal=nextLearnedSkillSignal({successes:Number(existing.success_count),failures:Number(existing.failure_count),confidence:Number(existing.confidence),status:existing.status},'success');
 const changed=signal.status!==existing.status,version=Number(existing.version)+1;
 await env.DB.batch([
  env.DB.prepare('UPDATE learned_skills SET trigger_text=?,procedure_text=?,skills_json=?,status=?,confidence=?,success_count=?,version=?,active_version=?,last_experience_id=?,disabled_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').bind(input.objective.slice(0,500),input.procedure.slice(0,6000),JSON.stringify(input.skills),signal.status,signal.confidence,signal.successes,version,version,input.experienceId,existing.id,input.userId),
  env.DB.prepare('INSERT INTO learned_skill_versions(id,learned_skill_id,version,trigger_text,procedure_text,skills_json,evidence_json,source_experience_id) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),existing.id,version,input.objective.slice(0,500),input.procedure.slice(0,6000),JSON.stringify(input.skills),JSON.stringify(input.evidence),input.experienceId)
 ]);
 await event(env,{skillId:existing.id,userId:input.userId,type:changed&&signal.status==='active'?'promoted':'candidate_reinforced',from:existing.status,to:signal.status,confidence:signal.confidence,experienceId:input.experienceId});
 return{id:existing.id,status:signal.status,confidence:signal.confidence,created:false};
}

export async function recordLearnedSkillFailure(env:Bindings,input:{userId:string;skillId:string;experienceId?:string;reason:string}){
 const row=await env.DB.prepare('SELECT * FROM learned_skills WHERE id=? AND user_id=?').bind(input.skillId,input.userId).first<any>();if(!row)return null;
 const signal=nextLearnedSkillSignal({successes:Number(row.success_count),failures:Number(row.failure_count),confidence:Number(row.confidence),status:row.status},'failure');
 const type=signal.status==='disabled'?'disabled':signal.status==='degraded'?'degraded':'failed';
 await env.DB.prepare('UPDATE learned_skills SET status=?,confidence=?,failure_count=?,disabled_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').bind(signal.status,signal.confidence,signal.failures,signal.status==='disabled'?input.reason.slice(0,500):null,input.skillId,input.userId).run();
 await event(env,{skillId:input.skillId,userId:input.userId,type,from:row.status,to:signal.status,confidence:signal.confidence,experienceId:input.experienceId,details:{reason:input.reason}});
 return signal;
}

export async function rollbackLearnedSkill(env:Bindings,input:{userId:string;skillId:string;version:number;reason:string}){
 const version=await env.DB.prepare('SELECT * FROM learned_skill_versions WHERE learned_skill_id=? AND version=?').bind(input.skillId,input.version).first<any>();
 const skill=await env.DB.prepare('SELECT * FROM learned_skills WHERE id=? AND user_id=?').bind(input.skillId,input.userId).first<any>();if(!version||!skill)return false;
 await env.DB.prepare("UPDATE learned_skills SET trigger_text=?,procedure_text=?,skills_json=?,active_version=?,status='degraded',confidence=MIN(confidence,0.55),updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(version.trigger_text,version.procedure_text,version.skills_json,input.version,input.skillId,input.userId).run();
 await event(env,{skillId:input.skillId,userId:input.userId,type:'rolled_back',from:skill.status,to:'degraded',confidence:Math.min(Number(skill.confidence),.55),details:{version:input.version,reason:input.reason}});return true;
}
