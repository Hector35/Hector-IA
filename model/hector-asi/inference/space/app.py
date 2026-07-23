from __future__ import annotations

import os
import threading
import time
import uuid
from typing import Literal

import torch
from fastapi import FastAPI, HTTPException
from peft import PeftModel
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-1.5B-Instruct")
MODEL_REVISION = os.getenv("MODEL_REVISION", "989aa7980e4cf806f80c7fef2b1adb7bc71aa306")
ADAPTER_PATH = os.getenv("ADAPTER_PATH", "/app/adapter")
RUNTIME_ID = os.getenv("RUNTIME_ID", "hector-asi-qwen15-v10")
ADAPTER_SHA256 = os.getenv("ADAPTER_SHA256", "unknown")
MAX_NEW_TOKENS = max(16, min(512, int(os.getenv("MAX_NEW_TOKENS", "256"))))

app = FastAPI(title="Hector ASI custom model", version="1.0.0")
_state: dict[str, object] = {"status": "starting", "error": None, "loaded_at": None}
_lock = threading.Lock()
_model = None
_tokenizer = None


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class ChatCompletionRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage] = Field(min_length=1, max_length=32)
    max_tokens: int = Field(default=256, ge=1, le=512)
    temperature: float = Field(default=0.25, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, gt=0.0, le=1.0)


def _load() -> None:
    global _model, _tokenizer
    with _lock:
        if _state["status"] in {"ready", "loading"}:
            return
        _state.update(status="loading", error=None)
        try:
            torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
            tokenizer = AutoTokenizer.from_pretrained(
                MODEL_ID,
                revision=MODEL_REVISION,
                use_fast=True,
            )
            tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
            base = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                revision=MODEL_REVISION,
                torch_dtype=torch.float32,
                low_cpu_mem_usage=True,
                attn_implementation="eager",
            )
            model = PeftModel.from_pretrained(base, ADAPTER_PATH, is_trainable=False)
            model.config.use_cache = True
            model.eval()
            _tokenizer = tokenizer
            _model = model
            _state.update(status="ready", loaded_at=int(time.time()), error=None)
        except Exception as exc:  # pragma: no cover - runtime evidence reports this
            _state.update(status="error", error=f"{type(exc).__name__}: {exc}")


@app.on_event("startup")
def start_loader() -> None:
    threading.Thread(target=_load, name="hector-model-loader", daemon=True).start()


@app.get("/")
def root() -> dict[str, object]:
    return {
        "service": "Hector ASI custom model",
        "runtime": RUNTIME_ID,
        "baseModel": MODEL_ID,
        "adapterSha256": ADAPTER_SHA256,
        "status": _state["status"],
    }


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": _state["status"] == "ready",
        "status": _state["status"],
        "runtime": RUNTIME_ID,
        "baseModel": MODEL_ID,
        "revision": MODEL_REVISION,
        "adapterSha256": ADAPTER_SHA256,
        "loadedAt": _state["loaded_at"],
        "error": _state["error"],
    }


@app.post("/v1/chat/completions")
def chat(request: ChatCompletionRequest) -> dict[str, object]:
    if _state["status"] != "ready" or _model is None or _tokenizer is None:
        raise HTTPException(status_code=503, detail={"status": _state["status"], "error": _state["error"]})

    messages = [item.model_dump() for item in request.messages]
    prompt = _tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    encoded = _tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
    max_new_tokens = min(request.max_tokens, MAX_NEW_TOKENS)
    generation = {
        "max_new_tokens": max_new_tokens,
        "do_sample": request.temperature > 0,
        "temperature": max(request.temperature, 1e-5),
        "top_p": request.top_p,
        "pad_token_id": _tokenizer.pad_token_id,
        "eos_token_id": _tokenizer.eos_token_id,
        "repetition_penalty": 1.05,
    }
    started = time.time()
    with _lock, torch.inference_mode():
        output = _model.generate(**encoded, **generation)
    generated = output[0, encoded["input_ids"].shape[1] :]
    text = _tokenizer.decode(generated, skip_special_tokens=True).strip()
    if not text:
        raise HTTPException(status_code=502, detail="El adaptador produjo una respuesta vacía")

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": RUNTIME_ID,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
        "usage": {
            "prompt_tokens": int(encoded["input_ids"].numel()),
            "completion_tokens": int(generated.numel()),
            "total_tokens": int(encoded["input_ids"].numel() + generated.numel()),
        },
        "runtime": {
            "baseModel": MODEL_ID,
            "revision": MODEL_REVISION,
            "adapterSha256": ADAPTER_SHA256,
            "latencyMs": round((time.time() - started) * 1000),
        },
    }
