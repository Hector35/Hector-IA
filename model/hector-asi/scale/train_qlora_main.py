#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_cuda(minimum_mib: int) -> dict[str, object]:
    import torch
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is required; CPU fallback is forbidden for main runs")
    free, total = torch.cuda.mem_get_info()
    free_mib = free // (1024 * 1024)
    if free_mib < minimum_mib:
        raise SystemExit(f"Insufficient free VRAM: {free_mib} MiB < {minimum_mib} MiB")
    return {"name": torch.cuda.get_device_name(0), "freeMiB": free_mib, "totalMiB": total // (1024 * 1024), "torch": torch.__version__, "cuda": torch.version.cuda}


def latest_checkpoint(output: Path) -> str | None:
    checkpoints = sorted(output.glob("checkpoint-*"), key=lambda path: int(path.name.split("-")[-1]))
    return str(checkpoints[-1]) if checkpoints else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--train", required=True)
    parser.add_argument("--validation", required=True)
    parser.add_argument("--hidden", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    from datasets import load_dataset
    from peft import LoraConfig, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer
    import torch

    config_path = Path(args.config)
    config = json.loads(config_path.read_text())
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    hardware = require_cuda(int(config["minimumFreeVramMiB"]))
    quant = config["quantization"]
    dtype = torch.bfloat16 if quant["computeDtype"] == "bfloat16" else torch.float16
    quantization_config = BitsAndBytesConfig(load_in_4bit=bool(quant["loadIn4Bit"]), bnb_4bit_quant_type=quant["quantType"], bnb_4bit_use_double_quant=bool(quant["doubleQuant"]), bnb_4bit_compute_dtype=dtype)

    tokenizer = AutoTokenizer.from_pretrained(config["baseModel"], revision=config["revision"], use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(config["baseModel"], revision=config["revision"], quantization_config=quantization_config, torch_dtype=dtype, device_map={"": 0}, attn_implementation="sdpa")
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

    lora = config["lora"]
    peft_config = LoraConfig(r=int(lora["rank"]), lora_alpha=int(lora["alpha"]), lora_dropout=float(lora["dropout"]), target_modules=lora["targetModules"], bias="none", task_type="CAUSAL_LM")
    dataset = load_dataset("json", data_files={"train": args.train, "validation": args.validation})

    def render(example: dict[str, object]) -> str:
        messages = example.get("messages")
        if isinstance(messages, list):
            return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
        prompt = str(example.get("prompt", example.get("instruction", "")))
        response = str(example.get("response", example.get("output", "")))
        return tokenizer.apply_chat_template([{"role": "user", "content": prompt}, {"role": "assistant", "content": response}], tokenize=False, add_generation_prompt=False)

    train_cfg = config["training"]
    training_args = SFTConfig(
        output_dir=str(output), num_train_epochs=float(train_cfg["epochs"]), learning_rate=float(train_cfg["learningRate"]),
        per_device_train_batch_size=int(train_cfg["microBatchSize"]), per_device_eval_batch_size=1,
        gradient_accumulation_steps=int(train_cfg["gradientAccumulationSteps"]), warmup_ratio=float(train_cfg["warmupRatio"]),
        weight_decay=float(train_cfg["weightDecay"]), max_length=int(train_cfg["maxSequenceLength"]), packing=bool(train_cfg["packing"]),
        gradient_checkpointing=bool(train_cfg["gradientCheckpointing"]), bf16=dtype == torch.bfloat16, fp16=dtype == torch.float16,
        eval_strategy="steps", save_strategy="steps", save_steps=int(train_cfg["saveSteps"]), eval_steps=int(train_cfg["evalSteps"]),
        logging_steps=int(train_cfg["loggingSteps"]), save_total_limit=3, load_best_model_at_end=True, metric_for_best_model="eval_loss",
        greater_is_better=False, report_to="none", seed=int(train_cfg["seed"]), data_seed=int(train_cfg["seed"]), dataset_text_field=None,
    )
    trainer = SFTTrainer(model=model, args=training_args, train_dataset=dataset["train"], eval_dataset=dataset["validation"], peft_config=peft_config, processing_class=tokenizer, formatting_func=render)
    resume = latest_checkpoint(output) if args.resume else None
    result = trainer.train(resume_from_checkpoint=resume)
    trainer.save_model(str(output / "adapter"))
    tokenizer.save_pretrained(str(output / "adapter"))
    adapter = output / "adapter" / "adapter_model.safetensors"
    manifest = {
        "schemaVersion": 2, "profile": config["profile"], "baseModel": config["baseModel"], "baseRevision": config["revision"],
        "hardware": hardware, "resumeFrom": resume, "trainMetrics": result.metrics,
        "inputs": {"configSha256": file_sha256(config_path), "trainSha256": file_sha256(Path(args.train)), "validationSha256": file_sha256(Path(args.validation)), "hiddenSha256": file_sha256(Path(args.hidden))},
        "adapter": {"path": str(adapter), "bytes": adapter.stat().st_size, "sha256": file_sha256(adapter)},
        "packages": subprocess.check_output([os.sys.executable, "-m", "pip", "freeze"], text=True).splitlines(),
    }
    (output / "run-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"adapterSha256": manifest["adapter"]["sha256"], "resumeFrom": resume}, sort_keys=True))


if __name__ == "__main__":
    main()
