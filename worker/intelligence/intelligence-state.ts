import integration from '../../model/hector-asi/integration/stage6-integration-latest.json';
import benchmark from '../../model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json';
import {CHAT_CHAMPION} from '../lib/chat-champion';

function assert(condition:unknown,message:string):asserts condition{
 if(!condition)throw new Error(`Estado canónico de inteligencia inválido: ${message}`);
}

function buildCanonicalState(){
 assert(integration.schemaVersion===1,'schemaVersion de integración');
 assert(integration.champion.id===CHAT_CHAMPION.runtimeId,'campeón no coincide con el registro');
 assert(integration.champion.base===CHAT_CHAMPION.baseModel,'base del campeón no coincide con el registro');
 assert(integration.champion.adapterSha256===CHAT_CHAMPION.adapterSha256,'hash del adaptador no coincide');
 assert(integration.champion.benchmarkScorePercent===benchmark.scorePercent,'score V41 no coincide con Benchmark V2');
 assert(integration.benchmark.cases===benchmark.gates.benchmarkCases.observed,'casos Benchmark V2 inconsistentes');
 assert(integration.benchmark.v41TrainableFailures===benchmark.trainableFailureCount,'fallos entrenables inconsistentes');
 assert(integration.benchmark.hiddenSha256===benchmark.hiddenSha256,'hash del benchmark inconsistente');
 assert(integration.benchmark.v41PredictionsSha256===benchmark.predictionsSha256,'hash de predicciones inconsistente');
 const corpusOpen=integration.data.verifiedExamples>=integration.data.requiredExamples;
 const benchmarkOpen=integration.benchmark.cases>=benchmark.gates.benchmarkCases.required;
 const failuresOpen=integration.benchmark.v41TrainableFailures>=benchmark.gates.trainableFailures.required;
 const hardwareOpen=integration.compute.distributedGpuAllocationVerified;
 const resumeOpen=integration.compute.real397BWeightsCheckpointResumeVerified;
 const budgetOpen=typeof integration.compute.explicitBudgetMxn==='number'&&integration.compute.explicitBudgetMxn>0;
 const liveAttestationOpen=integration.compute.exactLiveEndpointAttested;
 const trainingAllowed=corpusOpen&&benchmarkOpen&&failuresOpen&&hardwareOpen&&resumeOpen&&budgetOpen&&liveAttestationOpen;
 assert(integration.gates.trainingAuthorized===trainingAllowed,'trainingAuthorized inconsistente');
 return Object.freeze({
  schemaVersion:1,
  updatedAt:integration.generatedAt,
  stage:6,
  name:'Inteligencia híbrida verificable',
  status:'active',
  models:{
   operational:{id:integration.runtime.primaryRequested,label:'Héctor Qwen 397B',role:'cerebro principal multimodal',customWeights:false,liveExactModelAttested:integration.compute.exactLiveEndpointAttested},
   fallback:{id:integration.runtime.fallbackOrder[0],label:'Héctor Kimi K2.5',role:'primer fallback multimodal',customWeights:false},
   lastFallback:{id:integration.runtime.fallbackOrder[1],label:'Workers AI',role:'último fallback operativo',customWeights:false},
   ownChampion:{id:integration.champion.id,label:'Héctor Qwen15 v41 · pesos propios',baseModel:integration.champion.base,customWeights:true,productionEnabled:false,benchmarkScorePercent:integration.champion.benchmarkScorePercent},
   teacher:{binding:'OPENAI_MODEL_REASONING',role:'maestro, crítico y generador de datos',chatDefault:false}
  },
  pipeline:{
   corpus:{observed:integration.data.verifiedExamples,required:integration.data.requiredExamples,open:corpusOpen},
   benchmark:{observed:integration.benchmark.cases,required:benchmark.gates.benchmarkCases.required,open:benchmarkOpen},
   trainableFailures:{observed:integration.benchmark.v41TrainableFailures,required:benchmark.gates.trainableFailures.required,open:failuresOpen},
   pwaHumanApproved:{observed:integration.data.pwaHumanApprovedObserved,required:1,open:integration.data.pwaHumanApprovedObserved>=1},
   distributedHardware:{verified:hardwareOpen,open:hardwareOpen},
   persistentRemoteResume:{verified:resumeOpen,open:resumeOpen},
   explicitBudgetMxn:{value:integration.compute.explicitBudgetMxn,open:budgetOpen},
   liveExactModelAttestation:{verified:liveAttestationOpen,open:liveAttestationOpen}
  },
  training:{targetModel:integration.compute.targetModel,allowed:trainingAllowed,decision:trainingAllowed?'train':'do-not-train',blockingReasons:[
   !corpusOpen?'corpus below 10000 verified examples':null,
   !budgetOpen?'no explicit MXN ceiling':null,
   !hardwareOpen?'no allocated distributed GPU cluster':null,
   !resumeOpen?'no persistent real-model checkpoint resume proof':null,
   !liveAttestationOpen?'no live exact-model endpoint attestation':null
  ].filter((value):value is string=>Boolean(value))},
  promotion:{minimumAbsoluteBenchmarkGain:.03,requiresMultipleCapabilityGains:true,requiresReproducibleRuns:2,requiresRollback:true,rejectFallbackAttribution:true},
  evidence:{integrationGeneratedAt:integration.generatedAt,benchmarkVersion:benchmark.benchmarkVersion,benchmarkSha256:benchmark.hiddenSha256,predictionsSha256:benchmark.predictionsSha256,benchmarkScorePercent:benchmark.scorePercent,benchmarkFailureCount:benchmark.failureCount,trainableFailureCount:benchmark.trainableFailureCount,ownChampionArtifactId:CHAT_CHAMPION.artifactId,ownChampionAdapterSha256:CHAT_CHAMPION.adapterSha256,ownChampionPromotedAt:CHAT_CHAMPION.promotedAt},
  principle:'La interfaz sólo acredita el modelo efectivo observado. Los pesos propios no se promueven sin benchmark sellado, réplica, rollback y ausencia de fallback.'
 });
}

export const INTELLIGENCE_STATE=buildCanonicalState();
export function intelligenceStateSnapshot(){return INTELLIGENCE_STATE;}
