import type {Bindings} from '../types';
import {CHAT_CHAMPION,chatChampionEvidence} from '../lib/chat-champion';
import {hasCustomModelEndpoint,hasQueuedCustomInference} from '../lib/custom-model-runtime';
import {kimiK2Status} from '../lib/kimi-k2-runtime';

export const STAGE_SIX={
  number:6,
  name:'Inteligencia híbrida autoevolutiva',
  status:'active',
  defaultReasoning:'high',
  defaultDeliberation:'force',
  targetOpenModel:'moonshotai/Kimi-K2-Base',
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
  const kimi=kimiK2Status(env);
  return{
    stage:STAGE_SIX.number,
    name:STAGE_SIX.name,
    status:STAGE_SIX.status,
    active:true,
    experienceMode:'maximum-intelligence',
    reasoning:{effort:STAGE_SIX.defaultReasoning,deliberation:STAGE_SIX.defaultDeliberation,description:'Kimi K2 Base es el objetivo abierto del chat; las respuestas identifican cualquier fallback mientras se conecta el endpoint GPU.'},
    models:{
      teacher:{provider:'openai',model:env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'cerebro maestro'},
      balanced:{provider:'openai',model:env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'respaldo equilibrado'},
      fast:{provider:'openai',model:env.OPENAI_MODEL_FAST||env.OPENAI_MODEL,role:'ruta rápida disponible'},
      kimi:{provider:'moonshot-open-weights',model:kimi.model,label:kimi.label,role:'base MoE principal',mode:kimi.mode,enabled:kimi.enabled,endpointConfigured:kimi.endpointConfigured,totalParameters:kimi.totalParameters,activeParameters:kimi.activeParameters,reason:kimi.reason},
      open:{provider:'huggingface',model:env.HECTOR_QWEN_MODEL||STAGE_SIX.transitionOpenModel,role:'fallback abierto de transición'},
      own:{...chatChampionEvidence(),label:CHAT_CHAMPION.label,role:'cerebro propio en crecimiento',mode:ownMode,enabled:env.HECTOR_CUSTOM_MODEL_ENABLED==='true'}
    },
    pipeline:[
      {id:'data',label:'Corpus verificable',target:STAGE_SIX.targets.corpusExamples,unit:'ejemplos'},
      {id:'benchmark',label:'Benchmark V2',target:STAGE_SIX.targets.hiddenBenchmarkCases,stretchTarget:STAGE_SIX.targets.hiddenBenchmarkStretch,unit:'casos ocultos'},
      {id:'failures',label:`Fallos entrenables de ${CHAT_CHAMPION.runtimeId}`,target:STAGE_SIX.targets.trainableChampionFailures,unit:'casos'},
      {id:'autonomy',label:'Autonomía del modelo propio',target:STAGE_SIX.targets.ownModelAutonomyPercent,unit:'%'}
    ],
    promotion:{minimumAbsoluteBenchmarkGain:STAGE_SIX.targets.minimumAbsoluteBenchmarkGain,requiresMultipleCapabilityGains:true,requiresReproducibility:true,requiresRollback:true},
    principle:'Kimi K2 Base es la base MoE objetivo de 1T parámetros; Héctor solo afirmará usarla cuando el endpoint GPU esté conectado y verificado.'
  };
}
