#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

TARGET_MODEL = "Qwen/Qwen3.5-397B-A17B"
PROTOCOL_VERSION = 1


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_bytes(value))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


@dataclass(frozen=True)
class State:
    step: int
    accumulator: int
    seed: int

    def advance(self) -> "State":
        value = (
            self.accumulator * 6364136223846793005
            + 1442695040888963407
            + self.step
            + self.seed
        ) % (2**63)
        return State(step=self.step + 1, accumulator=value, seed=self.seed)

    def plain(self) -> dict[str, int]:
        return {"step": self.step, "accumulator": self.accumulator, "seed": self.seed}

    def attested(self) -> dict[str, Any]:
        value: dict[str, Any] = self.plain()
        value["stateSha256"] = sha256_json(value)
        return value


def run_steps(state: State, target_steps: int) -> State:
    if target_steps < state.step:
        raise ValueError("target_steps cannot be behind current state")
    current = state
    while current.step < target_steps:
        current = current.advance()
    return current


def shard_payload(state: State, index: int, shard_count: int) -> bytes:
    payload = {
        "protocolVersion": PROTOCOL_VERSION,
        "targetModel": TARGET_MODEL,
        "checkpointStep": state.step,
        "shardIndex": index,
        "shardCount": shard_count,
        "syntheticTensorDigest": sha256_json(
            {
                "state": state.plain(),
                "shardIndex": index,
                "shardCount": shard_count,
                "salt": "hector-cross-job-resume-proof",
            }
        ),
        "scope": "synthetic checkpoint shard; not model weights",
    }
    return canonical_bytes(payload) + b"\n"


def write_checkpoint(root: Path, state: State, model_revision: str, shard_count: int) -> Path:
    if shard_count < 2:
        raise ValueError("shard_count must be at least 2")
    if len(model_revision) != 40 or any(char not in "0123456789abcdef" for char in model_revision):
        raise ValueError("model_revision must be a 40-character lowercase hex SHA")

    root.mkdir(parents=True, exist_ok=True)
    checkpoint_name = f"checkpoint-{state.step:06d}"
    final_directory = root / checkpoint_name
    if final_directory.exists():
        raise RuntimeError(f"checkpoint already exists: {final_directory}")
    temporary_directory = root / f".{checkpoint_name}.tmp"
    if temporary_directory.exists():
        shutil.rmtree(temporary_directory)
    temporary_directory.mkdir(parents=True)

    shards: list[dict[str, Any]] = []
    for index in range(shard_count):
        name = f"model-state-{index + 1:05d}-of-{shard_count:05d}.bin"
        path = temporary_directory / name
        payload = shard_payload(state, index, shard_count)
        with path.open("wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        shards.append({"file": name, "sizeBytes": len(payload), "sha256": sha256_bytes(payload)})

    manifest: dict[str, Any] = {
        "protocolVersion": PROTOCOL_VERSION,
        "targetModel": TARGET_MODEL,
        "modelRevision": model_revision,
        "checkpointStep": state.step,
        "state": state.attested(),
        "shards": shards,
        "shardCount": shard_count,
        "atomicCommit": True,
        "scope": "remote persistence/resume protocol proof; no GPU and no model weights",
    }
    manifest["manifestPayloadSha256"] = sha256_json(manifest)
    atomic_json(temporary_directory / "manifest.json", manifest)
    os.replace(temporary_directory, final_directory)

    manifest_file_sha = sha256_file(final_directory / "manifest.json")
    latest = {
        "protocolVersion": PROTOCOL_VERSION,
        "targetModel": TARGET_MODEL,
        "modelRevision": model_revision,
        "checkpoint": checkpoint_name,
        "checkpointStep": state.step,
        "manifestFileSha256": manifest_file_sha,
    }
    latest["pointerSha256"] = sha256_json(latest)
    atomic_json(root / "latest.json", latest)
    return final_directory


def verify_state_payload(data: dict[str, Any]) -> State:
    expected = data.get("stateSha256")
    plain = {"step": data.get("step"), "accumulator": data.get("accumulator"), "seed": data.get("seed")}
    if not isinstance(expected, str) or sha256_json(plain) != expected:
        raise RuntimeError("state hash mismatch")
    if not all(isinstance(plain[name], int) for name in ("step", "accumulator", "seed")):
        raise RuntimeError("invalid state payload")
    return State(step=plain["step"], accumulator=plain["accumulator"], seed=plain["seed"])


def load_latest_checkpoint(root: Path) -> tuple[State, dict[str, Any]]:
    latest_path = root / "latest.json"
    if not latest_path.exists():
        raise RuntimeError("latest pointer missing")
    latest = json.loads(latest_path.read_text(encoding="utf-8"))
    pointer_hash = latest.pop("pointerSha256", None)
    if not isinstance(pointer_hash, str) or sha256_json(latest) != pointer_hash:
        raise RuntimeError("latest pointer hash mismatch")
    if latest.get("targetModel") != TARGET_MODEL:
        raise RuntimeError("latest pointer model mismatch")

    checkpoint_directory = root / str(latest.get("checkpoint"))
    manifest_path = checkpoint_directory / "manifest.json"
    if not manifest_path.exists():
        raise RuntimeError("checkpoint manifest missing")
    if sha256_file(manifest_path) != latest.get("manifestFileSha256"):
        raise RuntimeError("checkpoint manifest file hash mismatch")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_hash = manifest.pop("manifestPayloadSha256", None)
    if not isinstance(manifest_hash, str) or sha256_json(manifest) != manifest_hash:
        raise RuntimeError("checkpoint manifest payload hash mismatch")
    if manifest.get("targetModel") != TARGET_MODEL:
        raise RuntimeError("checkpoint target model mismatch")
    if manifest.get("modelRevision") != latest.get("modelRevision"):
        raise RuntimeError("checkpoint model revision mismatch")
    shards = manifest.get("shards")
    if not isinstance(shards, list) or len(shards) != manifest.get("shardCount"):
        raise RuntimeError("checkpoint shard manifest invalid")
    for shard in shards:
        if not isinstance(shard, dict):
            raise RuntimeError("invalid shard entry")
        shard_path = checkpoint_directory / str(shard.get("file"))
        if not shard_path.exists():
            raise RuntimeError(f"checkpoint shard missing: {shard_path.name}")
        if shard_path.stat().st_size != shard.get("sizeBytes"):
            raise RuntimeError(f"checkpoint shard size mismatch: {shard_path.name}")
        if sha256_file(shard_path) != shard.get("sha256"):
            raise RuntimeError(f"checkpoint shard hash mismatch: {shard_path.name}")

    state = verify_state_payload(manifest.get("state") if isinstance(manifest.get("state"), dict) else {})
    if state.step != latest.get("checkpointStep") or state.step != manifest.get("checkpointStep"):
        raise RuntimeError("checkpoint step mismatch")
    manifest["manifestPayloadSha256"] = manifest_hash
    latest["pointerSha256"] = pointer_hash
    return state, {"latest": latest, "manifest": manifest}


def seed_command(args: argparse.Namespace) -> None:
    root = Path(args.root)
    if root.exists():
        shutil.rmtree(root)
    initial = State(step=0, accumulator=7, seed=20260725)
    expected = run_steps(initial, args.target_steps)
    interrupted = run_steps(initial, args.interrupt_step)
    checkpoint = write_checkpoint(root, interrupted, args.model_revision, args.shards)
    expected_payload = {
        "targetModel": TARGET_MODEL,
        "modelRevision": args.model_revision,
        "targetSteps": args.target_steps,
        "expectedFinalState": expected.attested(),
    }
    expected_payload["sha256"] = sha256_json(expected_payload)
    atomic_json(root / "expected-final.json", expected_payload)
    attestation = {
        "schemaVersion": 1,
        "runId": args.run_id,
        "sourceJob": args.source_job,
        "targetModel": TARGET_MODEL,
        "modelRevision": args.model_revision,
        "interruptedAtStep": interrupted.step,
        "targetSteps": args.target_steps,
        "shardCount": args.shards,
        "checkpoint": checkpoint.name,
        "atomicCheckpointWritten": True,
        "actualCostMxn": 0,
        "scope": "seeded for cross-job artifact persistence proof; no GPU and no model weights",
    }
    attestation["sha256"] = sha256_json(attestation)
    atomic_json(root / "seed-attestation.json", attestation)
    print(json.dumps(attestation, sort_keys=True))


def resume_command(args: argparse.Namespace) -> None:
    root = Path(args.root)
    expected = json.loads((root / "expected-final.json").read_text(encoding="utf-8"))
    expected_hash = expected.pop("sha256", None)
    if not isinstance(expected_hash, str) or sha256_json(expected) != expected_hash:
        raise RuntimeError("expected final state attestation hash mismatch")
    state, metadata = load_latest_checkpoint(root)
    target_steps = int(expected["targetSteps"])
    resumed = run_steps(state, target_steps)
    final_checkpoint = write_checkpoint(
        root,
        resumed,
        str(expected["modelRevision"]),
        int(metadata["manifest"]["shardCount"]),
    )
    final_matches = resumed.attested()["stateSha256"] == expected["expectedFinalState"]["stateSha256"]
    if not final_matches:
        raise RuntimeError("resumed final state differs from uninterrupted execution")
    if args.source_job == args.resume_job:
        raise RuntimeError("source and resume jobs must be distinct")
    attestation = {
        "schemaVersion": 1,
        "runId": args.run_id,
        "sourceJob": args.source_job,
        "resumeJob": args.resume_job,
        "crossJobArtifactPersistence": True,
        "targetModel": TARGET_MODEL,
        "modelRevision": expected["modelRevision"],
        "resumedFromStep": state.step,
        "completedAtStep": resumed.step,
        "finalCheckpoint": final_checkpoint.name,
        "checkpointManifestVerified": True,
        "allShardHashesVerified": True,
        "finalStateMatchesUninterrupted": True,
        "finalStateSha256": resumed.attested()["stateSha256"],
        "actualCostMxn": 0,
        "scope": "cross-job persistent checkpoint protocol verified; no GPU and no model weights",
    }
    attestation["sha256"] = sha256_json(attestation)
    output = Path(args.output)
    atomic_json(output, attestation)
    print(json.dumps(attestation, sort_keys=True))


def corruption_command(args: argparse.Namespace) -> None:
    source = Path(args.root)
    with tempfile.TemporaryDirectory() as temporary:
        clone = Path(temporary) / "clone"
        shutil.copytree(source, clone)
        _, metadata = load_latest_checkpoint(clone)
        checkpoint = clone / metadata["latest"]["checkpoint"]
        first_shard = checkpoint / metadata["manifest"]["shards"][0]["file"]
        with first_shard.open("ab") as handle:
            handle.write(b"CORRUPTION")
        try:
            load_latest_checkpoint(clone)
        except RuntimeError as error:
            rejected = True
            reason = str(error)
        else:
            rejected = False
            reason = "corruption was not detected"
    if not rejected:
        raise RuntimeError(reason)
    attestation = {
        "schemaVersion": 1,
        "targetModel": TARGET_MODEL,
        "corruptionRejected": True,
        "reason": reason,
        "actualCostMxn": 0,
    }
    attestation["sha256"] = sha256_json(attestation)
    atomic_json(Path(args.output), attestation)
    print(json.dumps(attestation, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    seed = subparsers.add_parser("seed")
    seed.add_argument("--root", required=True)
    seed.add_argument("--model-revision", required=True)
    seed.add_argument("--target-steps", type=int, default=20)
    seed.add_argument("--interrupt-step", type=int, default=9)
    seed.add_argument("--shards", type=int, default=8)
    seed.add_argument("--run-id", required=True)
    seed.add_argument("--source-job", default="seed-checkpoint")
    seed.set_defaults(func=seed_command)

    resume = subparsers.add_parser("resume")
    resume.add_argument("--root", required=True)
    resume.add_argument("--output", required=True)
    resume.add_argument("--run-id", required=True)
    resume.add_argument("--source-job", default="seed-checkpoint")
    resume.add_argument("--resume-job", default="resume-checkpoint")
    resume.set_defaults(func=resume_command)

    corrupt = subparsers.add_parser("corrupt-test")
    corrupt.add_argument("--root", required=True)
    corrupt.add_argument("--output", required=True)
    corrupt.set_defaults(func=corruption_command)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "seed" and not (0 < args.interrupt_step < args.target_steps):
        parser.error("interrupt-step must be between zero and target-steps")
    args.func(args)


if __name__ == "__main__":
    main()
