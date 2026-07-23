from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import os
import platform
import resource
import time
import unicodedata
from pathlib import Path

import torch
from peft import PeftModel
from torch.optim import AdamW
from transformers import AutoModelForCausalLM, AutoTokenizer, set_seed

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"
SOURCE_SHA256 = "31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8"
SOURCE_BYTES = 73_911_112


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-adapter", required=True)
    parser.add_argument("--train-files", nargs="+", required=True)
    parser.add_argument("--validation-files", nargs="+", required=True)
    parser.add_argument("--test-files", nargs="+", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--experiment-id", default="hector-asi-qwen15-v50-risk-weighted")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--max-length", type=int, default=160)
    parser.add_argument("--max-new-tokens", type=int, default=96)
    parser.add_argument("--lr", type=float, default=8e-6)
    parser.add_argument("--seed", type=int, default=40450)
    return parser.parse_args()


def sha256(path: Path | str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(text.split())


def read_rows(paths: list[str], training: bool = False) -> list[dict]:
    rows: list[dict] = []
    for path in paths:
        rows.extend(json.loads(line) for line in Path(path).read_text().splitlines() if line.strip())
    if not rows:
        raise ValueError("empty dataset")
    for row in rows:
        verification = row.get("verification", {})
        if verification.get("verified") is not True:
            raise ValueError(f"unverified row {row.get('id')}")
        if verification.get("source") not in {None, "author-generated"}:
            raise ValueError(f"bad provenance {row.get('id')}")
        if verification.get("license") not in {None, "Apache-2.0-compatible"}:
            raise ValueError(f"bad license {row.get('id')}")
        roles = [message.get("role") for message in row.get("messages", [])]
        if roles[-1:] != ["assistant"] or "user" not in roles:
            raise ValueError(f"invalid chat {row.get('id')}")
        weight = float(row.get("trainingWeight", 1.0))
        if training and weight not in {1.0, 3.0}:
            raise ValueError(f"invalid training weight {row.get('id')}: {weight}")
    ids = [row["id"] for row in rows]
    prompts = [normalize(next(m["content"] for m in row["messages"] if m["role"] == "user")) for row in rows]
    if len(ids) != len(set(ids)) or len(prompts) != len(set(prompts)):
        raise ValueError("duplicates")
    return rows


def signatures(rows: list[dict]):
    return (
        {row["id"] for row in rows},
        {normalize(next(m["content"] for m in row["messages"] if m["role"] == "user")) for row in rows},
    )


def encode(tokenizer, rows: list[dict], max_length: int, training: bool = False):
    encoded = []
    for row in rows:
        prefix = tokenizer.apply_chat_template(row["messages"][:-1], tokenize=False, add_generation_prompt=True)
        full = tokenizer.apply_chat_template(row["messages"], tokenize=False, add_generation_prompt=False)
        prefix_length = len(tokenizer(prefix, add_special_tokens=False)["input_ids"])
        batch = tokenizer(full, return_tensors="pt", add_special_tokens=False, truncation=True, max_length=max_length)
        labels = batch["input_ids"].clone()
        labels[:, : min(prefix_length, labels.shape[1])] = -100
        if torch.all(labels == -100):
            raise ValueError(f"assistant response truncated: {row['id']}")
        batch["labels"] = labels
        encoded.append((batch, float(row.get("trainingWeight", 1.0)) if training else 1.0, row["id"]))
    return encoded


def average_loss(model, batches) -> float:
    model.eval()
    values = []
    with torch.no_grad():
        for batch, _, _ in batches:
            values.append(float(model(**batch).loss.detach().cpu()))
    return sum(values) / len(values)


def generate(model, tokenizer, row: dict, max_new_tokens: int):
    prompt = tokenizer.apply_chat_template(row["messages"][:-1], tokenize=False, add_generation_prompt=True)
    encoded = tokenizer(prompt, return_tensors="pt", add_special_tokens=False)
    started = time.perf_counter()
    with torch.no_grad():
        output = model.generate(
            **encoded,
            do_sample=False,
            max_new_tokens=max_new_tokens,
            repetition_penalty=1.05,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    generated = output[0, encoded["input_ids"].shape[1] :]
    return tokenizer.decode(generated, skip_special_tokens=True).strip(), (time.perf_counter() - started) * 1000, int(generated.numel())


def score_case(row: dict, response: str):
    text = normalize(response)
    evaluation = row.get("evaluation", {})
    missing = []
    for group in evaluation.get("required", []):
        if not any(normalize(item) in text for item in group):
            missing.append(group)
    forbidden = [item for item in evaluation.get("forbidden", []) if normalize(item) in text]
    return not missing and not forbidden, missing, forbidden


def behavior(model, tokenizer, rows: list[dict], max_new_tokens: int):
    cases = []
    for row in rows:
        response, latency_ms, tokens = generate(model, tokenizer, row, max_new_tokens)
        passed, missing, forbidden = score_case(row, response)
        cases.append({
            "id": row["id"],
            "category": row["verification"]["category"],
            "critical": bool(row.get("evaluation", {}).get("critical")),
            "response": response,
            "passed": passed,
            "missingRequired": missing,
            "forbiddenPresent": forbidden,
            "latencyMs": latency_ms,
            "tokens": tokens,
        })
    critical = [case for case in cases if case["critical"]]
    passed = sum(int(case["passed"]) for case in cases)
    return {
        "passed": passed,
        "total": len(cases),
        "score": passed / len(cases),
        "criticalPassed": sum(int(case["passed"]) for case in critical),
        "criticalTotal": len(critical),
        "meanLatencyMs": sum(case["latencyMs"] for case in cases) / len(cases),
        "outputTokens": sum(case["tokens"] for case in cases),
        "cases": cases,
    }


def base_model():
    model = AutoModelForCausalLM.from_pretrained(
        MODEL,
        revision=REVISION,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model.config.use_cache = False
    return model


def peak_rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def main():
    args = parse_args()
    set_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)

    source = Path(args.source_adapter)
    source_weights = source / "adapter_model.safetensors"
    if sha256(source_weights) != SOURCE_SHA256 or source_weights.stat().st_size != SOURCE_BYTES:
        raise RuntimeError("source champion mismatch")

    train = read_rows(args.train_files, training=True)
    validation = read_rows(args.validation_files)
    hidden = read_rows(args.test_files)
    split_signatures = [signatures(rows) for rows in (train, validation, hidden)]
    for left in range(3):
        for right in range(left + 1, 3):
            if split_signatures[left][0] & split_signatures[right][0] or split_signatures[left][1] & split_signatures[right][1]:
                raise ValueError("split contamination")

    root = Path(args.output_dir)
    best_dir, final_dir = root / "best-adapter", root / "adapter"
    root.mkdir(parents=True, exist_ok=True)
    started = time.time()

    tokenizer = AutoTokenizer.from_pretrained(source, use_fast=True)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
    train_batches = encode(tokenizer, train, args.max_length, training=True)
    validation_batches = encode(tokenizer, validation, args.max_length)
    hidden_batches = encode(tokenizer, hidden, args.max_length)

    base = base_model()
    champion = PeftModel.from_pretrained(base, source, is_trainable=False)
    before_validation = average_loss(champion, validation_batches)
    before_hidden = average_loss(champion, hidden_batches)
    before_behavior = behavior(champion, tokenizer, hidden, args.max_new_tokens)
    del champion, base
    gc.collect()

    base = base_model()
    model = PeftModel.from_pretrained(base, source, is_trainable=True)
    trainable = [(name, parameter) for name, parameter in model.named_parameters() if parameter.requires_grad]
    initial = {name: parameter.detach().cpu().to(torch.float16).clone() for name, parameter in trainable}
    parameters = [parameter for _, parameter in trainable]
    optimizer = AdamW(parameters, lr=args.lr, betas=(0.9, 0.999), weight_decay=0.01, foreach=False)

    history = []
    best_validation = float("inf")
    best_epoch = 0
    for epoch in range(1, args.epochs + 1):
        model.train()
        raw_losses, weighted_losses = [], []
        safety_weighted = 0.0
        for batch, weight, row_id in train_batches:
            optimizer.zero_grad(set_to_none=True)
            raw_loss = model(**batch).loss
            weighted_loss = raw_loss * weight
            if not torch.isfinite(weighted_loss):
                raise RuntimeError(f"non-finite loss at {row_id}")
            weighted_loss.backward()
            torch.nn.utils.clip_grad_norm_(parameters, 1.0)
            optimizer.step()
            raw_losses.append(float(raw_loss.detach().cpu()))
            weighted_losses.append(float(weighted_loss.detach().cpu()))
            safety_weighted += weight
        validation_loss = average_loss(model, validation_batches)
        history.append({
            "epoch": epoch,
            "meanRawTrainLoss": sum(raw_losses) / len(raw_losses),
            "meanWeightedTrainLoss": sum(weighted_losses) / len(weighted_losses),
            "validationLoss": validation_loss,
            "effectiveWeightSum": safety_weighted,
            "peakRssMb": peak_rss_mb(),
        })
        if validation_loss < best_validation:
            best_validation = validation_loss
            best_epoch = epoch
            model.save_pretrained(best_dir, safe_serialization=True)
            tokenizer.save_pretrained(best_dir)
    del model, base, optimizer, parameters
    gc.collect()

    base = base_model()
    candidate = PeftModel.from_pretrained(base, best_dir, is_trainable=False)
    after_hidden = average_loss(candidate, hidden_batches)
    after_behavior = behavior(candidate, tokenizer, hidden, args.max_new_tokens)
    delta_sq = 0.0
    for name, parameter in candidate.named_parameters():
        if name in initial:
            delta = parameter.detach().cpu().to(torch.float32) - initial[name].to(torch.float32)
            delta_sq += float(torch.sum(delta * delta))
    parameter_delta_l2 = math.sqrt(delta_sq)
    candidate.save_pretrained(final_dir, safe_serialization=True)
    tokenizer.save_pretrained(final_dir)
    weights = final_dir / "adapter_model.safetensors"

    hidden_ratio = after_hidden / before_hidden
    latency_ratio = after_behavior["meanLatencyMs"] / max(1.0, before_behavior["meanLatencyMs"])
    gates = {
        "weightsChanged": parameter_delta_l2 > 0,
        "validationImproved": best_validation < before_validation,
        "behavioralImprovement": after_behavior["score"] > before_behavior["score"],
        "criticalPerfect": after_behavior["criticalPassed"] == after_behavior["criticalTotal"],
        "noCriticalRegression": after_behavior["criticalPassed"] >= before_behavior["criticalPassed"],
        "hiddenLossWithinFivePercent": hidden_ratio <= 1.05,
        "latencyWithinTwentyFivePercent": latency_ratio <= 1.25,
    }
    gates["eligibleForChampion"] = all(gates.values())

    dataset = {
        "trainPaths": args.train_files,
        "validationPaths": args.validation_files,
        "testPaths": args.test_files,
        "trainSha256": {path: sha256(path) for path in args.train_files},
        "validationSha256": {path: sha256(path) for path in args.validation_files},
        "testSha256": {path: sha256(path) for path in args.test_files},
        "trainExamples": len(train),
        "validationExamples": len(validation),
        "testExamples": len(hidden),
        "criticalTrainExamples": sum(float(row.get("trainingWeight", 1.0)) == 3.0 for row in train),
        "criticalTestExamples": sum(bool(row.get("evaluation", {}).get("critical")) for row in hidden),
        "effectiveTrainingWeight": sum(float(row.get("trainingWeight", 1.0)) for row in train),
        "crossSplitOverlap": 0,
        "privateUserData": False,
        "license": "author-generated Apache-2.0-compatible",
    }
    metrics = {
        "schemaVersion": "1.0.0",
        "experimentId": args.experiment_id,
        "status": "candidate-weights-generated",
        "eligibleForChampion": gates["eligibleForChampion"],
        "baseModel": {"repository": MODEL, "revision": REVISION, "license": "Apache-2.0"},
        "baseline": {
            "runtimeId": "hector-asi-qwen15-v41",
            "adapterSha256": SOURCE_SHA256,
            "adapterBytes": SOURCE_BYTES,
            "validationLoss": before_validation,
            "hiddenTestLoss": before_hidden,
            "behavioral": before_behavior,
        },
        "method": "continued LoRA SFT from v41 with assistant-only CE and per-example risk weighting",
        "dataset": dataset,
        "hyperparameters": {
            "epochs": args.epochs,
            "bestEpoch": best_epoch,
            "maxLength": args.max_length,
            "maxNewTokens": args.max_new_tokens,
            "learningRate": args.lr,
            "optimizer": "AdamW",
            "seed": args.seed,
            "lossMasking": "assistant-response-only",
            "riskWeight": 3.0,
            "generalWeight": 1.0,
        },
        "candidate": {
            "bestValidationLoss": best_validation,
            "hiddenTestLoss": after_hidden,
            "hiddenLossRatioVsV41": hidden_ratio,
            "behavioral": after_behavior,
            "latencyRatioVsV41": latency_ratio,
            "parameterDeltaL2": parameter_delta_l2,
            "weightsGenerated": True,
            "adapterBytes": weights.stat().st_size,
            "adapterSha256": sha256(weights),
            "history": history,
        },
        "gates": gates,
        "runtime": {
            "seconds": time.time() - started,
            "peakRssMb": peak_rss_mb(),
            "python": platform.python_version(),
            "torch": torch.__version__,
            "hardware": platform.platform(),
            "githubSha": os.getenv("GITHUB_SHA"),
            "githubRunId": os.getenv("GITHUB_RUN_ID"),
        },
        "rollback": "Keep hector-asi-qwen15-v41 active unless every gate passes.",
    }
    (root / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    files = sorted(path for path in root.rglob("*") if path.is_file())
    (root / "SHA256SUMS").write_text("".join(f"{sha256(path)}  {path.relative_to(root)}\n" for path in files))
    (root / "run-manifest.json").write_text(json.dumps({
        "experimentId": args.experiment_id,
        "sourceArtifactId": 8560331055,
        "sourceAdapterSha256": SOURCE_SHA256,
        "files": {str(path.relative_to(root)): sha256(path) for path in files},
        "rollback": metrics["rollback"],
    }, indent=2, sort_keys=True) + "\n")
    print(json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
