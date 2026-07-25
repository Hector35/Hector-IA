import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {SYSTEM_VERSION,RELEASED_AT,RELEASE_CHANGES,VERIFIED_CAPABILITIES,CURRENT_LIMITATIONS,shortImprovementPrompt} from '../intelligence/system-manifest';
import {renderEvidenceSelfAnalysis} from '../intelligence/self-report';
import {stageSixStatus} from '../intelligence/stage-six';
import {buildSystemQualityReport,emptyQualityMetrics,type QualityMetrics} from '../intelligence/system-quality';

export const systemInfo=new Hono<{Bindings:Bindings;Variables:Variables}>();
systemInfo.use('*',requireAuth);

async function loadQualityMetrics(db:D1Database,userId:string):Promise<QualityMetrics>{
 const empty=emptyQualityMetrics();
 try{
  const [responses,work,memory,budget,cost,attestation]=await Promise.all([
   db.prepare(`SELECT COUNT(*) samples,COALESCE(AVG(quality_score),0) average_quality,COALESCE(AVG(CASE WHEN quality_accepted=1 THEN 1.0 ELSE 0 END),0) accepted_rate,COALESCE(AVG(CASE WHEN fallback=1 THEN 1.0 ELSE 0 END),0) fallback_rate FROM response_traces WHERE user_id=? AND created_at>=datetime('now','-30 days')`).bind(userId).first<any>(),
   db.prepare(`SELECT COUNT(*) samples,COALESCE(AVG(CASE WHEN status='completed' THEN 1.0 ELSE 0 END),0) success_rate FROM work_jobs WHERE user_id=? AND created_at>=datetime('now','-30 days')`).bind(userId).first<any>(),
   db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN source='response-feedback' OR kind='correction' THEN 1 ELSE 0 END) corrections FROM memories WHERE user_id=?`).bind(userId).first<any>(),
   db.prepare('SELECT enforcement_mode FROM cognitive_budgets WHERE user_id=?').bind(userId).first<any>(),
   db.prepare(`SELECT COALESCE(SUM(estimated_cost_usd),0) cost FROM api_usage WHERE user_id=? AND created_at>=datetime('now','-30 days')`).bind(userId).first<any>(),
   db.prepare("SELECT metadata_json FROM api_usage WHERE user_id=? AND service='qwen397-live-probe' ORDER BY created_at DESC LIMIT 1").bind(userId).first<any>()
  ]);
  let live=false;try{live=JSON.parse(String(attestation?.metadata_json||'{}')).attested===true;}catch{}
  return{
   responseSamples:Number(responses?.samples||0),averageQuality:Number(responses?.average_quality||0),acceptedRate:Number(responses?.accepted_rate||0),fallbackRate:Number(responses?.fallback_rate||0),
   workSamples:Number(work?.samples||0),workSuccessRate:Number(work?.success_rate||0),memoryCount:Number(memory?.total||0),correctionCount:Number(memory?.corrections||0),
   budgetMode:budget?.enforcement_mode?String(budget.enforcement_mode):null,recentCostUsd:Number(cost?.cost||0),liveExactModelAttested:live
  };
 }catch{return empty;}
}

systemInfo.get('/stage-6',c=>c.json(stageSixStatus(c.env)));
systemInfo.get('/quality',async c=>c.json(buildSystemQualityReport(await loadQualityMetrics(c.env.DB,c.get('userId')))));

systemInfo.get('/report',async c=>{
  const userId=c.get('userId');
  const [latest,promptRow,quality]=await Promise.all([
    c.env.DB.prepare('SELECT score,grade,strengths_json,gaps_json,tests_json,model,latency_ms,created_at FROM self_evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(userId).first<any>(),
    c.env.DB.prepare("SELECT prompt FROM improvement_prompts WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(userId).first<any>(),
    loadQualityMetrics(c.env.DB,userId).then(buildSystemQualityReport)
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
  return c.json({version:SYSTEM_VERSION,releasedAt:RELEASED_AT,changes:RELEASE_CHANGES,capabilities:VERIFIED_CAPABILITIES,limitations:CURRENT_LIMITATIONS,evaluation,prompt:shortImprovementPrompt(gaps),stageSix:stageSixStatus(c.env),quality,text});
});

systemInfo.get('/model',async c=>{
  const latest=await c.env.DB.prepare('SELECT provider,model,service,metadata_json,created_at FROM api_usage WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(c.get('userId')).first<any>();
  const metadata=latest?.metadata_json?JSON.parse(latest.metadata_json):{};
  return c.json({
    current:{provider:latest?.provider||null,model:latest?.model||null,service:latest?.service||null,createdAt:latest?.created_at||null,tier:metadata.tier||null,reason:metadata.providerReason||metadata.reason||null,fallback:!!metadata.fallback},
    configured:{cloudflare:c.env.CLOUDFLARE_AI_ENABLED!=='false'?c.env.CLOUDFLARE_MODEL_FAST||'@cf/meta/llama-3.1-8b-instruct-fast':null,openaiFast:c.env.OPENAI_MODEL_FAST||c.env.OPENAI_MODEL,openaiBalanced:c.env.OPENAI_MODEL_BALANCED||c.env.OPENAI_MODEL,openaiReasoning:c.env.OPENAI_MODEL_REASONING||c.env.OPENAI_MODEL},
    stageSix:stageSixStatus(c.env)
  });
});
