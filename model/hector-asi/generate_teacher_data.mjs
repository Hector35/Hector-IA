import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const root=process.cwd();
const argv=process.argv.slice(2);
const value=(name,fallback)=>{const index=argv.indexOf(name);return index>=0?argv[index+1]:fallback;};
const has=name=>argv.includes(name);
const inputPath=value('--input','model/hector-asi/data/teacher-prompts-v1.jsonl');
const outputPath=value('--output','artifacts/hector-asi/teacher-staging/openai-teacher-v1.jsonl');
const model=value('--model',process.env.OPENAI_TEACHER_MODEL||process.env.OPENAI_MODEL_REASONING||'gpt-5.6-sol');
const requestedMax=Number(value('--max-examples','4'));
const maxExamples=Number.isInteger(requestedMax)&&requestedMax>0?Math.min(requestedMax,20):4;
const requestedTokens=Number(value('--max-output-tokens','700'));
const maxOutputTokens=Number.isInteger(requestedTokens)&&requestedTokens>=128?Math.min(requestedTokens,2000):700;
const execute=has('--execute');

function readJsonl(path){
 const text=readFileSync(resolve(root,path),'utf8').trim();
 return text?text.split(/\n+/).map((line,index)=>{try{return JSON.parse(line);}catch(error){throw new Error(`${path}:${index+1}: ${error.message}`);}}):[];
}

function validatePrompt(row,index){
 if(!row.id||!row.capability||!row.prompt)throw new Error(`prompt ${index+1}: id, capability and prompt are required`);
 if(row.containsPrivateUserData!==false)throw new Error(`${row.id}: teacher generation rejects private user data`);
 if(row.license!=='CC0-1.0')throw new Error(`${row.id}: only CC0-1.0 prompt inputs are accepted by this generator`);
 if(!Array.isArray(row.expectedSignals)||row.expectedSignals.length<2)throw new Error(`${row.id}: expectedSignals must define at least two review criteria`);
}

function outputText(data){
 if(typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
 const text=(data.output||[]).flatMap(item=>item.content||[]).map(item=>item.text||'').join('').trim();
 if(!text)throw new Error('OpenAI teacher returned an empty response');
 return text;
}

async function callTeacher(row,key){
 const instructions=`You are a teacher model producing one candidate training answer for Hector ASI.\n\nREQUIREMENTS\n- Answer in Spanish.\n- Produce only the proposed answer, without JSON or hidden reasoning.\n- Be direct, technically rigorous and reusable beyond the specific example.\n- Distinguish evidence, uncertainty and limits.\n- Do not mention private data or claim actions that were not performed.\n- OpenAI is acting only as a training-data teacher; this output is not a live chat answer and remains unverified until a separate review.`;
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input:row.prompt,store:false,max_output_tokens:maxOutputTokens})});
 const data=await response.json();
 if(!response.ok)throw new Error(data?.error?.message||`OpenAI teacher failed with HTTP ${response.status}`);
 return{data,text:outputText(data)};
}

const prompts=readJsonl(inputPath);
prompts.forEach(validatePrompt);
const selected=prompts.slice(0,maxExamples);
if(!selected.length)throw new Error('No teacher prompts were selected');

const plan={mode:execute?'execute':'dry-run',provider:'openai',role:'training-data-teacher-only',model,inputPath,outputPath,availablePrompts:prompts.length,selectedPrompts:selected.length,maxOutputTokens,hardCallLimit:20,containsPrivateUserData:false,automaticTrainingIngestion:false};

if(!execute){
 console.log(JSON.stringify(plan,null,2));
 process.exit(0);
}

if(process.env.HECTOR_TRAINING_OPENAI_ENABLED!=='true')throw new Error('Set HECTOR_TRAINING_OPENAI_ENABLED=true to confirm that this is a budgeted training run');
const key=process.env.OPENAI_API_KEY?.trim();
if(!key)throw new Error('OPENAI_API_KEY is required only for the training-data teacher run');

const rows=[];
let inputTokens=0,outputTokens=0;
for(const row of selected){
 const {data,text}=await callTeacher(row,key);
 inputTokens+=Number(data.usage?.input_tokens||0);
 outputTokens+=Number(data.usage?.output_tokens||0);
 rows.push({
  id:`${row.id}-openai-${String(data.id||crypto.randomUUID()).slice(-12)}`,
  capability:row.capability,
  messages:[
   {role:'system',content:'Eres Hector ASI. Responde con evidencia, calibración, límites y estrategias verificables.'},
   {role:'user',content:row.prompt},
   {role:'assistant',content:text}
  ],
  verification:{type:'teacher-staging',verified:false,status:'needs-independent-review',criteria:row.expectedSignals},
  provenance:{provider:'openai',role:'training-data-teacher-only',model,responseId:data.id||null,generatedAt:new Date().toISOString(),inputDataset:inputPath,inputLicense:row.license,containsPrivateUserData:false},
  usage:{inputTokens:Number(data.usage?.input_tokens||0),outputTokens:Number(data.usage?.output_tokens||0)}
 });
}

mkdirSync(dirname(resolve(root,outputPath)),{recursive:true});
writeFileSync(resolve(root,outputPath),`${rows.map(row=>JSON.stringify(row)).join('\n')}\n`,{mode:0o600});
console.log(JSON.stringify({...plan,generated:rows.length,inputTokens,outputTokens,verification:'all outputs remain unverified staging data'},null,2));
