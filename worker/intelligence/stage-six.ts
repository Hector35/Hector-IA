import type {Bindings} from '../types';
import {CHAT_CHAMPION,chatChampionEvidence} from '../lib/chat-champion';
import {hasCustomModelEndpoint,hasQueuedCustomInference} from '../lib/custom-model-runtime';

export const STAGE_SIX={
  number:6,
  name:'Inteligencia híbrida autoevolutiva',
  status:'active',
  defaultReasoning:'high',
  defaultDeliberation:'force',
  targetOpenModel:'Qwen/Qwen3-8B',
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
  return{
    stage:STAGE_SIX.number,
    name:STAGE_SIX.name,
    status:STAGE_SIX.status,
    active:true,
    experienceMode:'maximum-intelligence',
    reasoning:{effort:STAGE_SIX.defaultReasoning,deliberation:STAGE_SIX.defaultDeliberation,description:'Dos soluciones independientes y una síntesis final para el chat normal.'},
    models:{
      teacher:{provider:'openai',model:env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'cerebro maestro'},
      balanced:{provider:'openai',model:env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'respaldo equilibrado'},
      fast:{provider:'openai',model:env.OPENAI_MODEL_FAST||env.OPENAI_MODEL,role:'ruta rápida disponible'},
      open:{provider:'huggingface',model:env.HECTOR_QWEN_MODEL||STAGE_SIX.targetOpenModel,role:'cerebro abierto de transición'},
      own:{...chatChampionEvidence(),label:CHAT_CHAMPION.label,role:'cerebro propio en crecimiento',mode:ownMode,enabled:env.HECTOR_CUSTOM_MODEL_ENABLED==='true'}
    },
    pipeline:[
      {id:'data',label:'Corpus verificable',target:STAGE_SIX.targets.corpusExamples,unit:'ejemplos'},
      {id:'benchmark',label:'Benchmark V2',target:STAGE_SIX.targets.hiddenBenchmarkCases,stretchTarget:STAGE_SIX.targets.hiddenBenchmarkStretch,unit:'casos ocultos'},
      {id:'failures',label:`Fallos entrenables de ${CHAT_CHAMPION.runtimeId}`,target:STAGE_SIX.targets.trainableChampionFailures,unit:'casos'},
      {id:'autonomy',label:'Autonomía del modelo propio',target:STAGE_SIX.targets.ownModelAutonomyPercent,unit:'%'}
    ],
    promotion:{minimumAbsoluteBenchmarkGain:STAGE_SIX.targets.minimumAbsoluteBenchmarkGain,requiresMultipleCapabilityGains:true,requiresReproducibility:true,requiresRollback:true},
    principle:'GPT-5.6 alta opera desde ahora; el modelo abierto y el campeón propio absorben progresivamente tareas verificadas.'
  };
}
