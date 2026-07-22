import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluateOutputs} from './evaluate_outputs.mjs';

const root=process.cwd();
const readJson=(path)=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const readJsonl=(path)=>readFileSync(resolve(root,path),'utf8').trim().split(/\n+/).filter(Boolean).map((line,index)=>{try{return JSON.parse(line);}catch(error){throw new Error(`${path}:${index+1} is not valid JSON: ${error.message}`);}});

export function validateHectorAsiArtifacts(){
 const registry=readJson('model/hector-asi/model-registry.json'),runtime=readJson('model/hector-asi/runtime-registry.json'),providerPolicy=readJson('model/hector-asi/manifests/openai-training-only-v1.json'),manifest=readJson('model/hector-asi/data/sft-seed-v1.manifest.json'),teacherPrompts=readJsonl('model/hector-asi/data/teacher-prompts-v1.jsonl'),train=readJsonl(manifest.splits.train),heldOut=readJsonl(manifest.splits.heldOut),ids=new Set();
 for(const row of train){if(!row.id||ids.has(row.id))throw new Error(`duplicate or missing training id: ${row.id}`);ids.add(row.id);if(!Array.isArray(row.messages)||row.messages.length<2)throw new Error(`${row.id}: messages missing`);if(row.verification?.verified!==true)throw new Error(`${row.id}: unverified example`);}
 for(const row of heldOut){if(ids.has(row.id))throw new Error(`${row.id}: held-out contamination`);if(!Array.isArray(row.expectedSignals)||row.expectedSignals.length<2)throw new Error(`${row.id}: weak held-out rubric`);}
 for(const row of teacherPrompts){if(row.containsPrivateUserData!==false)throw new Error(`${row.id}: private data is forbidden in teacher prompts`);if(row.license!=='CC0-1.0')throw new Error(`${row.id}: teacher prompt license is not approved`);if(!Array.isArray(row.expectedSignals)||row.expectedSignals.length<2)throw new Error(`${row.id}: teacher prompt lacks review criteria`);}
 const candidate=registry.candidates?.find(item=>item.id==='hector-asi-v0.1-qwen3-4b-sft');
 if(!candidate)throw new Error('planned Qwen candidate missing');
 if(candidate.baseModel.license!=='Apache-2.0')throw new Error('base model license is not approved');
 if(candidate.dataset.containsPrivateUserData!==false||manifest.containsPrivateUserData!==false)throw new Error('private data is not allowed');
 if(candidate.artifacts.committedToGit!==false)throw new Error('large model artifacts must stay out of Git');
 if(candidate.promotionGate.minimumHeldOutImprovement<0.03)throw new Error('promotion gate is too weak');
 if(runtime.operationalBase?.routing?.interactiveChat!=='open-model-only')throw new Error('interactive chat is not open-model-only');
 if(runtime.openAI?.interactiveChatAllowed!==false||runtime.openAI?.role!=='training-and-evaluation-only')throw new Error('OpenAI boundary is not training-only');
 if(providerPolicy.decision?.openAIChatAllowed!==false||providerPolicy.decision?.openAIFallbackAllowed!==false)throw new Error('provider policy permits OpenAI chat or fallback');
 const evaluatorCheck=evaluateOutputs([{id:'self-check',capability:'verification',expectedSignals:['revalidar sha actual','checks verdes']}],[{id:'self-check',response:'Debes revalidar SHA actual y exigir checks verdes.'}]);
 if(evaluatorCheck.meanSignalRecall!==1)throw new Error('held-out evaluator self-check failed');
 return{candidate:candidate.id,candidateCount:registry.candidates.length,trainExamples:train.length,heldOutExamples:heldOut.length,teacherPrompts:teacherPrompts.length,evaluatorSelfCheck:true,interactiveChat:'open-model-only',openAIRole:'training-and-evaluation-only'};
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(validateHectorAsiArtifacts(),null,2));
