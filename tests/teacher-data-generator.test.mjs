import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const generator='model/hector-asi/generate_teacher_data.mjs';
const prompts='model/hector-asi/data/teacher-prompts-v1.jsonl';

describe('OpenAI teacher data pipeline',()=>{
 it('plans a bounded run without network or credentials',()=>{
  const output=execFileSync(process.execPath,[generator,'--max-examples','2','--max-output-tokens','300'],{encoding:'utf8'});
  const plan=JSON.parse(output);
  expect(plan).toMatchObject({mode:'dry-run',provider:'openai',role:'training-data-teacher-only',selectedPrompts:2,maxOutputTokens:300,containsPrivateUserData:false,automaticTrainingIngestion:false});
  expect(plan.hardCallLimit).toBe(20);
 });

 it('requires an explicit training gate before any paid call',()=>{
  const source=readFileSync(generator,'utf8');
  expect(source).toContain("HECTOR_TRAINING_OPENAI_ENABLED!=='true'");
  expect(source).toContain('OPENAI_API_KEY is required only for the training-data teacher run');
  expect(source).toContain("verification:{type:'teacher-staging',verified:false");
  expect(source).toContain('automaticTrainingIngestion:false');
 });

 it('accepts only public prompt inputs with review criteria',()=>{
  const rows=readFileSync(prompts,'utf8').trim().split(/\n+/).map(line=>JSON.parse(line));
  expect(rows.length).toBeGreaterThanOrEqual(8);
  for(const row of rows){
   expect(row.license).toBe('CC0-1.0');
   expect(row.containsPrivateUserData).toBe(false);
   expect(row.expectedSignals.length).toBeGreaterThanOrEqual(2);
  }
 });
});
