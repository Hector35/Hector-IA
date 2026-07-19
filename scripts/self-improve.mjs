import fs from 'node:fs';
import path from 'node:path';

const SELF_IMPROVE_CLIENT_VERSION='2.0.0';
const allowedFiles=['worker/lib/openai.ts','worker/lib/context.ts','worker/routes/intelligence.ts','worker/lib/openai.test.ts','worker/lib/context.test.ts'];
const proposalFile=(process.env.SELF_IMPROVE_PROPOSAL_FILE||'').trim();
if(!proposalFile||!fs.existsSync(proposalFile))throw new Error('SELF_IMPROVE_PROPOSAL_FILE no disponible');
const proposal=JSON.parse(fs.readFileSync(proposalFile,'utf8'));
if(proposal?.error)throw new Error(`Servidor de propuestas: ${proposal.error}`);
if(!proposal||!Array.isArray(proposal.changes))throw new Error('Propuesta inválida: changes ausente');
if(proposal.risk!=='low')throw new Error(`Propuesta rechazada: riesgo ${proposal.risk||'no especificado'}`);
if(proposal.changes.length>3)throw new Error('Propuesta rechazada: más de 3 archivos');
let total=0;
for(const change of proposal.changes){
  if(!change||typeof change.path!=='string'||typeof change.content!=='string')throw new Error('Cambio inválido');
  if(!allowedFiles.includes(change.path))throw new Error(`Archivo fuera de la jaula: ${change.path}`);
  if(change.path.includes('..')||path.isAbsolute(change.path))throw new Error('Ruta insegura');
  total+=change.content.length;
}
if(total>18000)throw new Error(`Propuesta rechazada: ${total} caracteres exceden el límite`);
if(proposal.changes.length===0){
  fs.writeFileSync('/tmp/self-improve-report.md',`# Automejora sin cambios\n\n${proposal.summary||'No se encontró una mejora segura.'}\n\nCliente: ${SELF_IMPROVE_CLIENT_VERSION}\n`);
  console.log('NO_CHANGES');
  process.exit(0);
}
for(const change of proposal.changes){
  fs.mkdirSync(path.dirname(change.path),{recursive:true});
  fs.writeFileSync(change.path,change.content,'utf8');
}
const report=['# Propuesta autónoma de Héctor OS','',`**Resumen:** ${proposal.summary||'Sin resumen'}`,'',`**Hipótesis:** ${proposal.hypothesis||'No especificada'}`,'','**Criterios de aceptación:**',...(Array.isArray(proposal.acceptance)?proposal.acceptance.map(x=>`- ${x}`):['- Typecheck, pruebas y build deben pasar.']),'','**Archivos modificados:**',...proposal.changes.map(x=>`- \`${x.path}\``),'',`**Cliente:** ${SELF_IMPROVE_CLIENT_VERSION}`,'','**Controles aplicados:** propuesta generada dentro de Héctor OS usando OpenAI; GitHub OIDC verificado; riesgo bajo; máximo 3 archivos; sin secretos, infraestructura ni despliegue directo.'].join('\n');
fs.writeFileSync('/tmp/self-improve-report.md',report);
console.log(JSON.stringify({summary:proposal.summary,files:proposal.changes.map(x=>x.path),client:SELF_IMPROVE_CLIENT_VERSION}));
