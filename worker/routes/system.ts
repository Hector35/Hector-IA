import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {SYSTEM_VERSION,RELEASED_AT,RELEASE_CHANGES,VERIFIED_CAPABILITIES,CURRENT_LIMITATIONS,shortImprovementPrompt} from '../intelligence/system-manifest';
import {renderEvidenceSelfAnalysis} from '../intelligence/self-report';

export const systemInfo=new Hono<{Bindings:Bindings;Variables:Variables}>();
systemInfo.use('*',requireAuth);

systemInfo.get('/report',async c=>{
  const userId=c.get('userId');
  const [latest,promptRow]=await Promise.all([
    c.env.DB.prepare('SELECT score,grade,strengths_json,gaps_json,tests_json,model,latency_ms,created_at FROM self_evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(userId).first<any>(),
    c.env.DB.prepare("SELECT prompt FROM improvement_prompts WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(userId).first<any>()
  ]);
  const gaps=latest?.gaps_json?JSON.parse(latest.gaps_json):[];
  const strengths=latest?.strengths_json?JSON.parse(latest.strengths_json):[];
  const tests=latest?.tests_json?JSON.parse(latest.tests_json):[];
  const prompt=promptRow?.prompt||shortImprovementPrompt(gaps);
  const evaluation=latest?{score:latest.score,grade:latest.grade,strengths,gaps,tests,model:latest.model,latencyMs:latest.latency_ms,createdAt:latest.created_at,prompt}:null;
  const text=evaluation?renderEvidenceSelfAnalysis({score:evaluation.score,grade:evaluation.grade,strengths:evaluation.strengths,gaps:evaluation.gaps,tests:evaluation.tests,averageLatencyMs:evaluation.latencyMs||0,prompt:evaluation.prompt}):[
    `## Héctor OS ${SYSTEM_VERSION}`,
    `Actualizado: ${RELEASED_AT}`,
    '',
    'Todavía no existe una autoevaluación ejecutada. Escribe **“autoevalúate”** para generar pruebas, evidencia y un prompt de mejora.'
  ].join('\n');
  return c.json({version:SYSTEM_VERSION,releasedAt:RELEASED_AT,changes:RELEASE_CHANGES,capabilities:VERIFIED_CAPABILITIES,limitations:CURRENT_LIMITATIONS,evaluation,prompt:shortImprovementPrompt(gaps),text});
});

systemInfo.get('/model',async c=>{
  const latest=await c.env.DB.prepare('SELECT provider,model,service,metadata_json,created_at FROM api_usage WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(c.get('userId')).first<any>();
  const metadata=latest?.metadata_json?JSON.parse(latest.metadata_json):{};
  return c.json({
    current:{provider:latest?.provider||null,model:latest?.model||null,service:latest?.service||null,createdAt:latest?.created_at||null,tier:metadata.tier||null,reason:metadata.providerReason||metadata.reason||null,fallback:!!metadata.fallback},
    configured:{cloudflare:c.env.CLOUDFLARE_AI_ENABLED!=='false'?c.env.CLOUDFLARE_MODEL_FAST||'@cf/meta/llama-3.1-8b-instruct-fast':null,openaiFast:c.env.OPENAI_MODEL_FAST||c.env.OPENAI_MODEL,openaiBalanced:c.env.OPENAI_MODEL_BALANCED||c.env.OPENAI_MODEL,openaiReasoning:c.env.OPENAI_MODEL_REASONING||c.env.OPENAI_MODEL}
  });
});
