export type CognitiveEvidence={kind:string;value:string;verified:boolean};
export type CognitiveExperience={id:string;userId:string;objective:string;procedure:string[];status:'completed'|'failed';evidence:CognitiveEvidence[];modelCalls:number;inputTokens:number;outputTokens:number;costMicros:number;createdAt:string};
export type LearnedSkill={id:string;userId:string;trigger:string;procedure:string[];version:number;confidence:number;successes:number;failures:number;status:'candidate'|'active'|'disabled'};
export type ReuseDecision={mode:'reuse'|'escalate';experienceId?:string;skillId?:string;reason:string;estimatedModelCallsSaved:number;estimatedTokensSaved:number;estimatedCostMicrosSaved:number};

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const terms=(value:string)=>new Set(normalize(value).split(' ').filter(token=>token.length>2));
export function objectiveSimilarity(a:string,b:string){const aa=terms(a),bb=terms(b);if(!aa.size||!bb.size)return 0;let shared=0;for(const token of aa)if(bb.has(token))shared++;return shared/(aa.size+bb.size-shared);}
export function hasVerifiedEvidence(experience:CognitiveExperience){return experience.evidence.some(item=>item.verified&&item.value.trim().length>0);}

export function selectReusableExperience(input:{userId:string;objective:string;experiences:CognitiveExperience[];minimumSimilarity?:number}){
 const minimum=input.minimumSimilarity??.42;
 return input.experiences
  .filter(item=>item.userId===input.userId&&item.status==='completed'&&hasVerifiedEvidence(item))
  .map(item=>({item,score:objectiveSimilarity(input.objective,item.objective)}))
  .filter(row=>row.score>=minimum)
  .sort((a,b)=>b.score-a.score||Date.parse(b.item.createdAt)-Date.parse(a.item.createdAt))[0]||null;
}

export function promoteSkill(experience:CognitiveExperience,existing?:LearnedSkill):LearnedSkill|null{
 if(experience.status!=='completed'||!hasVerifiedEvidence(experience)||experience.procedure.length===0)return null;
 if(existing&&(existing.userId!==experience.userId||objectiveSimilarity(existing.trigger,experience.objective)<.42))return null;
 const successes=(existing?.successes??0)+1,failures=existing?.failures??0,total=successes+failures;
 const confidence=Math.min(.98,Math.max(.5,successes/Math.max(1,total)));
 return{id:existing?.id??`skill:${experience.id}`,userId:experience.userId,trigger:existing?.trigger??normalize(experience.objective).slice(0,240),procedure:experience.procedure,version:(existing?.version??0)+1,confidence,successes,failures,status:successes>=2&&confidence>=.66?'active':'candidate'};
}

export function recordSkillOutcome(skill:LearnedSkill,succeeded:boolean):LearnedSkill{
 const successes=skill.successes+(succeeded?1:0),failures=skill.failures+(succeeded?0:1),total=successes+failures,confidence=successes/Math.max(1,total);
 return{...skill,successes,failures,confidence,status:failures>=2&&confidence<.6?'disabled':successes>=2&&confidence>=.66?'active':'candidate'};
}

export function decideReuse(input:{userId:string;objective:string;experiences:CognitiveExperience[];skills:LearnedSkill[]}):ReuseDecision{
 const skill=input.skills.filter(item=>item.userId===input.userId&&item.status==='active'&&item.confidence>=.66).map(item=>({item,score:objectiveSimilarity(input.objective,item.trigger)})).filter(row=>row.score>=.42).sort((a,b)=>b.score-a.score)[0];
 const experience=selectReusableExperience(input);
 if(!skill&&!experience)return{mode:'escalate',reason:'No existe experiencia o habilidad verificada suficientemente similar.',estimatedModelCallsSaved:0,estimatedTokensSaved:0,estimatedCostMicrosSaved:0};
 const source=experience?.item;
 return{mode:'reuse',skillId:skill?.item.id,experienceId:source?.id,reason:skill?'Habilidad activa y verificada disponible.':'Experiencia verificada disponible.',estimatedModelCallsSaved:Math.max(1,source?.modelCalls??1),estimatedTokensSaved:(source?.inputTokens??0)+(source?.outputTokens??0),estimatedCostMicrosSaved:source?.costMicros??0};
}

export function cognitiveCycleMetrics(decisions:ReuseDecision[]){const reused=decisions.filter(item=>item.mode==='reuse');return{tasks:decisions.length,reusedTasks:reused.length,reuseRate:decisions.length?reused.length/decisions.length:0,modelCallsSaved:reused.reduce((sum,item)=>sum+item.estimatedModelCallsSaved,0),tokensSaved:reused.reduce((sum,item)=>sum+item.estimatedTokensSaved,0),costMicrosSaved:reused.reduce((sum,item)=>sum+item.estimatedCostMicrosSaved,0)};}
