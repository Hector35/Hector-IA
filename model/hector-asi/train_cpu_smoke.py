from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import subprocess
import time
from pathlib import Path
from typing import Any

import torch
from peft import LoraConfig, TaskType, get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM, AutoTokenizer, set_seed

DEFAULT_MODEL = "openai-community/gpt2"
DEFAULT_REVISION = "607a30d783dfa663caf39e06633721c8d4cfcd7e"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Produce a real, CPU-trainable Hector LoRA smoke adapter."
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--revision", default=DEFAULT_REVISION)
    parser.add_argument(
        "--train-file", default="model/hector-asi/data/sft-seed-v1.jsonl"
    )
    parser.add_argument(
        "--validation-file",
        default="model/hector-asi/evals/cpu-smoke-held-out-v1.jsonl",
    )
    parser.add_argument(
        "--output-dir", default="artifacts/hector-asi-cpu-smoke-v1"
    )
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--max-length", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=5e-4)
    parser.add_argument("--seed", type=int, default=35)
    return parser.parse_args()


def read_verified_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(path)
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not rows:
        raise ValueError(f"No rows in {path}")
    if any(not row.get("verification", {}).get("verified") for row in rows):
        raise ValueError(f"Every row in {path} must be explicitly verified")
    ids = [row.get("id") for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError(f"Duplicate ids in {path}")
    return rows


def render_messages(row: dict[str, Any]) -> str:
    messages = row.get("messages")
    if not isinstance(messages, list) or len(messages) < 2:
        raise ValueError(f"Invalid messages for {row.get('id')}")
    chunks = []
    for message in messages:
        role = str(message.get("role", "unknown")).strip().lower()
        content = str(message.get("content", "")).strip()
        if not content:
            raise ValueError(f"Empty message in {row.get('id')}")
        chunks.append(f"<|{role}|>\n{content}")
    return "\n".join(chunks) + "\n<|end|>"


def encode_rows(tokenizer: Any, rows: list[dict[str, Any]], max_length: int) -> list[dict[str, torch.Tensor]]:
    encoded: list[dict[str, torch.Tensor]] = []
    for row in rows:
        batch = tokenizer(
            render_messages(row),
            return_tensors="pt",
            truncation=True,
            max_length=max_length,
        )
        batch["labels"] = batch["input_ids"].clone()
        encoded.append(batch)
    return encoded


def mean_loss(model: Any, batches: list[dict[str, torch.Tensor]]) -> float:
    model.eval()
    losses = []
    with torch.no_grad():
        for batch in batches:
            losses.append(float(model(**batch).loss.detach().cpu()))
    return sum(losses) / len(losses)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_versions() -> list[str]:
    result = subprocess.run(
        [os.sys.executable, "-m", "pip", "freeze"],
        check=True,
        capture_output=True,
        text=True,
    )
    return sorted(line for line in result.stdout.splitlines() if line.strip())


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))

    train_path = Path(args.train_file)
    validation_path = Path(args.validation_file)
    output_root = Path(args.output_dir)
    adapter_dir = output_root / "adapter"
    output_root.mkdir(parents=True, exist_ok=True)

    train_rows = read_verified_jsonl(train_path)
    validation_rows = read_verified_jsonl(validation_path)
    overlap = {row["id"] for row in train_rows} & {row["id"] for row in validation_rows}
    if overlap:
        raise ValueError(f"Train/validation id contamination: {sorted(overlap)}")

    started = time.time()
    tokenizer = AutoTokenizer.from_pretrained(
        args.model, revision=args.revision, use_fast=True
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base_model = AutoModelForCausalLM.from_pretrained(
        args.model,
        revision=args.revision,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    base_model.config.use_cache = False
    train_batches = encode_rows(tokenizer, train_rows, args.max_length)
    validation_batches = encode_rows(tokenizer, validation_rows, args.max_length)
    base_validation_loss = mean_loss(base_model, validation_batches)

    lora_config = LoraConfig(
        r=4,
        lora_alpha=8,
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=["c_attn"],
        fan_in_fan_out=True,
    )
    model = get_peft_model(base_model, lora_config)
    trainable = [(name, parameter) for name, parameter in model.named_parameters() if parameter.requires_grad]
    if not trainable:
        raise RuntimeError("LoRA produced no trainable parameters")
    before = trainable[0][1].detach().clone()

    optimizer = AdamW((parameter for _, parameter in trainable), lr=args.learning_rate)
    step_losses: list[float] = []
    model.train()
    for _epoch in range(args.epochs):
        for batch in train_batches:
            optimizer.zero_grad(set_to_none=True)
            loss = model(**batch).loss
            if not torch.isfinite(loss):
                raise RuntimeError(f"Non-finite training loss: {loss}")
            loss.backward()
            torch.nn.utils.clip_grad_norm_((parameter for _, parameter in trainable), 1.0)
            optimizer.step()
            step_losses.append(float(loss.detach().cpu()))

    parameter_delta_l2 = float(torch.linalg.vector_norm(trainable[0][1].detach() - before).cpu())
    if not math.isfinite(parameter_delta_l2) or parameter_delta_l2 <= 0:
        raise RuntimeError("Training did not change LoRA weights")

    candidate_validation_loss = mean_loss(model, validation_batches)
    adapter_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(adapter_dir, safe_serialization=True)
    tokenizer.save_pretrained(adapter_dir)

    environment_path = output_root / "environment.txt"
    environment_path.write_text("\n".join(package_versions()) + "\n", encoding="utf-8")

    metrics = {
        "schemaVersion": "1.0.0",
        "experimentId": "hector-asi-cpu-smoke-v1",
        "status": "experimental-weights-generated",
        "eligibleForChampion": False,
        "reasonNotChampion": "CPU smoke adapter uses GPT-2 rather than the registered Qwen3-4B candidate and a very small dataset.",
        "baseModel": {
            "repository": args.model,
            "requestedRevision": args.revision,
            "resolvedRevision": getattr(model.config, "_commit_hash", None),
            "license": "MIT",
        },
        "method": "LoRA supervised causal-language-model fine-tuning",
        "dataset": {
            "trainPath": str(train_path),
            "trainSha256": sha256(train_path),
            "trainExamples": len(train_rows),
            "validationPath": str(validation_path),
            "validationSha256": sha256(validation_path),
            "validationExamples": len(validation_rows),
            "privateUserData": False,
        },
        "hyperparameters": {
            "epochs": args.epochs,
            "maxLength": args.max_length,
            "learningRate": args.learning_rate,
            "seed": args.seed,
            "loraRank": 4,
            "loraAlpha": 8,
            "loraDropout": 0.05,
            "targetModules": ["c_attn"],
        },
        "results": {
            "steps": len(step_losses),
            "firstTrainLoss": step_losses[0],
            "finalTrainLoss": step_losses[-1],
            "baseValidationLoss": base_validation_loss,
            "candidateValidationLoss": candidate_validation_loss,
            "validationLossDelta": candidate_validation_loss - base_validation_loss,
            "parameterDeltaL2": parameter_delta_l2,
            "weightsGenerated": True,
        },
        "runtime": {
            "seconds": time.time() - started,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "processor": platform.processor(),
            "cpuCount": os.cpu_count(),
            "torch": torch.__version__,
            "githubSha": os.getenv("GITHUB_SHA"),
            "githubRunId": os.getenv("GITHUB_RUN_ID"),
        },
    }
    metrics_path = output_root / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    artifact_files = sorted(path for path in output_root.rglob("*") if path.is_file())
    hashes = {str(path.relative_to(output_root)): sha256(path) for path in artifact_files}
    manifest = {
        "schemaVersion": "1.0.0",
        "experimentId": metrics["experimentId"],
        "createdAtUnix": int(time.time()),
        "artifactRoot": str(output_root),
        "files": hashes,
        "rollback": "Delete or stop loading this adapter; the frozen base model is unchanged.",
    }
    manifest_path = output_root / "run-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    sums = sorted((sha256(path), str(path.relative_to(output_root))) for path in output_root.rglob("*") if path.is_file())
    (output_root / "SHA256SUMS").write_text(
        "".join(f"{digest}  {relative}\n" for digest, relative in sums),
        encoding="utf-8",
    )

    print(json.dumps(metrics, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
