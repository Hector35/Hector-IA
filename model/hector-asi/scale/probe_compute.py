#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def command(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT, timeout=20).strip()
    except Exception:
        return None


def gpu_info() -> list[dict[str, object]]:
    raw = command([
        "nvidia-smi",
        "--query-gpu=name,memory.total,memory.free,driver_version",
        "--format=csv,noheader,nounits",
    ])
    if not raw:
        return []
    result = []
    for index, line in enumerate(raw.splitlines()):
        fields = [part.strip() for part in line.split(",")]
        if len(fields) != 4:
            continue
        name, total, free, driver = fields
        result.append({
            "index": index,
            "name": name,
            "memoryTotalMiB": int(total),
            "memoryFreeMiB": int(free),
            "driver": driver,
        })
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    disk = shutil.disk_usage(Path.cwd())
    gpus = gpu_info()
    payload = {
        "schemaVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "host": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "cpuCount": os.cpu_count(),
            "ramTotalBytes": None,
            "diskFreeBytes": disk.free,
        },
        "cuda": {
            "nvidiaSmi": command(["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"]),
            "nvcc": command(["nvcc", "--version"]),
            "gpus": gpus,
        },
        "admission": {
            "qwen3-8b-main": any(int(gpu["memoryFreeMiB"]) >= 16384 for gpu in gpus),
            "qwen3-14b-main": any(int(gpu["memoryFreeMiB"]) >= 24576 for gpu in gpus),
            "cpuTrainingForbidden": True,
        },
    }
    try:
        import psutil  # type: ignore
        payload["host"]["ramTotalBytes"] = psutil.virtual_memory().total
    except Exception:
        pass
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(json.dumps(payload["admission"], sort_keys=True))


if __name__ == "__main__":
    main()
