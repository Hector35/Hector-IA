import fs from 'node:fs';
import {naiveBaseline,verifyClaim} from '../candidates/claim-verifier-v1.mjs';
const file=new URL('./claim-verification-v1.jsonl',import.meta.url);
const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
const split=process.argv[2]||'test';
const cases=rows.filter(row=>row.split===split);
const evaluate=fn=>{
 let correct=0,brier=0,tp=0,tn=0,fp=0,fnn=0;
 const details=cases.map(row=>{const out=fn(row),pred=!!out.accepted,truth=!!row.expectedAccepted;correct+=pred===truth?1:0;brier+=(out.confidence-(truth?1:0))**2;if(pred&&truth)tp++;else if(!pred&&!truth)tn++;else if(pred&&!truth)fp++;else fnn++;return{id:row.id,truth,pred,score:out.score,confidence:out.confidence,reasons:out.reasons};});
 const tpr=tp/(tp+fnn||1),tnr=tn/(tn+fp||1);
 return{n:cases.length,accuracy:correct/cases.length,balancedAccuracy:(tpr+tnr)/2,brier:brier/cases.length,confusion:{tp,tn,fp,fn:fnn},details};
};
const baseline=evaluate(()=>naiveBaseline());
const candidate=evaluate(row=>verifyClaim(row));
const victory=candidate.balancedAccuracy>=baseline.balancedAccuracy+.25&&candidate.balancedAccuracy>=.8&&candidate.brier<baseline.brier;
const report={schemaVersion:'1.0.0',candidate:'claim-verifier-v1',split,baseline,candidate,victory,criteria:{minBalancedAccuracy:.8,minGain:.25,lowerBrier:true},data:{license:'CC0-1.0 synthetic',source:'hand-authored adversarial factuality cases',apiCostUsd:0}};
console.log(JSON.stringify(report,null,2));
if(!victory)process.exitCode=1;
