#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

MIN_TRAIN = 10_000
MIN_HIDDEN = 500
MIN_FAILURES = 100


def load_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def count_jsonl(path: Path) -> int:
    if not path.is_file():
        return 0
    count = 0
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Invalid JSONL at {path}:{line_number}: {exc}") from exc
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Refuse a principal training run until all canonical gates are proven.")
    parser.add_argument("--train", default="model/hector-asi/data/canonical/train.jsonl")
    parser.add_argument("--hidden", default="model/hector-asi/evals/benchmark_v2/hidden.jsonl")
    parser.add_argument("--failure-manifest", default="model/hector-asi/evals/benchmark_v2/v41_failures.json")
    parser.add_argument("--compute-probe", default="artifacts/compute-probe.json")
    parser.add_argument("--hypothesis", default="model/hector-asi/main_run/hypothesis.json")
    parser.add_argument("--output", default="artifacts/main-run-readiness.json")
    args = parser.parse_args()

    train_path = Path(args.train)
    hidden_path = Path(args.hidden)
    failures = load_json(Path(args.failure_manifest))
    compute = load_json(Path(args.compute_probe))
    hypothesis = load_json(Path(args.hypothesis))

    train_count = count_jsonl(train_path)
    hidden_count = count_jsonl(hidden_path)
    failure_count = int(failures.get("trainableFailureCount", 0))
    failure_benchmark_sha = failures.get("benchmarkSha256")
    benchmark_sha = failures.get("evaluatedBenchmarkSha256")
    contamination_checked = failures.get("trainContaminationChecked") is True
    gpu_admitted = bool(compute.get("admission", {}).get("qwen3-8b-main", False))
    resume_tested = compute.get("checkpointResumeTested") is True
    materially_distinct = hypothesis.get("materiallyDistinctFromV42V74") is True
    hypothesis_id = hypothesis.get("id")

    gates = {
        "canonicalTrainAtLeast10000": train_count >= MIN_TRAIN,
        "canonicalHiddenAtLeast500": hidden_count >= MIN_HIDDEN,
        "v41TrainableFailuresAtLeast100": failure_count >= MIN_FAILURES,
        "failureBenchmarkIdentityMatches": bool(failure_benchmark_sha and benchmark_sha and failure_benchmark_sha == benchmark_sha),
        "trainTestContaminationChecked": contamination_checked,
        "qwen3_8bGpuAdmitted": gpu_admitted,
        "checkpointResumeTested": resume_tested,
        "materiallyDistinctHypothesis": materially_distinct and bool(hypothesis_id),
    }
    eligible = all(gates.values())
    payload = {
        "schemaVersion": 1,
        "eligibleForPrincipalRun": eligible,
        "counts": {"train": train_count, "hidden": hidden_count, "trainableV41Failures": failure_count},
        "gates": gates,
        "hypothesisId": hypothesis_id,
        "decision": "RUN" if eligible else "BLOCK",
        "nextAction": next((name for name, passed in gates.items() if not passed), "dispatch principal QLoRA run"),
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(payload, sort_keys=True))
    if not eligible:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
