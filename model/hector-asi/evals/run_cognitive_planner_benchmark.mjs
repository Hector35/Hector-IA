import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {comparePlanners} from '../candidates/cognitive-plan-v1.mjs';

const readJsonl=(path)=>readFileSync(path,'utf8').trim().split(/\n+/).filter(Boolean).map((line)=>JSON.parse(line));

export function runBenchmark(casesPath){
  return comparePlanners(readJsonl(casesPath));
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const casesPath=process.argv[2]||'model/hector-asi/evals/cognitive-planning-v1.jsonl';
  const reportPath=process.argv[3]||'artifacts/hector-asi-cognitive-planner-v1.json';
  const report=runBenchmark(casesPath);
  mkdirSync(dirname(reportPath),{recursive:true});
  writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({
    reportPath,
    caseCount:report.caseCount,
    baselineMean:report.baselineMean,
    candidateMean:report.candidateMean,
    absoluteGain:report.absoluteGain
  },null,2));
}
