import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=process.cwd();
const readJson=(path)=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const readJsonl=(path)=>readFileSync(resolve(root,path),'utf8').trim().split(/\n+/).filter(Boolean).map((line,index)=>{try{return JSON.parse(line);}catch(error){throw new Error(`${path}:${index+1} is not valid JSON: ${error.message}`);}});

export function validateHectorAsiArtifacts(){
  const registry=readJson('model/hector-asi/model-registry.json');
  const manifest=readJson('model/hector-asi/data/sft-seed-v1.manifest.json');
  const train=readJsonl(manifest.splits.train);
  const heldOut=readJsonl(manifest.splits.heldOut);
  const ids=new Set();
  for(const row of train){
    if(!row.id||ids.has(row.id))throw new Error(`duplicate or missing training id: ${row.id}`);
    ids.add(row.id);
    if(!Array.isArray(row.messages)||row.messages.length<2)throw new Error(`${row.id}: messages missing`);
    if(row.verification?.verified!==true)throw new Error(`${row.id}: unverified example`);
  }
  for(const row of heldOut){
    if(ids.has(row.id))throw new Error(`${row.id}: held-out contamination`);
    if(!Array.isArray(row.expectedSignals)||row.expectedSignals.length<2)throw new Error(`${row.id}: weak held-out rubric`);
  }
  const candidate=registry.candidates?.[0];
  if(!candidate)throw new Error('candidate missing');
  if(candidate.baseModel.license!=='Apache-2.0')throw new Error('base model license is not approved');
  if(candidate.dataset.containsPrivateUserData!==false||manifest.containsPrivateUserData!==false)throw new Error('private data is not allowed');
  if(candidate.artifacts.committedToGit!==false)throw new Error('large model artifacts must stay out of Git');
  if(candidate.promotionGate.minimumHeldOutImprovement<0.03)throw new Error('promotion gate is too weak');
  return {candidate:candidate.id,trainExamples:train.length,heldOutExamples:heldOut.length};
}

if(import.meta.url===`file://${process.argv[1]}`){
  console.log(JSON.stringify(validateHectorAsiArtifacts(),null,2));
}
