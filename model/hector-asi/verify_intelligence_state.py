#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def main():
    state = load("model/hector-asi/intelligence-state.json")
    benchmark = load("model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json")
    champion = load("model/hector-asi/registry/chat-champion.json")
    plan = load("model/hector-asi/stage-6-plan.json")
    admission = load("model/hector-asi/scale/qwen35-397b-training-admission-v2.json")
    wrangler = load("wrangler.jsonc")

    require(state["schemaVersion"] == 1, "canonical schemaVersion")
    require(state["stage"] == plan["stage"] == admission["stage"] == 6, "stage mismatch")

    operational = state["models"]["operational"]["id"]
    own = state["models"]["ownChampion"]
    require(operational == plan["operatingMode"]["operationalOpenRuntime"], "operational runtime mismatch")
    require(operational == admission["baseModel"], "training base mismatch")
    require(operational == wrangler["vars"]["QWEN_397B_MODEL"], "wrangler Qwen model mismatch")
    require(own["id"] == champion["runtimeId"], "champion id mismatch")
    require(own["id"] == plan["operatingMode"]["ownChampion"], "plan champion mismatch")
    require(own["id"] == admission["champion"], "admission champion mismatch")
    require(own["id"] == wrangler["vars"]["HECTOR_CUSTOM_MODEL_ID"], "wrangler champion mismatch")
    require(own["baseModel"] == champion["baseModel"], "champion base mismatch")
    require(bool(own["productionEnabled"]) == (wrangler["vars"]["HECTOR_CUSTOM_MODEL_ENABLED"] == "true"), "custom production flag mismatch")

    pipeline = state["pipeline"]
    require(pipeline["benchmark"]["observed"] == benchmark["gates"]["benchmarkCases"]["observed"], "benchmark cases mismatch")
    require(pipeline["trainableFailures"]["observed"] == benchmark["trainableFailureCount"], "trainable failures mismatch")
    require(own["benchmarkScorePercent"] == benchmark["scorePercent"], "benchmark score mismatch")

    by_id = {item["id"]: item for item in plan["pipeline"]}
    require(by_id["data"]["observed"] == pipeline["corpus"]["observed"], "plan corpus observed mismatch")
    require(by_id["data"]["target"] == pipeline["corpus"]["required"], "plan corpus target mismatch")
    require(by_id["benchmark"]["observed"] == pipeline["benchmark"]["observed"], "plan benchmark observed mismatch")
    require(by_id["failures"]["observed"] == pipeline["trainableFailures"]["observed"], "plan failures observed mismatch")

    observed = admission["observed"]
    require(observed["canonicalTrainExamples"] == pipeline["corpus"]["observed"], "admission corpus mismatch")
    require(observed["hiddenBenchmarkCases"] == pipeline["benchmark"]["observed"], "admission benchmark mismatch")
    require(observed["trainableChampionFailures"] == pipeline["trainableFailures"]["observed"], "admission failures mismatch")
    require(observed["v41BenchmarkScorePercent"] == own["benchmarkScorePercent"], "admission score mismatch")
    require(observed["liveExactModelAttested"] == state["models"]["operational"]["liveExactModelAttested"], "live attestation mismatch")

    expected = {
        "data": pipeline["corpus"]["open"],
        "benchmark": pipeline["benchmark"]["open"],
        "failures": pipeline["trainableFailures"]["open"],
        "hardware": pipeline["distributedHardware"]["open"],
        "resume": pipeline["persistentRemoteResume"]["open"],
        "budget": pipeline["explicitBudgetMxn"]["open"],
        "liveExactModelAttestation": pipeline["liveExactModelAttestation"]["open"],
    }
    for key, value in expected.items():
        require(admission["gates"][key] == value, f"admission gate mismatch: {key}")

    all_required = all(expected.values()) and admission["gates"]["costWithinBudget"]
    require(state["training"]["allowed"] == all_required, "canonical training decision mismatch")
    require(admission["trainingAllowed"] == all_required, "admission training decision mismatch")

    print(json.dumps({
        "ok": True,
        "stage": state["stage"],
        "operationalModel": operational,
        "ownChampion": own["id"],
        "corpus": pipeline["corpus"],
        "benchmark": pipeline["benchmark"],
        "trainableFailures": pipeline["trainableFailures"],
        "trainingAllowed": all_required,
    }, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
