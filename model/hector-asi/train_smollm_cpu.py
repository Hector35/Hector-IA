from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import random
import sys
import time
from pathlib import Path
from typing import Any

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

DEFAULT_MODEL = "HuggingFaceTB/SmolLM2-135M-Instruct"
DEFAULT_REVISION = "12fd25f"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a real Hector LoRA adapter on SmolLM2 using CPU.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--revision", default=DEFAULT_REVISION)
    parser.add_argument("--train-file", default="model/hector-asi/data/smollm-hector-sft-v1.jsonl")
    parser.add_argument("--validation-file", default="model/hector-asi/evals/smollm-hector-held-out-v1.jsonl")
    parser.add_argument("--output-dir", default="artifacts/hector-asi-smollm2-135m-lora-v1")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--max-length", type=int, default=192)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--seed", type=int, default=35)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        raise ValueError(f"Empty dataset: {path}")
    return rows


def verify_train_rows(rows: list[dict[str, Any]]) -> None:
    ids: set[str] = set()
    normalized_prompts: set[str] = set()
    for row in rows:
        if row.get("id") in ids:
            raise ValueError(f"Duplicate id: {row.get('id')}")
        ids.add(row["id"])
        if not row.get("verification", {}).get("verified"):
            raise ValueError(f"Unverified training row: {row.get('id')}")
        messages = row.get("messages") or []
        if len(messages) < 3 or messages[-1].get("role") != "assistant":
            raise ValueError(f"Invalid chat row: {row.get('id')}")
        user_text = " ".join(message.get("content", "") for message in messages if message.get("role") == "user")
        normalized = " ".join(user_text.lower().split())
        if normalized in normalized_prompts:
            raise ValueError(f"Duplicate normalized prompt: {row.get('id')}")
        normalized_prompts.add(normalized)


def ensure_no_contamination(train_rows: list[dict[str, Any]], validation_rows: list[dict[str, Any]]) -> None:
    train_ids = {row["id"] for row in train_rows}
    validation_ids = {row["id"] for row in validation_rows}
    overlap = sorted(train_ids & validation_ids)
    if overlap:
        raise ValueError(f"Train/eval id contamination: {overlap}")


def set_seed(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)


def render_chat(tokenizer: Any, row: dict[str, Any]) -> str:
    messages = row["messages"]
    if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    return "\n".join(f"{message['role']}: {message['content']}" for message in messages)


def encode_rows(tokenizer: Any, rows: list[dict[str, Any]], max_length: int) -> list[dict[str, torch.Tensor]]:
    encoded: list[dict[str, torch.Tensor]] = []
    for row in rows:
        text = render_chat(tokenizer, row)
        tokens = tokenizer(text, return_tensors="pt", truncation=True, max_length=max_length)
        input_ids = tokens["input_ids"].squeeze(0)
        attention_mask = tokens["attention_mask"].squeeze(0)
        encoded.append({"input_ids": input_ids, "attention_mask": attention_mask, "labels": input_ids.clone()})
    return encoded


def evaluate_loss(model: Any, examples: list[dict[str, torch.Tensor]]) -> float:
    model.eval()
    total = 0.0
    with torch.no_grad():
        for example in examples:
            output = model(
                input_ids=example["input_ids"].unsqueeze(0),
                attention_mask=example["attention_mask"].unsqueeze(0),
                labels=example["labels"].unsqueeze(0),
            )
            total += float(output.loss.detach().cpu())
    return total / len(examples)


def train(model: Any, examples: list[dict[str, torch.Tensor]], epochs: int, learning_rate: float) -> list[float]:
    optimizer = torch.optim.AdamW((parameter for parameter in model.parameters() if parameter.requires_grad), lr=learning_rate)
    history: list[float] = []
    model.train()
    for _ in range(epochs):
        shuffled = list(examples)
        random.shuffle(shuffled)
        epoch_total = 0.0
        for example in shuffled:
            optimizer.zero_grad(set_to_none=True)
            output = model(
                input_ids=example["input_ids"].unsqueeze(0),
                attention_mask=example["attention_mask"].unsqueeze(0),
                labels=example["labels"].unsqueeze(0),
            )
            output.loss.backward()
            torch.nn.utils.clip_grad_norm_((parameter for parameter in model.parameters() if parameter.requires_grad), 1.0)
            optimizer.step()
            epoch_total += float(output.loss.detach().cpu())
        history.append(epoch_total / len(shuffled))
    return history


def lora_vector(model: Any) -> torch.Tensor:
    tensors = [parameter.detach().cpu().float().reshape(-1) for name, parameter in model.named_parameters() if "lora_" in name]
    if not tensors:
        raise RuntimeError("No LoRA parameters found")
    return torch.cat(tensors)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_hashes(root: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.name != "SHA256SUMS":
            hashes[str(path.relative_to(root))] = sha256_file(path)
    (root / "SHA256SUMS").write_text("".join(f"{digest}  {name}\n" for name, digest in hashes.items()), encoding="utf-8")
    return hashes


def main() -> None:
    args = parse_args()
    started = time.time()
    set_seed(args.seed)
    train_path = Path(args.train_file)
    validation_path = Path(args.validation_file)
    output_root = Path(args.output_dir)
    adapter_dir = output_root / "adapter"
    train_rows = read_jsonl(train_path)
    validation_rows = read_jsonl(validation_path)
    verify_train_rows(train_rows)
    ensure_no_contamination(train_rows, validation_rows)

    tokenizer = AutoTokenizer.from_pretrained(args.model, revision=args.revision, use_fast=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(args.model, revision=args.revision, torch_dtype=torch.float32)
    model.config.use_cache = False
    lora_config = LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)
    trainable = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
    total = sum(parameter.numel() for parameter in model.parameters())
    before_vector = lora_vector(model).clone()
    train_examples = encode_rows(tokenizer, train_rows, args.max_length)
    validation_examples = encode_rows(tokenizer, validation_rows, args.max_length)
    baseline_validation_loss = evaluate_loss(model, validation_examples)
    train_history = train(model, train_examples, args.epochs, args.learning_rate)
    candidate_validation_loss = evaluate_loss(model, validation_examples)
    after_vector = lora_vector(model)
    delta_l2 = float(torch.linalg.vector_norm(after_vector - before_vector))

    output_root.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(adapter_dir, safe_serialization=True)
    tokenizer.save_pretrained(adapter_dir)
    adapter_weights = adapter_dir / "adapter_model.safetensors"
    if not adapter_weights.is_file() or adapter_weights.stat().st_size <= 0 or delta_l2 <= 0:
        raise RuntimeError("Training did not produce verifiable changed adapter weights")

    relative_improvement = (baseline_validation_loss - candidate_validation_loss) / baseline_validation_loss
    metrics = {
        "schemaVersion": "1.0.0",
        "experimentId": "hector-asi-smollm2-135m-lora-v1",
        "results": {
            "weightsGenerated": True,
            "adapterBytes": adapter_weights.stat().st_size,
            "parameterDeltaL2": delta_l2,
            "baselineValidationLoss": baseline_validation_loss,
            "candidateValidationLoss": candidate_validation_loss,
            "relativeValidationLossImprovement": relative_improvement,
            "trainLossByEpoch": train_history,
            "eligibleForChampion": False,
            "eligibilityReason": "CPU experimental candidate validates instruct-model adaptation but is not the registered Qwen3-4B champion candidate.",
        },
    }
    (output_root / "metrics.json").write_text(json.dumps(metrics, indent=2, sort_keys=True), encoding="utf-8")
    manifest = {
        "schemaVersion": "1.0.0",
        "experimentId": "hector-asi-smollm2-135m-lora-v1",
        "baseModel": {"repository": args.model, "revision": args.revision, "license": "Apache-2.0"},
        "method": {"type": "LoRA SFT", "rank": 8, "alpha": 16, "dropout": 0.05, "precision": "float32", "device": "cpu"},
        "data": {
            "trainPath": str(train_path),
            "validationPath": str(validation_path),
            "trainExamples": len(train_rows),
            "validationExamples": len(validation_rows),
            "containsPrivateUserData": False,
            "source": "Project-authored synthetic verified examples",
        },
        "hyperparameters": {"epochs": args.epochs, "maxLength": args.max_length, "learningRate": args.learning_rate, "seed": args.seed},
        "runtime": {
            "seconds": time.time() - started,
            "python": sys.version,
            "platform": platform.platform(),
            "torch": torch.__version__,
            "transformersOffline": os.environ.get("TRANSFORMERS_OFFLINE", "0"),
            "trainableParameters": trainable,
            "totalParametersIncludingAdapter": total,
        },
    }
    (output_root / "run-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    hashes = write_hashes(output_root)
    print(json.dumps({"metrics": metrics["results"], "hashes": hashes}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
