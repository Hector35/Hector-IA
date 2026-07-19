import fs from 'node:fs';
import path from 'node:path';

const apiKey=(process.env.OPENAI_API_KEY||'').trim();
const task=(process.env.SELF_IMPROVE_TASK||'').trim()||'Audita el núcleo de inteligencia de Héctor OS y realiza una mejora pequeña, verificable y de bajo riesgo.';
const model=(process.env.SELF_IMPROVE_MODEL||'gpt-5.4').trim();
if(!apiKey)throw new Error('OPENAI_API_KEY no configurada para el agente de automejora');

const allowedFiles=[
  'worker/lib/openai.ts',
  'worker/lib/context.ts',
  'worker/routes/intelligence.ts',
  'worker/lib/openai.test.ts',
  'worker/lib/context.test.ts'
];
const existing=allowedFiles.filter(file=>fs.existsSync(file));
const source=existing.map(file=>`\n===== ${file} =====\n${fs.readFileSync(file,'utf8')}`).join('\n');
const maxChars=120000;
const repositoryContext=source.slice(0,maxChars);

const instructions=`Eres el agente de ingeniería de Héctor OS. Tu trabajo es mejorar el código real de forma conservadora y comprobable.

REGLAS INVIOLABLES
- Solo puedes modificar archivos incluidos en allowed_files.
- Máximo 3 archivos y 18000 caracteres totales de contenido nuevo.
- No borres archivos.
- No modifiques autenticación, secretos, workflows, migraciones, wrangler, package.json ni infraestructura.
- No agregues dependencias.
- No afirmes que las pruebas pasan; GitHub Actions las ejecutará después.
- Conserva compatibilidad de API.
- Prioriza una sola causa raíz observable: memoria, continuidad, autoconocimiento, enrutamiento o calidad de evaluación.
- Devuelve JSON puro, sin markdown, con esta forma exacta:
{"summary":"...","risk":"low","hypothesis":"...","acceptance":["..."],"changes":[{"path":"archivo permitido","content":"contenido UTF-8 completo del archivo"}]}
- Si no hay una mejora segura, devuelve changes vacío y explica por qué.
`;

const input=`TAREA AUTORIZADA\n${task}\n\nALLOWED_FILES\n${allowedFiles.join('\n')}\n\nCÓDIGO ACTUAL\n${repositoryContext}`;
const response=await fetch('https://api.openai.com/v1/responses',{
  method:'POST',
  headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
  body:JSON.stringify({model,instructions,input,store:false,reasoning:{effort:'high'},max_output_tokens:30000})
});
const data=await response.json();
if(!response.ok)throw new Error(data?.error?.message||`OpenAI HTTP ${response.status}`);
const text=String(data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'').trim();
let proposal;
try{proposal=JSON.parse(text);}catch{
  const match=text.match(/\{[\s\S]*\}/);
  if(!match)throw new Error('El modelo no devolvió JSON analizable');
  proposal=JSON.parse(match[0]);
}
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
  fs.writeFileSync('/tmp/self-improve-report.md',`# Automejora sin cambios\n\n${proposal.summary||'No se encontró una mejora segura.'}\n`);
  console.log('NO_CHANGES');
  process.exit(0);
}
for(const change of proposal.changes){
  fs.mkdirSync(path.dirname(change.path),{recursive:true});
  fs.writeFileSync(change.path,change.content,'utf8');
}
const report=[
  '# Propuesta autónoma de Héctor OS','',
  `**Resumen:** ${proposal.summary||'Sin resumen'}`,'',
  `**Hipótesis:** ${proposal.hypothesis||'No especificada'}`,'',
  '**Criterios de aceptación:**',
  ...(Array.isArray(proposal.acceptance)?proposal.acceptance.map(x=>`- ${x}`):['- Typecheck, pruebas y build deben pasar.']),
  '', '**Archivos modificados:**', ...proposal.changes.map(x=>`- \`${x.path}\``),
  '', '**Controles aplicados:** riesgo bajo, máximo 3 archivos, sin secretos, infraestructura ni despliegue directo.'
].join('\n');
fs.writeFileSync('/tmp/self-improve-report.md',report);
console.log(JSON.stringify({summary:proposal.summary,files:proposal.changes.map(x=>x.path)}));
