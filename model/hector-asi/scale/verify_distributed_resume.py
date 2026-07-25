#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

TARGET_MODEL = "Qwen/Qwen3.5-397B-A17B"
TOTAL_PARAMETERS = 397_000_000_000
ACTIVE_PARAMETERS = 17_000_000_000


def sha(value: object) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def gib(bytes_value: float) -> float:
    return round(bytes_value / (1024 ** 3), 2)


def memory_profile(bits: int, trainable_fraction: float, optimizer_bytes_per_trainable: int = 8) -> dict:
    if bits not in (4, 8, 16):
        raise ValueError("bits must be one of 4, 8, 16")
    if not 0 <= trainable_fraction <= 1:
        raise ValueError("trainable_fraction must be in [0,1]")
    weights = TOTAL_PARAMETERS * bits / 8
    trainable = TOTAL_PARAMETERS * trainable_fraction
    gradients = trainable * 2
    optimizer = trainable * optimizer_bytes_per_trainable
    runtime_reserve = weights * 0.20
    total = weights + gradients + optimizer + runtime_reserve
    return {
        "bits": bits,
        "trainableFraction": trainable_fraction,
        "weightsGiB": gib(weights),
        "gradientsGiB": gib(gradients),
        "optimizerGiB": gib(optimizer),
        "runtimeReserveGiB": gib(runtime_reserve),
        "estimatedTotalGiB": gib(total),
    }


def hardware_profiles(required_gib: float) -> list[dict]:
    profiles = [
        ("8xH100-80GB", 8, 80, 0.82),
        ("16xH100-80GB", 16, 80, 0.82),
        ("8xB200-192GB", 8, 192, 0.85),
        ("16xB200-192GB", 16, 192, 0.85),
    ]
    out = []
    for name, count, memory, usable_fraction in profiles:
        usable = count * memory * usable_fraction
        out.append({
            "name": name,
            "gpuCount": count,
            "memoryPerGpuGiB": memory,
            "usableClusterGiB": round(usable, 2),
            "fitsEstimate": usable >= required_gib,
            "verifiedAllocation": False,
        })
    return out


@dataclass
class State:
    step: int
    accumulator: int
    seed: int

    def advance(self) -> "State":
        value = (self.accumulator * 1103515245 + 12345 + self.step + self.seed) % (2 ** 31)
        return State(step=self.step + 1, accumulator=value, seed=self.seed)

    def payload(self) -> dict:
        data = {"step": self.step, "accumulator": self.accumulator, "seed": self.seed}
        data["stateSha256"] = sha(data)
        return data


def save_checkpoint(directory: Path, state: State) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"checkpoint-{state.step:06d}.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state.payload(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, path)
    (directory / "latest.json").write_text(json.dumps({"checkpoint": path.name, "sha256": sha(state.payload())}, sort_keys=True) + "\n", encoding="utf-8")
    return path


def load_checkpoint(path: Path) -> State:
    data = json.loads(path.read_text(encoding="utf-8"))
    expected = data.pop("stateSha256")
    if sha(data) != expected:
        raise RuntimeError("checkpoint hash mismatch")
    return State(**data)


def run_steps(initial: State, target_steps: int, checkpoint_dir: Path | None = None, checkpoint_every: int = 1) -> State:
    state = initial
    while state.step < target_steps:
        state = state.advance()
        if checkpoint_dir and state.step % checkpoint_every == 0:
            save_checkpoint(checkpoint_dir, state)
    return state


def prove_resume() -> dict:
    initial = State(step=0, accumulator=7, seed=20260725)
    uninterrupted = run_steps(initial, 12)
    with tempfile.TemporaryDirectory() as tmp:
        checkpoint_dir = Path(tmp)
        interrupted = run_steps(initial, 7, checkpoint_dir, checkpoint_every=1)
        checkpoint = checkpoint_dir / f"checkpoint-{interrupted.step:06d}.json"
        resumed_from = load_checkpoint(checkpoint)
        resumed = run_steps(resumed_from, 12, checkpoint_dir, checkpoint_every=1)
        latest = json.loads((checkpoint_dir / "latest.json").read_text(encoding="utf-8"))
    same = resumed.payload()["stateSha256"] == uninterrupted.payload()["stateSha256"]
    if not same:
        raise AssertionError("resumed state differs from uninterrupted state")
    return {
        "interruptedAtStep": 7,
        "completedAtStep": 12,
        "checkpointAtomicWrite": True,
        "checkpointHashVerified": True,
        "finalStateMatchesUninterrupted": same,
        "finalStateSha256": resumed.payload()["stateSha256"],
        "latestPointerPresent": bool(latest.get("checkpoint")),
        "scope": "pipeline-resume-contract-only; no model weights or GPU used",
    }


def verify_endpoint_attestation(response: dict, expected_model: str = TARGET_MODEL) -> dict:
    requested = response.get("requestedModel")
    effective = response.get("effectiveModel") or response.get("model")
    fallback = bool(response.get("fallback"))
    if requested != expected_model or effective != expected_model or fallback:
        raise RuntimeError("model attribution failed closed")
    return {"requestedModel": requested, "effectiveModel": effective, "fallback": fallback, "verified": True}


def build_manifest() -> dict:
    qlora = memory_profile(4, 0.002)
    profiles = hardware_profiles(qlora["estimatedTotalGiB"])
    resume = prove_resume()
    exact_fixture = {"requestedModel": TARGET_MODEL, "effectiveModel": TARGET_MODEL, "fallback": False}
    attribution = verify_endpoint_attestation(exact_fixture)
    return {
        "schemaVersion": 1,
        "targetModel": TARGET_MODEL,
        "parameters": {"total": TOTAL_PARAMETERS, "activePerToken": ACTIVE_PARAMETERS},
        "currentGates": {
            "corpus": {"current": 2600, "required": 10000, "open": False},
            "benchmark": {"current": 512, "required": 500, "open": True},
            "trainableV41Failures": {"current": 449, "required": 100, "open": True},
            "explicitBudgetMxn": {"value": None, "open": False},
            "paidBillingEnabled": False,
            "exactEndpointLiveVerified": False,
            "distributedHardwareAllocated": False,
            "persistentRemoteResumeVerified": False,
        },
        "inference": {
            "managedApiPreferred": True,
            "huggingFaceRouterPathPresent": True,
            "exactModelAttestationContract": attribution,
            "liveCallPerformed": False,
            "actualCostMxn": 0,
        },
        "trainingMemoryEstimates": {
            "qlora4bitTrainable0_2pct": qlora,
            "lora8bitTrainable0_2pct": memory_profile(8, 0.002),
            "full16bit": memory_profile(16, 1.0),
            "note": "Planning estimate only; framework, sequence length, expert routing and sharding can increase memory materially.",
        },
        "candidateHardware": profiles,
        "resumeProof": resume,
        "secrets": {
            "requiredNames": ["QWEN_397B_BASE_URL", "QWEN_397B_TOKEN", "QWEN_397B_MODEL", "HUGGINGFACE_TOKEN"],
            "valuesInspectedOrRecorded": False,
        },
        "decision": "do-not-train",
        "blockingReasons": [
            "corpus below 10000 verified examples",
            "no explicit MXN ceiling",
            "no allocated distributed GPU cluster",
            "no persistent remote checkpoint resume proof",
            "no live exact-model endpoint attestation in this run",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    manifest = build_manifest()
    manifest["sha256"] = sha(manifest)
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
