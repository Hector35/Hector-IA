import integration from '../../model/hector-asi/integration/stage6-integration-latest.json';
import benchmark from '../../model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json';
import {CHAT_CHAMPION} from '../lib/chat-champion';

function assert(condition:unknown,message:string):asserts condition{
 if(!condition)throw new Error(`Estado canónico de inteligencia inválido: ${message}`);
}

function buildCanonicalState(){
 const source:any=integration,benchmarkState:any=benchmark;
 assert(source.schemaVersion===2,'schemaVersion de integración');
 assert(source.champion.id===CHAT_CHAMPION.runtimeId,'campeón no coincide con el registro');
 assert(source.champion.base===CHAT_CHAMPION.baseModel,'base del campeón no coincide con el registro');
 assert(source.champion.adapterSha256===CHAT_CHAMPION.adapterSha256,'hash del adaptador no coincide');
 assert(source.champion.benchmarkScorePercent===benchmarkState.scorePercent,'score V41 no coincide con Benchmark V2');
 assert(source.benchmark.cases===benchmarkState.gates.benchmarkCases.observed,'casos Benchmark V2 inconsistentes');
 assert(source.benchmark.v41TrainableFailures===benchmarkState.trainableFailureCount,'fallos entrenables inconsistentes');
 assert(source.benchmark.hiddenSha256===benchmarkState.hiddenSha256,'hash del benchmark inconsistente');
 assert(source.benchmark.v41PredictionsSha256===benchmarkState.predictionsSha256,'hash de predicciones inconsistente');
 assert(source.benchmark.publishedFailureCount===benchmarkState.failureCount,'failureCount publicado inconsistente');
 const corpusOpen=source.data.verifiedExamples>=source.data.requiredExamples;
 const benchmarkHashOpen=source.benchmark.cases>=benchmarkState.gates.benchmarkCases.required;
 const benchmarkConsistencyOpen=Boolean(source.benchmark.aggregateConsistencyVerified);
 const failuresOpen=source.benchmark.v41TrainableFailures>=benchmarkState.gates.trainableFailures.required;
 const hardwareOpen=Boolean(source.compute.distributedGpuAllocationVerified);
 const resumeOpen=Boolean(source.compute.real397BWeightsCheckpointResumeVerified);
 const budgetValue:unknown=source.compute.explicitBudgetMxn;
 const budgetOpen=typeof budgetValue==='number'&&Number.isFinite(budgetValue)&&budgetValue>0;
 const liveAttestationOpen=Boolean(source.compute.exactLiveEndpointAttested);
 const trainingAllowed=corpusOpen&&benchmarkHashOpen&&benchmarkConsistencyOpen&&failuresOpen&&hardwareOpen&&resumeOpen&&budgetOpen&&liveAttestationOpen;
 assert(source.gates.trainingAuthorized===trainingAllowed,'trainingAuthorized inconsistente');
 return Object.freeze({
  schemaVersion:2,
  updatedAt:String(source.generatedAt),
  stage:6,
  name:'Inteligencia híbrida verificable',
  status:'active',
  models:{
   operational:{id:String(source.runtime.primaryRequested),label:'Héctor Qwen 397B',role:'cerebro principal multimodal',customWeights:false,liveExactModelAttested:liveAttestationOpen},
   fallback:{id:String(source.runtime.fallbackOrder?.[0]||'moonshotai/Kimi-K2.5'),label:'Héctor Kimi K2.5',role:'primer fallback multimodal',customWeights:false},
   lastFallback:{id:String(source.runtime.fallbackOrder?.[1]||'Cloudflare Workers AI'),label:'Workers AI',role:'último fallback operativo',customWeights:false},
   ownChampion:{id:String(source.champion.id),label:'Héctor Qwen15 v41 · pesos propios',baseModel:String(source.champion.base),customWeights:true,productionEnabled:false,benchmarkScorePercent:Number(source.champion.benchmarkScorePercent)},
   teacher:{binding:'OPENAI_MODEL_REASONING',role:'maestro, crítico y generador de datos',chatDefault:false}
  },
  pipeline:{
   corpus:{observed:Number(source.data.verifiedExamples),required:Number(source.data.requiredExamples),open:corpusOpen},
   benchmark:{observed:Number(source.benchmark.cases),required:Number(benchmarkState.gates.benchmarkCases.required),open:benchmarkHashOpen,aggregateConsistencyVerified:benchmarkConsistencyOpen},
   trainableFailures:{observed:Number(source.benchmark.v41TrainableFailures),required:Number(benchmarkState.gates.trainableFailures.required),open:failuresOpen},
   pwaHumanApproved:{observed:Number(source.data.pwaHumanApprovedObserved),required:1,open:Number(source.data.pwaHumanApprovedObserved)>=1},
   distributedHardware:{verified:hardwareOpen,open:hardwareOpen},
   persistentRemoteResume:{verified:resumeOpen,open:resumeOpen},
   explicitBudgetMxn:{value:budgetValue,open:budgetOpen},
   liveExactModelAttestation:{verified:liveAttestationOpen,open:liveAttestationOpen}
  },
  training:{targetModel:String(source.compute.targetModel),allowed:trainingAllowed,decision:trainingAllowed?'train':'do-not-train',blockingReasons:[
   !benchmarkConsistencyOpen?'benchmark aggregate semantics are inconsistent':null,
   !corpusOpen?'corpus below 10000 verified examples':null,
   !budgetOpen?'no explicit MXN ceiling':null,
   !hardwareOpen?'no allocated distributed GPU cluster':null,
   !resumeOpen?'no persistent real-model checkpoint resume proof':null,
   !liveAttestationOpen?'no live exact-model endpoint attestation':null
  ].filter((value):value is string=>Boolean(value))},
  promotion:{minimumAbsoluteBenchmarkGain:.03,requiresMultipleCapabilityGains:true,requiresReproducibleRuns:2,requiresRollback:true,rejectFallbackAttribution:true,requiresCanonicalScorerConsistency:true},
  evidence:{integrationGeneratedAt:String(source.generatedAt),benchmarkVersion:String(benchmarkState.benchmarkVersion),benchmarkSha256:String(benchmarkState.hiddenSha256),predictionsSha256:String(benchmarkState.predictionsSha256),benchmarkScorePercent:Number(benchmarkState.scorePercent),benchmarkFailureCount:Number(benchmarkState.failureCount),benchmarkAggregateConsistencyVerified:benchmarkConsistencyOpen,trainableFailureCount:Number(benchmarkState.trainableFailureCount),ownChampionArtifactId:CHAT_CHAMPION.artifactId,ownChampionAdapterSha256:CHAT_CHAMPION.adapterSha256,ownChampionPromotedAt:CHAT_CHAMPION.promotedAt},
  principle:'La interfaz sólo acredita el modelo efectivo observado. Los pesos propios no se promueven sin scorer canónico consistente, benchmark sellado, réplica, rollback y ausencia de fallback.'
 });
}

export const INTELLIGENCE_STATE=buildCanonicalState();
export function intelligenceStateSnapshot(){return INTELLIGENCE_STATE;}
