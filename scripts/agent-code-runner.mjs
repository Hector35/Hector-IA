import fs from 'node:fs';
import path from 'node:path';

const exact=new Set([
 'src/CodexApp.tsx','src/api.ts','src/MarkdownMessage.tsx','src/chat-content.css','src/codex-ui.css','src/codex-mobile.css',
 'worker/index.ts','worker/types.ts','worker/lib/openai.ts','worker/lib/context.ts','worker/lib/work-mode.ts','worker/lib/hector-agent-runtime.ts',
 'worker/routes/agent.ts','worker/routes/intelligence.ts','worker/routes/system.ts','worker/routes/hector-agent.ts','worker/routes/pwa-factory.ts','worker/routes/pwa-runner-status.ts',
 'worker/agent/planner.ts','worker/agent/skills.ts','worker/agent/skills.test.ts','worker/agent/learning.ts','worker/agent/programming-loop.ts'
]);
const deniedPrefixes=['.github/','migrations/','.env','config/'];
const deniedSensitive=/(^|\/)(auth|bridge-security|secure-entry|credential|secret)(\.|\/|-)/i;
function allowed(filePath){
 if(!filePath||filePath.includes('..')||path.isAbsolute(filePath)||deniedPrefixes.some(prefix=>filePath.startsWith(prefix))||deniedSensitive.test(filePath))return false;
 if(exact.has(filePath))return true;
 if(filePath.startsWith('public/turno-rx/')||filePath.startsWith('public/agent/'))return /\.(?:js|mjs|css|html|webmanifest|json|txt)$/i.test(filePath);
 if(filePath.startsWith('worker/agent/'))return /(?:\.test)?\.ts$/i.test(filePath);
 if(filePath.startsWith('tests/'))return /\.(?:test\.)?(?:ts|tsx|js|mjs)$/i.test(filePath);
 if(filePath.startsWith('scripts/'))return /\.(?:mjs|js|ts)$/i.test(filePath)&&!/(deploy|secret|credential|migration)/i.test(filePath);
 return false;
}

const file=process.env.AGENT_PROPOSAL_FILE;
if(!file||!fs.existsSync(file))throw new Error('AGENT_PROPOSAL_FILE no disponible');
const proposal=JSON.parse(fs.readFileSync(file,'utf8'));
if(proposal?.error)throw new Error(proposal.error);
if(proposal.risk!=='low'||!Array.isArray(proposal.changes))throw new Error('Propuesta inválida');
if(proposal.changes.length>8)throw new Error('Demasiados archivos');
let total=0;
for(const change of proposal.changes){
 if(!change||typeof change.path!=='string'||typeof change.content!=='string')throw new Error('Cambio inválido');
 if(!allowed(change.path))throw new Error(`Ruta fuera de la jaula: ${change.path}`);
 total+=change.content.length;
}
if(total>180000)throw new Error('Propuesta demasiado grande');
for(const change of proposal.changes){fs.mkdirSync(path.dirname(change.path),{recursive:true});fs.writeFileSync(change.path,change.content,'utf8');}
console.log(JSON.stringify({summary:proposal.summary,files:proposal.changes.map(x=>x.path)}));
