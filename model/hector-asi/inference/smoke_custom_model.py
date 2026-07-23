from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

MANIFEST_PATH = Path(os.getenv("CHAT_CHAMPION_MANIFEST", "model/hector-asi/registry/chat-champion.json"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest() -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or manifest.get("promotionState") != "active":
        raise RuntimeError("El manifiesto del campeón no está activo")
    return manifest


def main() -> None:
    manifest = load_manifest()
    adapter_dir = Path(os.getenv("ADAPTER_DIR", "/tmp/hector-adapter/adapter"))
    output_path = Path(os.getenv("SMOKE_OUTPUT", "/tmp/hector-custom-model-smoke.json"))
    adapter_file = adapter_dir / "adapter_model.safetensors"
    actual_hash = sha256(adapter_file)
    if actual_hash != manifest["adapterSha256"]:
        raise RuntimeError(f"Hash del adaptador inválido: {actual_hash}")
    if adapter_file.stat().st_size != int(manifest["adapterBytes"]):
        raise RuntimeError("Tamaño del adaptador inválido")

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    started = time.time()
    tokenizer = AutoTokenizer.from_pretrained(manifest["baseModel"], revision=manifest["baseRevision"], use_fast=True)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
    base = AutoModelForCausalLM.from_pretrained(
        manifest["baseModel"],
        revision=manifest["baseRevision"],
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model = PeftModel.from_pretrained(base, adapter_dir, is_trainable=False)
    model.eval()
    model.config.use_cache = True

    messages = [
        {
            "role": "system",
            "content": "Eres Hector ASI. Responde en español, con honestidad y de forma breve.",
        },
        {
            "role": "user",
            "content": "Confirma en una sola oración que puedes generar una respuesta neuronal.",
        },
    ]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    encoded = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1024)
    with torch.inference_mode():
        output = model.generate(
            **encoded,
            max_new_tokens=64,
            do_sample=False,
            repetition_penalty=1.05,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    generated = output[0, encoded["input_ids"].shape[1] :]
    text = tokenizer.decode(generated, skip_special_tokens=True).strip()
    if not text:
        raise RuntimeError("La inferencia de humo devolvió texto vacío")

    evidence = {
        "ok": True,
        "runtimeId": manifest["runtimeId"],
        "baseModel": manifest["baseModel"],
        "baseRevision": manifest["baseRevision"],
        "artifactId": int(manifest["artifactId"]),
        "adapterSha256": actual_hash,
        "adapterBytes": adapter_file.stat().st_size,
        "sourceRunId": int(manifest["sourceRunId"]),
        "inputTokens": int(encoded["input_ids"].numel()),
        "outputTokens": int(generated.numel()),
        "latencyMs": round((time.time() - started) * 1000),
        "hardware": "GitHub Actions ubuntu-latest CPU",
        "response": text,
    }
    output_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == "__main__":
    main()
