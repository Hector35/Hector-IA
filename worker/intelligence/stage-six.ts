import type {Bindings} from '../types';
import {CHAT_CHAMPION,chatChampionEvidence} from '../lib/chat-champion';
import {hasCustomModelEndpoint,hasQueuedCustomInference} from '../lib/custom-model-runtime';
import {kimiStatus} from '../lib/kimi-k2-runtime';

export const STAGE_SIX={
  number:6,
  name:'Inteligencia híbrida autoevolutiva',
  status:'active',
  defaultReasoning:'high',
  defaultDeliberation:'force',
  operationalOpenModel:'moonshotai/Kimi-K2.5',
  trainableOpenModel:'moonshotai/Kimi-K2-Base',
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

const INTEGRATED_STATUS={
  manifest:'model/hector-asi/stage-6-status.json',
  generatedAt:'2026-07-24T13:17:22-06:00',
  candidate:{id:null,status:'blocked-before-training',hypothesis:'qwen3-8b-canonical-scale-sft-v1',artifact:null},
  gates:{
    canonicalCorpus:{required:10000,current:0,candidate:2048,open:false,status:'candidate-ci-failed'},
    benchmarkV2:{required:500,current:512,stretchTarget:1000,open:true,version:'2.1.0'},
    trainableChampionFailures:{required:100,current:0,open:false,status:'pending-v41-benchmark-v2'},
    compute:{pipelineReady:true,gpuAttached:false,freeVramMiB:0,minimumFreeVramMiB:16384,resumeRoundTrip:false,open:false,status:'no-authorized-gpu-runner'}
  },
  autonomy:{measuredPercent:null,targetPercent:90,status:'not-measurable-until-v41-benchmark-v2'},
  promotion:{decision:'hold-v41',reason:'No existe candidato principal elegible bajo Benchmark V2.'},
  nextBottleneck:'Evaluar V41 una sola vez sobre Benchmark V2 y publicar al menos 100 fallos entrenables.'
} as const;

export function stageSixStatus(env:Bindings){
  const ownMode=hasCustomModelEndpoint(env)?'endpoint':hasQueuedCustomInference(env)?'github-actions':'artifact-only';
  const kimi=kimiStatus(env);
  return{
    stage:STAGE_SIX.number,
    name:STAGE_SIX.name,
    status:STAGE_SIX.status,
    active:true,
    experienceMode:'maximum-intelligence',
    reasoning:{effort:STAGE_SIX.defaultReasoning,deliberation:STAGE_SIX.defaultDeliberation,description:'Kimi K2.5 es el cerebro abierto operativo; cualquier fallback se identifica. Kimi K2 Base queda separado como objetivo de entrenamiento propio.'},
    models:{
      teacher:{provider:'openai',model:env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'maestro y verificador'},
      balanced:{provider:'openai',model:env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,role:'respaldo equilibrado'},
      fast:{provider:'openai',model:env.OPENAI_MODEL_FAST||env.OPENAI_MODEL,role:'ruta rápida disponible'},
      kimi:{provider:'moonshot-open-weights',model:kimi.model,label:kimi.label,role:'cerebro operativo multimodal y agentivo',mode:kimi.mode,enabled:kimi.enabled,endpointConfigured:kimi.endpointConfigured,totalParameters:kimi.totalParameters,activeParameters:kimi.activeParameters,contextLength:kimi.contextLength,multimodal:kimi.multimodal,thinking:kimi.thinking,reason:kimi.reason,trainingTarget:kimi.trainingTarget},
      open:{provider:'huggingface',model:env.HECTOR_QWEN_MODEL||STAGE_SIX.transitionOpenModel,role:'base abierta inmediata para el siguiente entrenamiento principal'},
      own:{...chatChampionEvidence(),label:CHAT_CHAMPION.label,role:'campeón propio vigente',mode:ownMode,enabled:env.HECTOR_CUSTOM_MODEL_ENABLED==='true'}
    },
    pipeline:[
      {id:'data',label:'Corpus verificable',target:STAGE_SIX.targets.corpusExamples,current:INTEGRATED_STATUS.gates.canonicalCorpus.current,candidate:INTEGRATED_STATUS.gates.canonicalCorpus.candidate,open:INTEGRATED_STATUS.gates.canonicalCorpus.open,status:INTEGRATED_STATUS.gates.canonicalCorpus.status,unit:'ejemplos'},
      {id:'benchmark',label:'Benchmark V2',target:STAGE_SIX.targets.hiddenBenchmarkCases,current:INTEGRATED_STATUS.gates.benchmarkV2.current,stretchTarget:STAGE_SIX.targets.hiddenBenchmarkStretch,open:INTEGRATED_STATUS.gates.benchmarkV2.open,status:'sealed',unit:'casos ocultos'},
      {id:'failures',label:`Fallos entrenables de ${CHAT_CHAMPION.runtimeId}`,target:STAGE_SIX.targets.trainableChampionFailures,current:INTEGRATED_STATUS.gates.trainableChampionFailures.current,open:INTEGRATED_STATUS.gates.trainableChampionFailures.open,status:INTEGRATED_STATUS.gates.trainableChampionFailures.status,unit:'casos'},
      {id:'compute',label:'Cómputo GPU y reanudación',target:INTEGRATED_STATUS.gates.compute.minimumFreeVramMiB,current:INTEGRATED_STATUS.gates.compute.freeVramMiB,open:INTEGRATED_STATUS.gates.compute.open,status:INTEGRATED_STATUS.gates.compute.status,unit:'MiB VRAM libre'},
      {id:'autonomy',label:'Autonomía del modelo propio',target:STAGE_SIX.targets.ownModelAutonomyPercent,current:INTEGRATED_STATUS.autonomy.measuredPercent,open:false,status:INTEGRATED_STATUS.autonomy.status,unit:'%'}
    ],
    gates:INTEGRATED_STATUS.gates,
    candidate:INTEGRATED_STATUS.candidate,
    champion:{runtimeId:CHAT_CHAMPION.runtimeId,label:CHAT_CHAMPION.label,decision:INTEGRATED_STATUS.promotion.decision,reason:INTEGRATED_STATUS.promotion.reason},
    autonomy:INTEGRATED_STATUS.autonomy,
    compute:INTEGRATED_STATUS.gates.compute,
    manifest:INTEGRATED_STATUS.manifest,
    generatedAt:INTEGRATED_STATUS.generatedAt,
    nextBottleneck:INTEGRATED_STATUS.nextBottleneck,
    promotion:{minimumAbsoluteBenchmarkGain:STAGE_SIX.targets.minimumAbsoluteBenchmarkGain,requiresMultipleCapabilityGains:true,requiresReproducibility:true,requiresRollback:true},
    principle:'V41 permanece campeón. No se abre una nueva Vxx hasta que corpus, fallos entrenables, GPU y reanudación estén abiertos; Benchmark V2 ya cumple 512/500.'
  };
}
