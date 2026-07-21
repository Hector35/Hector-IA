import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings } from '../types';
import { verifyGitHubActionsToken } from '../lib/github-oidc';

const oidcPolicy={audience:'hector-os-self-improve',workflows:['self-improve.yml'],events:['push','workflow_dispatch'],refs:['refs/heads/main']};
const repository='Hector35/Hector-IA';
const allowedFiles=['worker/lib/openai.ts','worker/lib/context.ts','worker/routes/intelligence.ts','worker/lib/openai.test.ts','worker/lib/context.test.ts'];
const fileSchema=z.object({path:z.string(),content:z.string().max(70000)});
const schema=z.object({task:z.string().min(10).max(5000),files:z.array(fileSchema).min(1).max(5)});
const proposalSchema=z.object({
  summary:z.string().min(1).max(3000),
  risk:z.literal('low'),
  hypothesis:z.string().max(3000).optional(),
  acceptance:z.array(z.string().max(500)).max(20).optional(),
  changes:z.array(fileSchema).max(3)
});
const publishSchema=z.object({
  proposal:proposalSchema,
  verification:z.object({typecheck:z.literal(true),tests:z.literal(true),build:z.literal(true)}),
  runId:z.string().regex(/^\d+$/),
  runAttempt:z.string().regex(/^\d+$/)
});

export const selfImprove=new Hono<{Bindings:Bindings}>();

async function authenticate(c:any){
  const supplied=(c.req.header('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!supplied)throw new Error('OIDC requerido');
  return verifyGitHubActionsToken(supplied,oidcPolicy);
}
function validateChanges(changes:Array<{path:string;content:string}>){
  if(changes.length>3)throw new Error('Demasiados archivos');
  let total=0;
  for(const change of changes){
    if(!allowedFiles.includes(change.path)||typeof change.content!=='string')throw new Error('Cambio fuera de la jaula');
    total+=change.content.length;
  }
  if(total>18000)throw new Error('Propuesta demasiado grande');
}
async function github(token:string,path:string,init:RequestInit={}){
  const response=await fetch(`https://api.github.com/repos/${repository}${path}`,{
    ...init,
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Hector-OS-Self-Improve','Content-Type':'application/json',...(init.headers||{})}
  });
  const data=await response.json<any>().catch(()=>({}));
  if(!response.ok)throw new Error(`GitHub ${response.status}: ${data?.message||'error'}`);
  return data;
}

selfImprove.post('/proposal',async c=>{
  try{
    const claims=await authenticate(c);
    const parsed=schema.safeParse(await c.req.json());
    if(!parsed.success)return c.json({error:'Payload inválido'},400);
    for(const file of parsed.data.files)if(!allowedFiles.includes(file.path))return c.json({error:`Archivo no permitido: ${file.path}`},400);
    const source=parsed.data.files.map(x=>`\n===== ${x.path} =====\n${x.content}`).join('\n').slice(0,120000);
    const instructions=`Eres el agente de ingeniería de Héctor OS. Inspecciona código real y propone una sola mejora conservadora y verificable.\n\nREGLAS INVIOLABLES\n- Solo modifica archivos de allowed_files.\n- Máximo 3 archivos y 18000 caracteres totales.\n- No borres archivos, no agregues dependencias y no modifiques autenticación, secretos, workflows, migraciones ni infraestructura.\n- Conserva compatibilidad de API.\n- Riesgo debe ser low.\n- Devuelve JSON puro con: {"summary":"...","risk":"low","hypothesis":"...","acceptance":["..."],"changes":[{"path":"...","content":"contenido completo"}]}.\n- Si no existe mejora segura, devuelve changes vacío.`;
    const input=`TAREA\n${parsed.data.task}\n\nALLOWED_FILES\n${allowedFiles.join('\n')}\n\nCÓDIGO\n${source}`;
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${c.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:c.env.OPENAI_MODEL_REASONING||'gpt-5.4',instructions,input,store:false,reasoning:{effort:'high'},max_output_tokens:30000})});
    const data=await response.json<any>();
    if(!response.ok)return c.json({error:data?.error?.message||'Error de OpenAI'},502);
    const text=String(data.output_text||data.output?.flatMap((x:any)=>x.content||[]).map((x:any)=>x.text||'').join('')||'').trim();
    let proposal:any;
    try{proposal=JSON.parse(text);}catch{const match=text.match(/\{[\s\S]*\}/);if(!match)throw new Error('Respuesta no JSON');proposal=JSON.parse(match[0]);}
    const safe=proposalSchema.parse(proposal);
    validateChanges(safe.changes);
    return c.json({...safe,requestedBy:claims.actor||'github-actions'});
  }catch(error){return c.json({error:error instanceof Error?error.message:'Error de automejora'},401);}
});

selfImprove.post('/publish',async c=>{
  try{
    const claims=await authenticate(c);
    const parsed=publishSchema.safeParse(await c.req.json());
    if(!parsed.success)return c.json({error:'Publicación inválida o pruebas no confirmadas'},400);
    validateChanges(parsed.data.proposal.changes);
    if(parsed.data.proposal.changes.length===0)return c.json({published:false,reason:'Sin cambios'});
    const token=c.env.GITHUB_RUNNER_TOKEN?.trim();
    if(!token)return c.json({error:'GITHUB_RUNNER_TOKEN no configurado'},503);
    const main=await github(token,'/git/ref/heads/main');
    const branch=`hector-self-improve/${parsed.data.runId}-${parsed.data.runAttempt}`;
    await github(token,'/git/refs',{method:'POST',body:JSON.stringify({ref:`refs/heads/${branch}`,sha:main.object.sha})});
    for(const change of parsed.data.proposal.changes){
      const current=await github(token,`/contents/${change.path}?ref=main`);
      await github(token,`/contents/${change.path}`,{method:'PUT',body:JSON.stringify({message:'feat(ai): autonomous guarded improvement',content:btoa(unescape(encodeURIComponent(change.content))),sha:current.sha,branch})});
    }
    const body=[
      '# Propuesta autónoma de Héctor OS','',
      `**Resumen:** ${parsed.data.proposal.summary}`,'',
      `**Hipótesis:** ${parsed.data.proposal.hypothesis||'No especificada'}`,'',
      '**Verificación previa:** typecheck, pruebas y build exitosos en GitHub Actions.','',
      '**Archivos:**',...parsed.data.proposal.changes.map(x=>`- \`${x.path}\``),'',
      `**Solicitado por:** ${claims.actor||'github-actions'}`
    ].join('\n');
    const pr=await github(token,'/pulls',{method:'POST',body:JSON.stringify({title:'Héctor OS: propuesta autónoma de mejora',head:branch,base:'main',body})});
    return c.json({published:true,branch,prNumber:pr.number,prUrl:pr.html_url});
  }catch(error){return c.json({error:error instanceof Error?error.message:'Error al publicar mejora'},502);}
});
