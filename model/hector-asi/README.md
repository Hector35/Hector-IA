# Hector ASI model

`Hector ASI` is the name of an open-weight derived model project. The name does not claim that the model is an actual artificial superintelligence.

## Operational base available now

`Héctor Base` is already operational for interactive conversation and utility tasks. It uses open models already trained and hosted through Cloudflare Workers AI:

- `@cf/meta/llama-3.2-3b-instruct` for general conversation;
- `@cf/ibm-granite/granite-4.0-h-micro` for utility tasks;
- `hector-rules-v1` for deterministic local operations.

This operational base runs under Hector OS identity, memory, tools, routing and evidence controls, but it does **not** contain custom Hector weights yet.

The interactive chat is open-model-only:

- OpenAI is not authorized to answer chat messages;
- complex tasks may use multiple open-model passes for architect, adversary and judge roles;
- current information is not searched live by the chat, so the model must disclose the limit, abstain or request evidence;
- sensitive requests receive a conservative open-model response with explicit limits;
- if Workers AI is unavailable or fails, the chat fails visibly instead of silently forwarding the message to OpenAI.

OpenAI remains available outside the interactive chat as a teacher and evaluator for licensed dataset generation, preference data, critique, candidate evaluation and training-pipeline diagnostics. Its machine-readable boundary lives in `runtime-registry.json`.

The custom Qwen candidate described below continues in parallel and only becomes a Hector-trained champion after real training and promotion.

## Cycle 1 decision

The first custom candidate uses `Qwen/Qwen3-4B-Instruct-2507` as its base because it is a compact multilingual instruction model released under Apache-2.0. The first adaptation method is QLoRA supervised fine-tuning (SFT), which keeps the base weights frozen and trains a small adapter in 4-bit mode.

The initial seed is intentionally small. It validates the pipeline and contracts; it is not sufficient to claim a capability improvement. A candidate may become champion only after training on a larger licensed dataset and beating the base model on held-out evaluation without critical regressions.

## Repository layout

- `runtime-registry.json`: active operational base, chat-provider boundary and training-provider roles.
- `model-registry.json`: champion/candidate state, legal metadata and promotion gates.
- `data/*.manifest.json`: provenance, license and privacy metadata.
- `data/*.jsonl`: verified training examples.
- `evals/*.jsonl`: held-out prompts excluded from training.
- `train_sft.py`: reproducible QLoRA/SFT job.
- `validate.mjs`: zero-dependency artifact and contamination checks.
- `requirements.txt`: isolated Python training dependencies.

Large weights, adapters and generated checkpoints belong in R2 or a model registry. They are ignored by Git and must be referenced by immutable hashes in `model-registry.json` before promotion.

## Validate without a GPU

```bash
npm run model:validate
python model/hector-asi/train_sft.py --dry-run
```

The Python dry run imports the training stack. Create an isolated environment first:

```bash
python -m venv model/hector-asi/.venv
source model/hector-asi/.venv/bin/activate
pip install -r model/hector-asi/requirements.txt
```

## Train a candidate

A CUDA GPU with bitsandbytes support is required for the default QLoRA job:

```bash
python model/hector-asi/train_sft.py \
  --model Qwen/Qwen3-4B-Instruct-2507 \
  --train-file model/hector-asi/data/sft-seed-v1.jsonl \
  --output-dir artifacts/hector-asi-v0.1-qwen3-4b-sft/adapter
```

Before a real promotion run:

1. Pin the exact base revision and record a weight hash.
2. Expand the training set with licensed, verified examples.
3. Keep evaluation prompts unavailable to the training pipeline.
4. Record GPU, package versions, seed, wall time and token count.
5. Evaluate base and candidate with identical decoding parameters.
6. Reject candidates with critical regressions or unverifiable provenance.
7. Upload the adapter and metrics externally; store immutable references in the registry.

## Next experiment

The next highest-value step is a reproducible evaluator that runs base and candidate against the held-out set and emits a signed promotion report. Actual custom-weight training should wait until sufficient licensed data and GPU compute are available; the current seed exists to verify the pipeline, not to overfit a six-example dataset.
