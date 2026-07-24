#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

EXPECTED_MODEL = "hector-asi-qwen15-v41"
EXPECTED_ADAPTER_SHA256 = "31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def batched(items: list[dict], size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hidden", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--max-new-tokens", type=int, default=96)
    args = parser.parse_args()

    hidden_path = Path(args.hidden)
    adapter_path = Path(args.adapter)
    weights = adapter_path / "adapter_model.safetensors"
    if not hidden_path.is_file() or not weights.is_file():
        raise SystemExit("Missing hidden benchmark or V41 adapter")
    actual_adapter_sha = sha256(weights)
    if actual_adapter_sha != EXPECTED_ADAPTER_SHA256:
        raise SystemExit(f"V41 adapter hash mismatch: {actual_adapter_sha}")

    rows = [json.loads(line) for line in hidden_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(rows) != 512 or len({row["id"] for row in rows}) != 512:
        raise SystemExit(f"Expected 512 unique hidden cases, got {len(rows)}")

    config = json.loads((adapter_path / "adapter_config.json").read_text(encoding="utf-8"))
    base_model = config["base_model_name_or_path"]
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    tokenizer = AutoTokenizer.from_pretrained(adapter_path, local_files_only=True, use_fast=True)
    tokenizer.padding_side = "left"
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    base = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
        device_map="cpu",
    )
    model = PeftModel.from_pretrained(base, adapter_path, is_trainable=False)
    model.eval()

    system = (
        "Responde con precisión y sólo con la información necesaria. "
        "Para código, entrega una función Python ejecutable. Para planes y análisis, "
        "expón condiciones, verificación y límites concretos."
    )
    predictions: list[dict] = []
    started = time.time()
    for batch_index, group in enumerate(batched(rows, max(1, args.batch_size)), start=1):
        rendered = [
            tokenizer.apply_chat_template(
                [{"role": "system", "content": system}, {"role": "user", "content": row["prompt"]}],
                tokenize=False,
                add_generation_prompt=True,
            )
            for row in group
        ]
        encoded = tokenizer(rendered, return_tensors="pt", padding=True, truncation=True, max_length=1536)
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                num_beams=1,
                use_cache=True,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        prompt_lengths = encoded["attention_mask"].sum(dim=1).tolist()
        for row, sequence, prompt_length in zip(group, generated, prompt_lengths):
            answer = tokenizer.decode(sequence[int(prompt_length):], skip_special_tokens=True).strip()
            predictions.append({
                "id": row["id"],
                "answer": answer,
                "requestedModel": EXPECTED_MODEL,
                "effectiveModel": EXPECTED_MODEL,
                "fallback": False,
            })
        print(json.dumps({"batch": batch_index, "completed": len(predictions), "total": len(rows)}), flush=True)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in predictions), encoding="utf-8")
    manifest = {
        "schemaVersion": 1,
        "model": EXPECTED_MODEL,
        "baseModel": base_model,
        "adapterSha256": actual_adapter_sha,
        "hiddenSha256": sha256(hidden_path),
        "predictionsSha256": sha256(output),
        "cases": len(predictions),
        "batchSize": args.batch_size,
        "maxNewTokens": args.max_new_tokens,
        "doSample": False,
        "elapsedSeconds": round(time.time() - started, 3),
        "torchVersion": torch.__version__,
        "device": "cpu",
        "fallback": False,
    }
    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
