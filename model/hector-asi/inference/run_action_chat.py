from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import requests
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

WORKER_ORIGIN = os.getenv("HECTOR_WORKER_ORIGIN", "https://hector-os.hectorhdzr035.workers.dev").rstrip("/")
AUDIENCE = "hector-asi-model-inference"


def oidc_token() -> str:
    request_url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    separator = "&" if "?" in request_url else "?"
    response = requests.get(
        f"{request_url}{separator}audience={AUDIENCE}",
        headers={"Authorization": f"Bearer {os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']}"},
        timeout=30,
    )
    response.raise_for_status()
    token = response.json().get("value", "")
    if not token:
        raise RuntimeError("GitHub no emitió un token OIDC")
    return token


def post_result(job_id: str, payload: dict) -> None:
    token = oidc_token()
    response = requests.post(
        f"{WORKER_ORIGIN}/api/intelligence/model-jobs/{job_id}/result",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    job_id = os.environ["MODEL_JOB_ID"]
    token = oidc_token()
    response = requests.get(
        f"{WORKER_ORIGIN}/api/intelligence/model-jobs/{job_id}/input",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    response.raise_for_status()
    job = response.json()

    adapter_dir = Path(os.environ.get("ADAPTER_DIR", "/tmp/hector-adapter/adapter"))
    adapter_file = adapter_dir / "adapter_model.safetensors"
    actual_hash = sha256(adapter_file)
    if actual_hash != job["adapterSha256"]:
        raise RuntimeError("El hash del adaptador no coincide con el trabajo autorizado")

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    started = time.time()
    tokenizer = AutoTokenizer.from_pretrained(job["baseModel"], revision=job["baseRevision"], use_fast=True)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
    base = AutoModelForCausalLM.from_pretrained(
        job["baseModel"],
        revision=job["baseRevision"],
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model = PeftModel.from_pretrained(base, adapter_dir, is_trainable=False)
    model.eval()
    model.config.use_cache = True

    messages = job["messages"]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    encoded = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
    with torch.inference_mode():
        output = model.generate(
            **encoded,
            max_new_tokens=min(256, int(job.get("maxNewTokens", 256))),
            do_sample=True,
            temperature=0.25,
            top_p=0.9,
            repetition_penalty=1.05,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    generated = output[0, encoded["input_ids"].shape[1] :]
    text = tokenizer.decode(generated, skip_special_tokens=True).strip()
    if not text:
        raise RuntimeError("El modelo propio produjo una respuesta vacía")

    post_result(
        job_id,
        {
            "text": text,
            "usage": {
                "inputTokens": int(encoded["input_ids"].numel()),
                "outputTokens": int(generated.numel()),
            },
            "runtime": {
                "model": job["runtimeId"],
                "baseModel": job["baseModel"],
                "baseRevision": job["baseRevision"],
                "adapterSha256": actual_hash,
                "latencyMs": round((time.time() - started) * 1000),
                "hardware": "GitHub Actions ubuntu-latest CPU",
            },
        },
    )
    print(json.dumps({"ok": True, "jobId": job_id, "adapterSha256": actual_hash, "outputTokens": int(generated.numel())}))


if __name__ == "__main__":
    job_id = os.environ.get("MODEL_JOB_ID", "")
    try:
        main()
    except Exception as exc:
        if job_id:
            try:
                post_result(job_id, {"error": f"{type(exc).__name__}: {exc}"})
            except Exception as callback_error:
                print(f"callback failure: {type(callback_error).__name__}", file=sys.stderr)
        raise
