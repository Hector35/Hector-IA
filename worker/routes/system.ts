import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {renderSystemReport,SYSTEM_VERSION,RELEASED_AT,RELEASE_CHANGES,VERIFIED_CAPABILITIES,CURRENT_LIMITATIONS,shortImprovementPrompt} from '../intelligence/system-manifest';

export const systemInfo=new Hono<{Bindings:Bindings;Variables:Variables}>();
systemInfo.use('*',requireAuth);

systemInfo.get('/report',async c=>{
  const userId=c.get('userId');
  const latest=await c.env.DB.prepare('SELECT score,grade,gaps_json,model,created_at FROM self_evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(userId).first<any>();
  const gaps=latest?.gaps_json?JSON.parse(latest.gaps_json):[];
  return c.json({version:SYSTEM_VERSION,releasedAt:RELEASED_AT,changes:RELEASE_CHANGES,capabilities:VERIFIED_CAPABILITIES,limitations:CURRENT_LIMITATIONS,evaluation:latest?{score:latest.score,grade:latest.grade,gaps,model:latest.model,createdAt:latest.created_at}:null,prompt:shortImprovementPrompt(gaps),text:renderSystemReport(latest?.score,latest?.grade,gaps)});
});

systemInfo.get('/model',async c=>{
  const latest=await c.env.DB.prepare('SELECT provider,model,service,metadata_json,created_at FROM api_usage WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(c.get('userId')).first<any>();
  const metadata=latest?.metadata_json?JSON.parse(latest.metadata_json):{};
  return c.json({
    current:{provider:latest?.provider||null,model:latest?.model||null,service:latest?.service||null,createdAt:latest?.created_at||null,tier:metadata.tier||null,reason:metadata.providerReason||metadata.reason||null,fallback:!!metadata.fallback},
    configured:{cloudflare:c.env.CLOUDFLARE_AI_ENABLED!=='false'?c.env.CLOUDFLARE_AI_MODEL||'@cf/meta/llama-3.1-8b-instruct-fast':null,openaiFast:c.env.OPENAI_MODEL_FAST||c.env.OPENAI_MODEL,openaiBalanced:c.env.OPENAI_MODEL_BALANCED||c.env.OPENAI_MODEL,openaiReasoning:c.env.OPENAI_MODEL_REASONING||c.env.OPENAI_MODEL}
  });
});
