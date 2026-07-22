from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

DEFAULT_MODEL = "Qwen/Qwen3-4B-Instruct-2507"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the Hector ASI v0.1 QLoRA adapter.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--revision", default="main")
    parser.add_argument("--train-file", default="model/hector-asi/data/sft-seed-v1.jsonl")
    parser.add_argument("--output-dir", default="artifacts/hector-asi-v0.1-qwen3-4b-sft/adapter")
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--seed", type=int, default=35)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    train_path = Path(args.train_file)
    if not train_path.exists():
        raise FileNotFoundError(train_path)

    rows = [json.loads(line) for line in train_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows or any(not row.get("verification", {}).get("verified") for row in rows):
        raise ValueError("Training data must contain only explicitly verified examples.")

    if args.dry_run:
        print(json.dumps({"model": args.model, "revision": args.revision, "examples": len(rows), "output": args.output_dir}, indent=2))
        return

    dataset = load_dataset("json", data_files={"train": str(train_path)}, split="train")
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        revision=args.revision,
        quantization_config=quantization,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model, revision=args.revision, use_fast=True)
    peft = LoraConfig(
        r=32,
        lora_alpha=64,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
    )
    config = SFTConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=16,
        learning_rate=2e-4,
        warmup_ratio=0.05,
        lr_scheduler_type="cosine",
        logging_steps=1,
        save_strategy="epoch",
        bf16=True,
        gradient_checkpointing=True,
        max_length=args.max_length,
        seed=args.seed,
        report_to="none",
    )
    trainer = SFTTrainer(
        model=model,
        args=config,
        train_dataset=dataset,
        processing_class=tokenizer,
        peft_config=peft,
    )
    trainer.train()
    trainer.save_model(args.output_dir)


if __name__ == "__main__":
    main()
