import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings } from '../types';
import { verifyGitHubActionsToken } from '../lib/github-oidc';

const audience='hector-os-self-improve';
const allowedFiles=['worker/lib/openai.ts','worker/lib/context.ts','worker/routes/intelligence.ts','worker/lib/openai.test.ts','worker/lib/context.test.ts'];
const schema=z.object({task:z.string().min(10).max(5000),files:z.array(z.object({path:z.string(),content:z.string().max(70000)})).min(1).max(5)});

export const selfImprove=new Hono<{Bindings:Bindings}>();
selfImprove.post('/proposal',async c=>{
  try{
    const supplied=(c.req.header('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
    if(!supplied)return c.json({error:'OIDC requerido'},401);
    const claims=await verifyGitHubActionsToken(supplied,audience);
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
    if(!proposal||proposal.risk!=='low'||!Array.isArray(proposal.changes))throw new Error('Propuesta insegura o inválida');
    if(proposal.changes.length>3)throw new Error('Demasiados archivos');
    let total=0;
    for(const change of proposal.changes){if(!allowedFiles.includes(change.path)||typeof change.content!=='string')throw new Error('Cambio fuera de la jaula');total+=change.content.length;}
    if(total>18000)throw new Error('Propuesta demasiado grande');
    return c.json({...proposal,requestedBy:claims.actor||'github-actions'});
  }catch(error){return c.json({error:error instanceof Error?error.message:'Error de automejora'},401);}
});
