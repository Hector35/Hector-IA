import type {Bindings} from '../types';
import {CHAT_CHAMPION,chatChampionEvidence} from '../lib/chat-champion';
import {hasCustomModelEndpoint,hasQueuedCustomInference} from '../lib/custom-model-runtime';
import {kimiStatus} from '../lib/kimi-k2-runtime';
import {qwen397Status} from '../lib/qwen397-runtime';
import {INTELLIGENCE_STATE,intelligenceStateSnapshot} from './intelligence-state';

export const STAGE_SIX={
 number:INTELLIGENCE_STATE.stage,
 name:INTELLIGENCE_STATE.name,
 status:INTELLIGENCE_STATE.status,
 defaultReasoning:'high',
 defaultDeliberation:'force',
 operationalOpenModel:INTELLIGENCE_STATE.models.operational.id,
 backupOpenModel:INTELLIGENCE_STATE.models.fallback.id,
 trainableOpenModel:INTELLIGENCE_STATE.training.targetModel,
 transitionOpenModel:'Qwen/Qwen3-8B',
 targets:{
  corpusExamples:INTELLIGENCE_STATE.pipeline.corpus.required,
  hiddenBenchmarkCases:INTELLIGENCE_STATE.pipeline.benchmark.required,
  hiddenBenchmarkStretch:1000,
  trainableChampionFailures:INTELLIGENCE_STATE.pipeline.trainableFailures.required,
  ownModelAutonomyPercent:90,
  minimumAbsoluteBenchmarkGain:INTELLIGENCE_STATE.promotion.minimumAbsoluteBenchmarkGain
 }
} as const;

export function stageSixStatus(env:Bindings){
 const ownMode=hasCustomModelEndpoint(env)?'endpoint':hasQueuedCustomInference(env)?'github-actions':'artifact-only',qwen=qwen397Status(env),kimi=kimiStatus(env),canonical=intelligenceStateSnapshot();
 return{
  stage:STAGE_SIX.number,name:STAGE_SIX.name,status:STAGE_SIX.status,active:true,experienceMode:'maximum-intelligence',
  reasoning:{effort:STAGE_SIX.defaultReasoning,deliberation:STAGE_SIX.defaultDeliberation,description:'Qwen 397B se solicita primero; Kimi K2.5 y Workers AI sólo son fallbacks identificados. La interfaz acredita siempre el modelo efectivo.'},
  models:{
   teacher:{provider:'openai',model:env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:INTELLIGENCE_STATE.models.teacher.role},
   balanced:{provider:'openai',model:env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'respaldo equilibrado explícito'},
   fast:{provider:'openai',model:env.OPENAI_MODEL_FAST||env.OPENAI_MODEL,role:'ruta rápida explícita'},
   qwen397:{provider:'openai-compatible-endpoint',...qwen,role:INTELLIGENCE_STATE.models.operational.role,liveExactModelAttested:INTELLIGENCE_STATE.models.operational.liveExactModelAttested},
   kimi:{provider:'moonshot-open-weights',model:kimi.model,label:kimi.label,role:INTELLIGENCE_STATE.models.fallback.role,mode:kimi.mode,enabled:kimi.enabled,endpointConfigured:kimi.endpointConfigured,totalParameters:kimi.totalParameters,activeParameters:kimi.activeParameters,contextLength:kimi.contextLength,multimodal:kimi.multimodal,thinking:kimi.thinking,reason:kimi.reason},
   open:{provider:'cloudflare-workers-ai',model:env.CLOUDFLARE_MODEL_FAST||INTELLIGENCE_STATE.models.lastFallback.id,role:INTELLIGENCE_STATE.models.lastFallback.role},
   bridge:{provider:'huggingface',model:env.HECTOR_QWEN_MODEL||STAGE_SIX.transitionOpenModel,role:'puente económico de pipeline'},
   own:{...chatChampionEvidence(),label:CHAT_CHAMPION.label,role:'campeón propio vigente',mode:ownMode,enabled:env.HECTOR_CUSTOM_MODEL_ENABLED==='true',benchmarkScorePercent:INTELLIGENCE_STATE.models.ownChampion.benchmarkScorePercent}
  },
  pipeline:[
   {id:'data',label:'Corpus verificable',observed:INTELLIGENCE_STATE.pipeline.corpus.observed,target:INTELLIGENCE_STATE.pipeline.corpus.required,open:INTELLIGENCE_STATE.pipeline.corpus.open,unit:'ejemplos'},
   {id:'benchmark',label:'Benchmark V2',observed:INTELLIGENCE_STATE.pipeline.benchmark.observed,target:INTELLIGENCE_STATE.pipeline.benchmark.required,stretchTarget:STAGE_SIX.targets.hiddenBenchmarkStretch,open:INTELLIGENCE_STATE.pipeline.benchmark.open,unit:'casos ocultos'},
   {id:'failures',label:`Fallos entrenables de ${CHAT_CHAMPION.runtimeId}`,observed:INTELLIGENCE_STATE.pipeline.trainableFailures.observed,target:INTELLIGENCE_STATE.pipeline.trainableFailures.required,open:INTELLIGENCE_STATE.pipeline.trainableFailures.open,unit:'casos'},
   {id:'autonomy',label:'Autonomía del modelo propio',observed:0,target:STAGE_SIX.targets.ownModelAutonomyPercent,open:false,unit:'%'}
  ],
  training:canonical.training,
  gates:canonical.pipeline,
  evidence:canonical.evidence,
  promotion:{minimumAbsoluteBenchmarkGain:STAGE_SIX.targets.minimumAbsoluteBenchmarkGain,requiresMultipleCapabilityGains:INTELLIGENCE_STATE.promotion.requiresMultipleCapabilityGains,requiresReproducibility:true,requiresRollback:INTELLIGENCE_STATE.promotion.requiresRollback},
  principle:INTELLIGENCE_STATE.principle
 };
}
