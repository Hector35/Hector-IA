#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def main():
    integration = load('model/hector-asi/integration/stage6-integration-latest.json')
    benchmark = load('model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json')
    champion = load('model/hector-asi/registry/chat-champion.json')
    plan = load('model/hector-asi/stage-6-plan.json')
    admission = load('model/hector-asi/scale/qwen35-397b-training-admission-v2.json')
    wrangler = load('wrangler.jsonc')

    require(integration['schemaVersion'] == 1, 'integration schemaVersion')
    require(plan['stage'] == admission['stage'] == 6, 'stage mismatch')
    require(integration['data']['remainingExamples'] == integration['data']['requiredExamples'] - integration['data']['verifiedExamples'], 'remaining corpus mismatch')
    require(integration['data']['verifiedExamples'] >= 0, 'negative corpus')

    declared_manifests = {item['path']: item for item in integration['data'].get('verifiedDatasetManifests', [])}
    for path, declared in declared_manifests.items():
        manifest_path = ROOT / path
        if manifest_path.exists():
            generated = json.loads(manifest_path.read_text(encoding='utf-8'))
            require(int(declared['count']) == int(generated['counts']['total']), f'manifest count mismatch: {path}')
            require(generated.get('containsPrivateUserData') is False, f'private data forbidden: {path}')
            require(generated.get('benchmarkExcluded') is True, f'benchmark exclusion missing: {path}')
    require(sum(int(item['count']) for item in declared_manifests.values()) <= integration['data']['verifiedExamples'], 'declared manifests exceed canonical corpus')

    operational = integration['runtime']['primaryRequested']
    own = integration['champion']
    require(operational == plan['operatingMode']['primaryRuntime'], 'operational runtime mismatch')
    require(operational == plan['operatingMode']['trainableFoundation'], 'trainable foundation mismatch')
    require(operational == admission['baseModel'], 'admission base mismatch')
    require(operational == wrangler['vars']['QWEN_397B_MODEL'], 'wrangler Qwen model mismatch')
    require(own['id'] == champion['runtimeId'], 'champion id mismatch')
    require(own['id'] == plan['operatingMode']['ownChampion'], 'plan champion mismatch')
    require(own['id'] == admission['champion'], 'admission champion mismatch')
    require(own['id'] == wrangler['vars']['HECTOR_CUSTOM_MODEL_ID'], 'wrangler champion mismatch')
    require(own['base'] == champion['baseModel'], 'champion base mismatch')
    require(own['adapterSha256'] == champion['adapterSha256'], 'champion adapter mismatch')
    require(wrangler['vars']['HECTOR_CUSTOM_MODEL_ENABLED'] == 'false', 'weak V41 must remain disabled in production')

    require(integration['benchmark']['cases'] == benchmark['gates']['benchmarkCases']['observed'], 'benchmark cases mismatch')
    require(integration['benchmark']['v41TrainableFailures'] == benchmark['trainableFailureCount'], 'trainable failures mismatch')
    require(integration['benchmark']['hiddenSha256'] == benchmark['hiddenSha256'], 'benchmark hash mismatch')
    require(integration['benchmark']['v41PredictionsSha256'] == benchmark['predictionsSha256'], 'prediction hash mismatch')
    require(own['benchmarkScorePercent'] == benchmark['scorePercent'], 'benchmark score mismatch')

    by_id = {item['id']: item for item in plan['pipeline']}
    require(by_id['data']['current'] == integration['data']['verifiedExamples'], 'plan corpus mismatch')
    require(by_id['data']['target'] == integration['data']['requiredExamples'], 'plan corpus target mismatch')
    require(by_id['benchmark']['current'] == integration['benchmark']['cases'], 'plan benchmark mismatch')
    require(by_id['failures']['current'] == integration['benchmark']['v41TrainableFailures'], 'plan failures mismatch')
    require(by_id['pwaFeedback']['current'] == integration['data']['pwaHumanApprovedObserved'], 'plan PWA feedback mismatch')

    observed = admission['observed']
    require(observed['canonicalTrainExamples'] == integration['data']['verifiedExamples'], 'admission corpus mismatch')
    require(observed['hiddenBenchmarkCases'] == integration['benchmark']['cases'], 'admission benchmark mismatch')
    require(observed['trainableChampionFailures'] == integration['benchmark']['v41TrainableFailures'], 'admission failures mismatch')
    require(observed['v41BenchmarkScorePercent'] == own['benchmarkScorePercent'], 'admission score mismatch')
    require(observed['distributedHardwareVerified'] == integration['compute']['distributedGpuAllocationVerified'], 'hardware mismatch')
    require(observed['resumeRoundTripVerified'] == integration['compute']['real397BWeightsCheckpointResumeVerified'], 'resume mismatch')
    require(observed['liveExactModelAttested'] == integration['compute']['exactLiveEndpointAttested'], 'live attestation mismatch')
    require(observed['budgetMaximumMxn'] == integration['compute']['explicitBudgetMxn'], 'budget mismatch')

    expected = {
        'data': integration['data']['verifiedExamples'] >= integration['data']['requiredExamples'],
        'benchmark': integration['benchmark']['cases'] >= benchmark['gates']['benchmarkCases']['required'],
        'failures': integration['benchmark']['v41TrainableFailures'] >= benchmark['gates']['trainableFailures']['required'],
        'hardware': integration['compute']['distributedGpuAllocationVerified'],
        'resume': integration['compute']['real397BWeightsCheckpointResumeVerified'],
        'budget': isinstance(integration['compute']['explicitBudgetMxn'], (int, float)) and integration['compute']['explicitBudgetMxn'] > 0,
        'liveExactModelAttestation': integration['compute']['exactLiveEndpointAttested'],
    }
    for key, value in expected.items():
        require(admission['gates'][key] == value, f'admission gate mismatch: {key}')

    all_required = all(expected.values()) and admission['gates']['costWithinBudget']
    require(admission['trainingAllowed'] == all_required, 'admission training decision mismatch')
    require(integration['gates']['trainingAuthorized'] == all_required, 'integration training decision mismatch')

    print(json.dumps({
        'ok': True,
        'operationalModel': operational,
        'ownChampion': own['id'],
        'verifiedExamples': integration['data']['verifiedExamples'],
        'remainingExamples': integration['data']['remainingExamples'],
        'integratedManifests': len(declared_manifests),
        'benchmarkCases': integration['benchmark']['cases'],
        'trainableFailures': integration['benchmark']['v41TrainableFailures'],
        'liveExactModelAttested': integration['compute']['exactLiveEndpointAttested'],
        'trainingAllowed': all_required,
    }, ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
