import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const readJsonl=(path)=>readFileSync(path,'utf8').trim().split(/\n+/).filter(Boolean).map((line)=>JSON.parse(line));
const normalize=(value)=>value.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu,'');

export function evaluateOutputs(cases,outputs){
  const byId=new Map(outputs.map((row)=>[row.id,row]));
  const results=cases.map((test)=>{
    const output=byId.get(test.id);
    if(!output||typeof output.response!=='string')return{id:test.id,score:0,missing:true};
    const text=normalize(output.response);
    const matched=test.expectedSignals.filter((signal)=>text.includes(normalize(signal)));
    return{id:test.id,capability:test.capability,score:matched.length/test.expectedSignals.length,matched,expected:test.expectedSignals};
  });
  const mean=results.reduce((sum,row)=>sum+row.score,0)/Math.max(1,results.length);
  return{schemaVersion:'1.0.0',caseCount:results.length,meanSignalRecall:mean,results};
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const casesPath=process.argv[2];
  const outputsPath=process.argv[3];
  const reportPath=process.argv[4]||'artifacts/hector-asi-eval.json';
  if(!casesPath||!outputsPath)throw new Error('Usage: node evaluate_outputs.mjs <cases.jsonl> <outputs.jsonl> [report.json]');
  const report=evaluateOutputs(readJsonl(casesPath),readJsonl(outputsPath));
  mkdirSync(dirname(reportPath),{recursive:true});
  writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({reportPath,meanSignalRecall:report.meanSignalRecall,caseCount:report.caseCount},null,2));
}
