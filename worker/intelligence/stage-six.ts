import type {Bindings} from '../types';
import {CHAT_CHAMPION,chatChampionEvidence} from '../lib/chat-champion';
import {hasCustomModelEndpoint,hasQueuedCustomInference} from '../lib/custom-model-runtime';
import {qwen397Status} from '../lib/qwen397-runtime';
import {kimiStatus} from '../lib/kimi-k2-runtime';

export const STAGE_SIX={
  number:6,
  name:'Inteligencia híbrida autoevolutiva',
  status:'active',
  defaultReasoning:'high',
  defaultDeliberation:'force',
  operationalOpenModel:'Qwen/Qwen3.5-397B-A17B',
  trainableOpenModel:'Qwen/Qwen3.5-397B-A17B',
  secondaryOpenModel:'moonshotai/Kimi-K2.5',
  transitionOpenModel:'Qwen/Qwen3-8B',
  targets:{
    corpusExamples:10000,
    hiddenBenchmarkCases:500,
    hiddenBenchmarkStretch:1000,
    trainableChampionFailures:100,
    ownModelAutonomyPercent:90,
    minimumAbsoluteBenchmarkGain:0.03
  }
} as const;

export function stageSixStatus(env:Bindings){
  const ownMode=hasCustomModelEndpoint(env)?'endpoint':hasQueuedCustomInference(env)?'github-actions':'artifact-only';
  const qwen397=qwen397Status(env);
  const kimi=kimiStatus(env);
  return{
    stage:STAGE_SIX.number,
    name:STAGE_SIX.name,
    status:STAGE_SIX.status,
    active:true,
    experienceMode:'maximum-intelligence',
    reasoning:{effort:STAGE_SIX.defaultReasoning,deliberation:STAGE_SIX.defaultDeliberation,description:'Qwen3.5-397B-A17B es el cerebro abierto principal y el objetivo entrenable grande. Kimi K2.5 y Workers AI funcionan como respaldos identificados.'},
    models:{
      teacher:{provider:'openai',model:env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'maestro y verificador'},
      balanced:{provider:'openai',model:env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'respaldo equilibrado'},
      fast:{provider:'openai',model:env.OPENAI_MODEL_FAST||env.OPENAI_MODEL,role:'ruta rápida disponible'},
      qwen397:{provider:'qwen-open-weights',model:qwen397.model,label:qwen397.label,role:'cerebro principal multimodal, thinking y agentivo',mode:qwen397.mode,enabled:qwen397.enabled,endpointConfigured:qwen397.endpointConfigured,totalParameters:qwen397.totalParameters,activeParameters:qwen397.activeParameters,contextLength:qwen397.contextLength,extendedContextLength:qwen397.extendedContextLength,multimodal:qwen397.multimodal,thinking:qwen397.thinking,trainable:qwen397.trainable,license:qwen397.license,reason:qwen397.reason},
      kimi:{provider:'moonshot-open-weights',model:kimi.model,label:kimi.label,role:'respaldo MoE multimodal',mode:kimi.mode,enabled:kimi.enabled,endpointConfigured:kimi.endpointConfigured,totalParameters:kimi.totalParameters,activeParameters:kimi.activeParameters,contextLength:kimi.contextLength,multimodal:kimi.multimodal,thinking:kimi.thinking,reason:kimi.reason,trainingTarget:kimi.trainingTarget},
      open:{provider:'huggingface',model:env.HECTOR_QWEN_MODEL||STAGE_SIX.transitionOpenModel,role:'fallback abierto ligero de transición'},
      own:{...chatChampionEvidence(),label:CHAT_CHAMPION.label,role:'campeón propio vigente',mode:ownMode,enabled:env.HECTOR_CUSTOM_MODEL_ENABLED==='true'}
    },
    pipeline:[
      {id:'data',label:'Corpus verificable',target:STAGE_SIX.targets.corpusExamples,unit:'ejemplos'},
      {id:'benchmark',label:'Benchmark V2',target:STAGE_SIX.targets.hiddenBenchmarkCases,stretchTarget:STAGE_SIX.targets.hiddenBenchmarkStretch,unit:'casos ocultos'},
      {id:'failures',label:`Fallos entrenables de ${CHAT_CHAMPION.runtimeId}`,target:STAGE_SIX.targets.trainableChampionFailures,unit:'casos'},
      {id:'autonomy',label:'Autonomía del modelo propio',target:STAGE_SIX.targets.ownModelAutonomyPercent,unit:'%'}
    ],
    promotion:{minimumAbsoluteBenchmarkGain:STAGE_SIX.targets.minimumAbsoluteBenchmarkGain,requiresMultipleCapabilityGains:true,requiresReproducibility:true,requiresRollback:true},
    principle:'Qwen3.5-397B-A17B mejora la PWA como cerebro principal y se conserva como fundamento entrenable abierto. Sólo se marcará activo cuando su endpoint responda; V41 permanece campeón propio hasta ser superado.'
  };
}
