import fs from 'node:fs';
import path from 'node:path';

const allowed=[
 'src/CodexApp.tsx','src/api.ts','src/MarkdownMessage.tsx','src/chat-content.css','src/codex-ui.css','src/codex-mobile.css',
 'worker/index.ts','worker/types.ts','worker/lib/openai.ts','worker/lib/context.ts','worker/routes/agent.ts','worker/routes/intelligence.ts','worker/routes/system.ts',
 'worker/routes/pwa-factory.ts','worker/routes/pwa-runner-status.ts',
 'worker/agent/planner.ts','worker/agent/skills.ts','worker/agent/skills.test.ts','worker/agent/learning.ts'
];
const file=process.env.AGENT_PROPOSAL_FILE;
if(!file||!fs.existsSync(file))throw new Error('AGENT_PROPOSAL_FILE no disponible');
const proposal=JSON.parse(fs.readFileSync(file,'utf8'));
if(proposal?.error)throw new Error(proposal.error);
if(proposal.risk!=='low'||!Array.isArray(proposal.changes))throw new Error('Propuesta inválida');
if(proposal.changes.length>6)throw new Error('Demasiados archivos');
let total=0;
for(const change of proposal.changes){if(!change||typeof change.path!=='string'||typeof change.content!=='string')throw new Error('Cambio inválido');if(!allowed.includes(change.path)||change.path.includes('..')||path.isAbsolute(change.path))throw new Error(`Ruta fuera de la jaula: ${change.path}`);total+=change.content.length;}
if(total>120000)throw new Error('Propuesta demasiado grande');
for(const change of proposal.changes){fs.mkdirSync(path.dirname(change.path),{recursive:true});fs.writeFileSync(change.path,change.content,'utf8');}
console.log(JSON.stringify({summary:proposal.summary,files:proposal.changes.map(x=>x.path)}));
