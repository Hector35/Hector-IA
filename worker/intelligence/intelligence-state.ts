import rawState from '../../model/hector-asi/intelligence-state.json';
import benchmark from '../../model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json';
import {CHAT_CHAMPION} from '../lib/chat-champion';

export type CanonicalIntelligenceState=typeof rawState;

function assert(condition:unknown,message:string):asserts condition{
 if(!condition)throw new Error(`Estado canónico de inteligencia inválido: ${message}`);
}

function validateState(state:CanonicalIntelligenceState){
 assert(state.schemaVersion===1,'schemaVersion');
 assert(state.stage===6,'stage');
 assert(state.models.ownChampion.id===CHAT_CHAMPION.runtimeId,'ownChampion.id no coincide con el registro');
 assert(state.models.ownChampion.baseModel===CHAT_CHAMPION.baseModel,'ownChampion.baseModel no coincide con el registro');
 assert(state.models.ownChampion.benchmarkScorePercent===benchmark.scorePercent,'score V41 no coincide con Benchmark V2');
 assert(state.pipeline.benchmark.observed===benchmark.gates.benchmarkCases.observed,'casos Benchmark V2 inconsistentes');
 assert(state.pipeline.trainableFailures.observed===benchmark.trainableFailureCount,'fallos entrenables inconsistentes');
 assert(state.pipeline.corpus.open===state.pipeline.corpus.observed>=state.pipeline.corpus.required,'puerta de corpus inconsistente');
 assert(state.pipeline.benchmark.open===state.pipeline.benchmark.observed>=state.pipeline.benchmark.required,'puerta de benchmark inconsistente');
 assert(state.pipeline.trainableFailures.open===state.pipeline.trainableFailures.observed>=state.pipeline.trainableFailures.required,'puerta de fallos inconsistente');
 const allTrainingGates=[state.pipeline.corpus.open,state.pipeline.benchmark.open,state.pipeline.trainableFailures.open,state.pipeline.distributedHardware.open,state.pipeline.persistentRemoteResume.open,state.pipeline.explicitBudgetMxn.open,state.pipeline.liveExactModelAttestation.open];
 assert(state.training.allowed===allTrainingGates.every(Boolean),'training.allowed no coincide con las puertas');
 return Object.freeze(state);
}

export const INTELLIGENCE_STATE=validateState(rawState);

export function intelligenceStateSnapshot(){
 return{
  ...INTELLIGENCE_STATE,
  evidence:{
   benchmarkVersion:benchmark.benchmarkVersion,
   benchmarkSha256:benchmark.hiddenSha256,
   predictionsSha256:benchmark.predictionsSha256,
   benchmarkScorePercent:benchmark.scorePercent,
   benchmarkFailureCount:benchmark.failureCount,
   trainableFailureCount:benchmark.trainableFailureCount,
   ownChampionArtifactId:CHAT_CHAMPION.artifactId,
   ownChampionAdapterSha256:CHAT_CHAMPION.adapterSha256,
   ownChampionPromotedAt:CHAT_CHAMPION.promotedAt
  }
 };
}
