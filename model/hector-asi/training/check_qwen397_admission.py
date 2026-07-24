#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: Path) -> dict:
    if not path.is_file():
        raise SystemExit(f"missing required manifest: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Fail-closed admission gate for Qwen3.5-397B-A17B training")
    parser.add_argument("--admission", default="model/hector-asi/training/qwen397-admission.json")
    parser.add_argument("--compute", default="model/hector-asi/scale/compute-status.json")
    parser.add_argument("--output")
    parser.add_argument("--require-open", action="store_true")
    args = parser.parse_args()

    admission = load(Path(args.admission))
    compute = load(Path(args.compute))
    gates = admission.get("gates", {})

    checks = {
        "correctModel": admission.get("candidateBase") == "Qwen/Qwen3.5-397B-A17B",
        "licenseApproved": admission.get("modelFacts", {}).get("license") == "Apache-2.0",
        "cpuTrainingForbidden": compute.get("cpuTrainingForbidden") is True,
        "allAdmissionGatesOpen": bool(gates) and all(item.get("open") is True for item in gates.values()),
        "immutableInputs": all(admission.get("modelFacts", {}).get(key) is True for key in (
            "revisionPinned", "tokenizerHashPinned", "modelIndexHashPinned"
        )),
        "artifactAbsentWhileBlocked": admission.get("status") != "blocked" or admission.get("artifact") is None,
        "noFalsePromotion": admission.get("status") != "blocked" or admission.get("promotion") == "rejected-no-candidate",
    }
    eligible = all(checks.values())
    report = {
        "schemaVersion": 1,
        "candidateBase": admission.get("candidateBase"),
        "eligible": eligible,
        "decision": "admit-training" if eligible else "do-not-train",
        "checks": checks,
        "closedGates": [name for name, item in gates.items() if item.get("open") is not True],
        "observed": {name: item.get("observed") for name, item in gates.items()},
    }

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))

    if args.require_open and not eligible:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
