# Hector ASI model

`Hector ASI` is the name of an open-weight derived model project. The name does not claim that the model is an actual artificial superintelligence.

## Cycle 1 decision

The first candidate uses `Qwen/Qwen3-4B-Instruct-2507` as its base because it is a compact multilingual instruction model released under Apache-2.0. The first adaptation method is QLoRA supervised fine-tuning (SFT), which keeps the base weights frozen and trains a small adapter in 4-bit mode.

The initial seed is intentionally small. It validates the pipeline and contracts; it is not sufficient to claim a capability improvement. A candidate may become champion only after training on a larger licensed dataset and beating the base model on held-out evaluation without critical regressions.

## Repository layout

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

The next highest-value step is a reproducible evaluator that runs base and candidate against the held-out set and emits a signed promotion report. Actual training should wait until sufficient licensed data and GPU compute are available; the current seed exists to verify the pipeline, not to overfit a six-example dataset.
