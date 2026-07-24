#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def jsonl_count(path: Path) -> int:
    count = 0
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            json.loads(line)
            count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--train", required=True)
    parser.add_argument("--validation", required=True)
    parser.add_argument("--hidden", required=True)
    parser.add_argument("--probe", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    paths = {name: Path(getattr(args, name)) for name in ("config", "train", "validation", "hidden", "probe")}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise SystemExit(f"Missing required inputs: {missing}")

    config = json.loads(paths["config"].read_text())
    probe = json.loads(paths["probe"].read_text())
    counts = {name: jsonl_count(paths[name]) for name in ("train", "validation", "hidden")}
    profile = config["profile"]
    gates = {
        "trainExamples": counts["train"] >= 10000,
        "hiddenExamples": counts["hidden"] >= 500,
        "validationPresent": counts["validation"] > 0,
        "gpuAdmitted": bool(probe.get("admission", {}).get(profile, False)),
        "cpuTrainingForbidden": bool(probe.get("admission", {}).get("cpuTrainingForbidden", False)),
    }
    eligible = all(gates.values())
    command = [
        "python", "model/hector-asi/scale/train_qlora_main.py",
        "--config", str(paths["config"]),
        "--train", str(paths["train"]),
        "--validation", str(paths["validation"]),
        "--hidden", str(paths["hidden"]),
        "--output", f"artifacts/{profile}",
    ]
    payload = {
        "schemaVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "eligible": eligible,
        "gates": gates,
        "counts": counts,
        "sha256": {name: sha256(path) for name, path in paths.items()},
        "command": command,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"eligible": eligible, "gates": gates}, sort_keys=True))
    if not eligible:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
