import fs from 'node:fs';
import path from 'node:path';

const task=String(process.env.AGENT_TASK||'');
const attempt=Number(process.env.ATTEMPT||1);
const failure=String(process.env.FAILURE||'').trim()||undefined;
const jobId=String(process.env.AGENT_JOB_ID||'');
const normalized=task.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const candidates=[];
const add=value=>{if(value&&!candidates.includes(value)&&fs.existsSync(value)&&fs.statSync(value).isFile())candidates.push(value)};

[
 'src/CodexApp.tsx','src/api.ts','src/MarkdownMessage.tsx','src/chat-content.css','src/codex-ui.css','src/codex-mobile.css',
 'worker/index.ts','worker/types.ts','worker/lib/openai.ts','worker/lib/context.ts','worker/lib/work-mode.ts','worker/lib/hector-agent-runtime.ts',
 'worker/routes/agent.ts','worker/routes/intelligence.ts','worker/routes/system.ts','worker/routes/hector-agent.ts',
 'worker/agent/planner.ts','worker/agent/skills.ts','worker/agent/learning.ts','worker/agent/programming-loop.ts'
].forEach(add);

if(normalized.includes('pendient')||normalized.includes('turno-rx')){
 const root='public/turno-rx';
 ['index.html','sw.js','app.js','app-v16.js'].forEach(name=>add(path.join(root,name)));
 const htmlPath=path.join(root,'index.html');
 if(fs.existsSync(htmlPath)){
  const html=fs.readFileSync(htmlPath,'utf8');
  for(const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)){
   const ref=match[1];
   if(ref.startsWith('http:')||ref.startsWith('https:')||ref.startsWith('/')||ref.startsWith('data:'))continue;
   add(path.join(root,ref));
  }
 }
 add('scripts/pwa-browser-audit.mjs');
 if(fs.existsSync('tests'))for(const name of fs.readdirSync('tests').sort())if(/turno|pendient|pwa/i.test(name))add(path.join('tests',name));
}

if(normalized.includes('hector agent')||normalized.includes('agent')){
 ['public/agent/index.html','public/agent/app.js','public/agent/styles.css','public/agent/sw.js','public/agent/manifest.webmanifest'].forEach(add);
 if(fs.existsSync('worker/agent'))for(const name of fs.readdirSync('worker/agent').sort())if(name.endsWith('.ts'))add(path.join('worker/agent',name));
}

const files=[];let total=0;
for(const candidate of candidates){
 const content=fs.readFileSync(candidate,'utf8');
 if(content.length>90000)continue;
 if(total+content.length>300000)continue;
 files.push({path:candidate,content});total+=content.length;
 if(files.length>=30)break;
}
if(!jobId||files.length===0)throw new Error('No se pudo construir contexto de código para el runner');
fs.writeFileSync('/tmp/agent-request.json',JSON.stringify({jobId,task,attempt,failure,files}));
console.log(JSON.stringify({jobId,attempt,files:files.map(file=>file.path),bytes:total}));
