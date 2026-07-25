#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path

CAPS=("calibration","planning","transfer","code","mathematics","causality","metacognition","tool_use")
N_PER_CAP=64
N_TOTAL=512
SEVERE_REGRESSION_PP=5.0
MIN_GAIN_PP=3.0


def sha(obj):
    return hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def wilson(k,n,z=1.959963984540054):
    p=k/n; d=1+z*z/n
    c=(p+z*z/(2*n))/d
    h=z*math.sqrt((p*(1-p)+z*z/(4*n))/n)/d
    return [round(max(0,c-h)*100,3),round(min(1,c+h)*100,3)]

def severity(rate):
    if rate < .10:return "critical"
    if rate < .25:return "severe"
    if rate < .50:return "high"
    if rate < .70:return "moderate"
    return "low"

def family(cap):
    return {
      "calibration":"overconfidence_or_missing_uncertainty",
      "planning":"missing_executable_sequence_or_rollback",
      "transfer":"analogy_without_preserved_causal_structure",
      "code":"incorrect_or_unverified_implementation",
      "mathematics":"calculation_or_formal_reasoning_error",
      "causality":"association_confounding_or_falsification_error",
      "metacognition":"weak_self_check_or_revision_trigger",
      "tool_use":"unverified_tool_result_or_unsafe_sequence",
    }[cap]

def build(v41):
    score=float(v41["scorePercent"])
    global_correct=round(score*N_TOTAL/100)
    min_correct=math.floor((score+MIN_GAIN_PP)*N_TOTAL/100)+1
    by={}
    for cap in CAPS:
      rate=float(v41["byCapability"][cap]); k=round(rate*N_PER_CAP)
      by[cap]={
        "publishedRatePercent":round(rate*100,4),"estimatedCorrectFromRoundedRate":k,
        "estimatedFailures":N_PER_CAP-k,"confidenceInterval95Percent":wilson(k,N_PER_CAP),
        "severity":severity(rate),"errorFamily":family(cap),
        "curriculumPriority":round((1-rate)*({"critical":1.5,"severe":1.3,"high":1.15,"moderate":1.0,"low":.8}[severity(rate)]),6)
      }
    priorities=sorted(CAPS,key=lambda c:(-by[c]["curriculumPriority"],c))
    report={
      "schemaVersion":1,"benchmarkVersion":v41["benchmarkVersion"],"benchmarkCases":N_TOTAL,
      "hiddenSha256":v41["hiddenSha256"],"predictionsSha256":v41["predictionsSha256"],
      "champion":{"model":v41["model"],"scorePercent":score,"correct":global_correct,"failures":v41["failureCount"],"trainableFailures":v41["trainableFailureCount"]},
      "statisticalInterpretation":{"globalConfidenceInterval95Percent":wilson(global_correct,N_TOTAL),"publishedCapabilityRatesAreRounded":True,"capabilityEstimatedCountsMustNotBeSummedToReconstructGlobalScore":True},
      "byCapability":by,"priorityOrder":priorities,
      "promotionContract":{"minimumAbsoluteGainPercentagePoints":MIN_GAIN_PP,"minimumCorrectAnswers":min_correct,"minimumObservedScorePercent":round(100*min_correct/N_TOTAL,3),"minimumAdditionalCorrectVsV41":min_correct-global_correct,"requiresExactModelAttribution":True,"fallbackAllowed":False,"requiresSameHiddenSha256":v41["hiddenSha256"],"requiresMulticapabilityImprovement":True,"minimumImprovedCapabilities":2,"severeRegressionThresholdPercentagePoints":SEVERE_REGRESSION_PP,"requiresConfirmatoryReplica":True,"requiredReplicas":2},
      "candidateInventory":{"eligibleCandidates":[],"reason":"No new neural adapter/checkpoint with sealed predictions, exact attribution and confirmatory replica is present on current main."},
      "contaminationAudit":{"detected":False,"evidence":"No hidden prompts were read, copied, generated or exposed; analysis uses only aggregate sealed result and hashes.","newHiddenCasesAdded":0},
      "decision":"keep-v41",
      "nextDiscriminatingExperiment":"Evaluate the first real neural candidate on the identical sealed 512-case benchmark with deterministic decoding, exact effective-model attestation and two replicas; compare paired per-case outcomes, requiring >=16 additional correct answers, gains in >=2 capabilities and no capability regression >=5 percentage points."
    }
    report["sha256"]=sha(report)
    return report

def main():
    p=argparse.ArgumentParser();p.add_argument("--input",required=True);p.add_argument("--output",required=True);a=p.parse_args()
    v=json.loads(Path(a.input).read_text())
    assert v["hiddenSha256"] and v["predictionsSha256"] and v["model"]=="hector-asi-qwen15-v41"
    r=build(v);Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(json.dumps(r,ensure_ascii=False,indent=2,sort_keys=True)+"\n")
    print(json.dumps(r,ensure_ascii=False,sort_keys=True))
if __name__=="__main__":main()
