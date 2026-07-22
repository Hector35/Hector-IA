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
import torch.nn.functional as F
from peft import LoraConfig, TaskType, get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM, AutoTokenizer, set_seed

MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
REVISION = "a338b55dd21219a5f4da42bc11a9313d1a27d4cc"
SYSTEM = "Eres Héctor. Distingues evidencia, incertidumbre, seguridad y rollback; prefieres respuestas verificables y calibradas."


def args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train a real Qwen preference LoRA adapter with DPO.")
    p.add_argument("--train-file", default="model/hector-asi/data/qwen05-dpo-v1.jsonl")
    p.add_argument("--eval-file", default="model/hector-asi/evals/qwen05-dpo-held-out-v1.jsonl")
    p.add_argument("--output-dir", default="artifacts/hector-asi-qwen05-dpo-v1")
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--max-length", type=int, default=160)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--beta", type=float, default=0.1)
    p.add_argument("--seed", type=int, default=35)
    return p.parse_args()


def read_pairs(path: Path) -> list[dict[str, Any]]:
    rows = [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
    if not rows:
        raise ValueError(f"empty dataset: {path}")
    ids: set[str] = set()
    for row in rows:
        if not row.get("id") or row["id"] in ids:
            raise ValueError(f"duplicate or missing id: {row.get('id')}")
        ids.add(row["id"])
        if row.get("verification", {}).get("verified") is not True:
            raise ValueError(f"unverified pair: {row['id']}")
        if not all(str(row.get(k, "")).strip() for k in ("prompt", "chosen", "rejected")):
            raise ValueError(f"incomplete pair: {row['id']}")
        if row["chosen"].strip() == row["rejected"].strip():
            raise ValueError(f"identical responses: {row['id']}")
    return rows


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def versions() -> list[str]:
    out = subprocess.run([os.sys.executable, "-m", "pip", "freeze"], check=True, capture_output=True, text=True)
    return sorted(x for x in out.stdout.splitlines() if x.strip())


def encode(tokenizer: Any, prompt: str, response: str, max_length: int) -> dict[str, torch.Tensor]:
    prefix = tokenizer.apply_chat_template(
        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        tokenize=False,
        add_generation_prompt=True,
    )
    full = prefix + response + tokenizer.eos_token
    prefix_ids = tokenizer(prefix, add_special_tokens=False)["input_ids"]
    batch = tokenizer(full, add_special_tokens=False, return_tensors="pt", truncation=True, max_length=max_length)
    labels = batch["input_ids"].clone()
    prompt_len = min(len(prefix_ids), labels.shape[1] - 1)
    labels[:, :prompt_len] = -100
    if int((labels != -100).sum()) < 2:
        raise ValueError("response truncated completely; increase max length")
    batch["labels"] = labels
    return batch


def response_logp(model: Any, batch: dict[str, torch.Tensor]) -> torch.Tensor:
    output = model(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"])
    logits = output.logits[:, :-1, :]
    targets = batch["labels"][:, 1:]
    mask = targets != -100
    safe_targets = targets.masked_fill(~mask, 0)
    token_logp = F.log_softmax(logits, dim=-1).gather(-1, safe_targets.unsqueeze(-1)).squeeze(-1)
    return (token_logp * mask).sum(dim=-1)


def language_loss(model: Any, encoded_chosen: list[dict[str, torch.Tensor]]) -> float:
    model.eval()
    values: list[float] = []
    with torch.no_grad():
        for batch in encoded_chosen:
            values.append(float(model(**batch).loss.detach().cpu()))
    return sum(values) / len(values)


def preference_metrics(
    model: Any,
    pairs: list[tuple[dict[str, torch.Tensor], dict[str, torch.Tensor]]],
) -> dict[str, float]:
    model.eval()
    margins: list[float] = []
    with torch.no_grad():
        for chosen, rejected in pairs:
            margins.append(float((response_logp(model, chosen) - response_logp(model, rejected)).cpu()))
    return {
        "accuracy": sum(x > 0 for x in margins) / len(margins),
        "meanMargin": sum(margins) / len(margins),
        "minimumMargin": min(margins),
    }


def main() -> None:
    a = args()
    set_seed(a.seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)

    train_path, eval_path = Path(a.train_file), Path(a.eval_file)
    train_rows, eval_rows = read_pairs(train_path), read_pairs(eval_path)
    overlap = {x["id"] for x in train_rows} & {x["id"] for x in eval_rows}
    if overlap:
        raise ValueError(f"train/eval contamination: {sorted(overlap)}")

    started = time.time()
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    train_pairs = [(encode(tokenizer, x["prompt"], x["chosen"], a.max_length), encode(tokenizer, x["prompt"], x["rejected"], a.max_length)) for x in train_rows]
    eval_pairs = [(encode(tokenizer, x["prompt"], x["chosen"], a.max_length), encode(tokenizer, x["prompt"], x["rejected"], a.max_length)) for x in eval_rows]
    eval_chosen = [x[0] for x in eval_pairs]

    base = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, torch_dtype=torch.float32, low_cpu_mem_usage=True)
    base.config.use_cache = False
    base_pref = preference_metrics(base, eval_pairs)
    base_language_loss = language_loss(base, eval_chosen)

    base.eval()
    reference_train: list[tuple[torch.Tensor, torch.Tensor]] = []
    with torch.no_grad():
        for chosen, rejected in train_pairs:
            reference_train.append((response_logp(base, chosen).detach(), response_logp(base, rejected).detach()))

    config = LoraConfig(
        r=4,
        lora_alpha=8,
        lora_dropout=0.0,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=["q_proj", "v_proj"],
    )
    model = get_peft_model(base, config)
    trainable = [(n, p) for n, p in model.named_parameters() if p.requires_grad]
    if not trainable:
        raise RuntimeError("no trainable LoRA parameters")
    initial = [p.detach().clone() for _, p in trainable]
    optimizer = AdamW((p for _, p in trainable), lr=a.lr)

    losses: list[float] = []
    model.train()
    for _ in range(a.epochs):
        for index, (chosen, rejected) in enumerate(train_pairs):
            optimizer.zero_grad(set_to_none=True)
            pi_chosen = response_logp(model, chosen)
            pi_rejected = response_logp(model, rejected)
            ref_chosen, ref_rejected = reference_train[index]
            logits = a.beta * ((pi_chosen - pi_rejected) - (ref_chosen - ref_rejected))
            loss = -F.logsigmoid(logits).mean()
            if not torch.isfinite(loss):
                raise RuntimeError(f"non-finite DPO loss: {loss}")
            loss.backward()
            torch.nn.utils.clip_grad_norm_((p for _, p in trainable), 1.0)
            optimizer.step()
            losses.append(float(loss.detach()))

    delta_sq = sum(float(torch.sum((p.detach() - before) ** 2)) for (_, p), before in zip(trainable, initial))
    parameter_delta = math.sqrt(delta_sq)
    if not math.isfinite(parameter_delta) or parameter_delta <= 0:
        raise RuntimeError("DPO did not change LoRA weights")

    candidate_pref = preference_metrics(model, eval_pairs)
    candidate_language_loss = language_loss(model, eval_chosen)

    root = Path(a.output_dir)
    adapter = root / "adapter"
    adapter.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(adapter, safe_serialization=True)
    tokenizer.save_pretrained(adapter)
    weight_path = adapter / "adapter_model.safetensors"
    if not weight_path.is_file() or weight_path.stat().st_size < 1_000_000:
        raise RuntimeError("adapter weights missing or unexpectedly small")

    (root / "environment.txt").write_text("\n".join(versions()) + "\n", encoding="utf-8")
    metrics = {
        "schemaVersion": "1.0.0",
        "experimentId": "hector-asi-qwen05-dpo-v1",
        "status": "experimental-preference-weights-generated",
        "eligibleForChampion": False,
        "baseModel": {"repository": MODEL, "revision": REVISION, "license": "Apache-2.0"},
        "method": "LoRA Direct Preference Optimization",
        "dataset": {
            "trainPath": str(train_path), "trainSha256": sha256(train_path), "trainPairs": len(train_rows),
            "evalPath": str(eval_path), "evalSha256": sha256(eval_path), "evalPairs": len(eval_rows),
            "privateUserData": False, "splitContaminationChecked": True,
        },
        "hyperparameters": {"epochs": a.epochs, "maxLength": a.max_length, "learningRate": a.lr, "beta": a.beta, "seed": a.seed, "rank": 4, "alpha": 8, "dropout": 0.0},
        "results": {
            "steps": len(losses), "firstDpoLoss": losses[0], "finalDpoLoss": losses[-1],
            "basePreferenceAccuracy": base_pref["accuracy"], "candidatePreferenceAccuracy": candidate_pref["accuracy"],
            "baseMeanPreferenceMargin": base_pref["meanMargin"], "candidateMeanPreferenceMargin": candidate_pref["meanMargin"],
            "baseLanguageLoss": base_language_loss, "candidateLanguageLoss": candidate_language_loss,
            "languageLossRelativeChange": (candidate_language_loss - base_language_loss) / base_language_loss,
            "parameterDeltaL2": parameter_delta, "trainableParameters": sum(p.numel() for _, p in trainable),
            "weightsGenerated": True, "adapterBytes": weight_path.stat().st_size, "adapterSha256": sha256(weight_path),
        },
        "promotionDecision": {"decision": "evaluate-only", "blockedBy": "0.5B base and small hidden preference set; broad safety, transfer and Qwen3-4B evidence still required."},
        "runtime": {"seconds": time.time() - started, "python": platform.python_version(), "torch": torch.__version__, "githubSha": os.getenv("GITHUB_SHA"), "githubRunId": os.getenv("GITHUB_RUN_ID")},
    }
    (root / "metrics.json").write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    files = sorted(x for x in root.rglob("*") if x.is_file())
    (root / "SHA256SUMS").write_text("".join(f"{sha256(x)}  {x.relative_to(root)}\n" for x in files), encoding="utf-8")
    print(json.dumps(metrics, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
