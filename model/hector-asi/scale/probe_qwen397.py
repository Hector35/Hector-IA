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


def run(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT, timeout=20).strip()
    except Exception:
        return None


def gpu_inventory() -> list[dict[str, object]]:
    raw = run([
        "nvidia-smi",
        "--query-gpu=index,name,memory.total,memory.free,driver_version",
        "--format=csv,noheader,nounits",
    ])
    if not raw:
        return []
    rows: list[dict[str, object]] = []
    for line in raw.splitlines():
        parts = [item.strip() for item in line.split(",")]
        if len(parts) != 5:
            continue
        index, name, total, free, driver = parts
        rows.append({
            "index": int(index),
            "name": name,
            "memoryTotalMiB": int(total),
            "memoryFreeMiB": int(free),
            "driver": driver,
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    gpus = gpu_inventory()
    disk = shutil.disk_usage(Path.cwd())
    aggregate_total_gib = round(sum(int(gpu["memoryTotalMiB"]) for gpu in gpus) / 1024, 2)
    aggregate_free_gib = round(sum(int(gpu["memoryFreeMiB"]) for gpu in gpus) / 1024, 2)
    names = sorted({str(gpu["name"]) for gpu in gpus})

    system_ram_gib = None
    try:
        import psutil  # type: ignore
        system_ram_gib = round(psutil.virtual_memory().total / 1024**3, 2)
    except Exception:
        pass

    payload = {
        "schemaVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "targetModel": "Qwen/Qwen3.5-397B-A17B",
        "host": {
            "platform": platform.platform(),
            "cpuCount": os.cpu_count(),
            "systemRamGiB": system_ram_gib,
            "freeStorageGiB": round(disk.free / 1024**3, 2),
        },
        "cuda": {
            "nvidiaSmi": run(["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"]),
            "nvcc": run(["nvcc", "--version"]),
            "gpuCount": len(gpus),
            "gpuModels": names,
            "aggregateTotalVramGiB": aggregate_total_gib,
            "aggregateFreeVramGiB": aggregate_free_gib,
            "gpus": gpus,
        },
        "fabric": {
            "nvidiaTopo": run(["nvidia-smi", "topo", "-m"]),
            "infinibandDevices": run(["bash", "-lc", "ls /sys/class/infiniband 2>/dev/null | tr '\n' ' '"]),
        },
        "admission": {
            "officialEightGpuShape": len(gpus) >= 8,
            "aggregateVram640GiB": aggregate_free_gib >= 640,
            "persistentStorage1200GiB": disk.free >= 1200 * 1024**3,
            "systemRam512GiB": system_ram_gib is not None and system_ram_gib >= 512,
            "cpuTrainingForbidden": True,
        },
    }
    payload["eligibleForEndpointSmoke"] = all([
        payload["admission"]["officialEightGpuShape"],
        payload["admission"]["aggregateVram640GiB"],
        payload["admission"]["persistentStorage1200GiB"],
    ])

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"eligibleForEndpointSmoke": payload["eligibleForEndpointSmoke"], "admission": payload["admission"]}, sort_keys=True))


if __name__ == "__main__":
    main()
