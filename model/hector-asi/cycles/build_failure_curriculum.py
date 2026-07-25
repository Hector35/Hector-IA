#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CapabilityPriority:
    capability: str
    score: float
    deficit: float
    target_examples: int


def allocate_examples(scores: dict[str, float], total_examples: int) -> list[CapabilityPriority]:
    if total_examples <= 0:
        raise ValueError("total_examples must be positive")
    if not scores:
        raise ValueError("scores must not be empty")
    deficits = {name: max(0.0, 1.0 - float(score)) for name, score in scores.items()}
    total_deficit = sum(deficits.values())
    if total_deficit <= 0:
        raise ValueError("all capabilities are already perfect")

    raw = {name: total_examples * deficit / total_deficit for name, deficit in deficits.items()}
    allocated = {name: int(value) for name, value in raw.items()}
    remainder = total_examples - sum(allocated.values())
    order = sorted(raw, key=lambda name: (raw[name] - allocated[name], deficits[name], name), reverse=True)
    for name in order[:remainder]:
        allocated[name] += 1

    return sorted(
        [
            CapabilityPriority(
                capability=name,
                score=float(scores[name]),
                deficit=deficits[name],
                target_examples=allocated[name],
            )
            for name in scores
        ],
        key=lambda item: (-item.deficit, item.capability),
    )


def build_curriculum(gates: dict, total_examples: int) -> dict:
    scores = gates.get("byCapability")
    if not isinstance(scores, dict) or not scores:
        raise ValueError("missing byCapability scores")
    priorities = allocate_examples(scores, total_examples)
    weakest = priorities[:4]
    return {
        "schemaVersion": 1,
        "sourceModel": gates.get("model", "unknown"),
        "sourceBenchmarkVersion": gates.get("benchmarkVersion", "unknown"),
        "sourceScorePercent": gates.get("scorePercent"),
        "objective": "Improve measured reasoning capability through verified, failure-driven training data.",
        "totalTargetExamples": total_examples,
        "priorityCapabilities": [item.capability for item in weakest],
        "allocation": [item.__dict__ for item in priorities],
        "cycle": {
            "generate": "Create examples only for the listed capability and preserve a held-out validation split.",
            "verify": "Reject ambiguous answers, unverifiable claims, duplicates, benchmark leakage and fallback attribution.",
            "train": "Run only when corpus, compute, resume, budget and model-attribution gates are open.",
            "evaluate": "Compare against the sealed benchmark and promote only on statistically meaningful improvement without capability regressions.",
        },
        "trainingAuthorized": False,
        "authorizationReason": "This artifact prioritizes the next dataset cycle; it does not bypass existing fail-closed training gates.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gates", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--examples", type=int, default=640)
    args = parser.parse_args()

    gates = json.loads(args.gates.read_text(encoding="utf-8"))
    curriculum = build_curriculum(gates, args.examples)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(curriculum, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(curriculum, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
