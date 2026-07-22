import {createExecutionPlan,type ExecutionPlan} from './execution-plan';

export type GovernorReuseKind='blocked'|'deterministic'|'assist'|'escalate';
export type GovernorCacheStatus='miss'|'hit'|'deduplicated'|'disabled';
export type GovernorInferenceTier='none'|'free'|'economy'|'advanced';

export type CallGovernorMetrics={
 policy:'free-first-v1';
 originalPlannedPasses:number;
 governedPlannedPasses:number;
 totalInferencePasses:number;
 freeInferencePasses:number;
 economyInferencePasses:number;
 advancedInferencePasses:number;
 callsAvoided:number;
 cacheStatus:GovernorCacheStatus;
 inferenceTier:GovernorInferenceTier;
 reuseKind:GovernorReuseKind;
 estimatedCostUsd:number;
 justification:string;
};
