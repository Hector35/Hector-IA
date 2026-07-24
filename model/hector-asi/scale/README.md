# Héctor ASI · Compute Scale Pipeline

Provider-neutral execution path for substantial QLoRA runs. This pipeline refuses micro-candidates.

## Main-run gates

- canonical train examples >= 10,000
- canonical hidden benchmark examples >= 500
- CUDA GPU available with validated free VRAM
- checkpoint write/read/resume probe succeeds
- immutable dataset and benchmark SHA-256 values are recorded

## Target profiles

| Profile | Base | Admission VRAM | Sequence | Microbatch | Accumulation |
|---|---|---:|---:|---:|---:|
| `qwen3-8b-main` | `Qwen/Qwen3-8B` | 16 GiB | 2048 | 1 | 32 |
| `qwen3-14b-main` | `Qwen/Qwen3-14B` | 24 GiB | 1536 | 1 | 64 |

Admission VRAM is a conservative gate. The hardware probe records actual GPU, CUDA, RAM and disk before launch.

## Commands

```bash
python model/hector-asi/scale/probe_compute.py --output artifacts/compute-probe.json
python model/hector-asi/scale/preflight.py \
  --config model/hector-asi/scale/qwen3-8b-main.json \
  --train model/hector-asi/data/canonical/train.jsonl \
  --validation model/hector-asi/data/canonical/validation.jsonl \
  --hidden model/hector-asi/evals/benchmark-v2/hidden.jsonl \
  --probe artifacts/compute-probe.json \
  --output artifacts/main-run-preflight.json
```

After a successful preflight, launch the provider-neutral command emitted in `main-run-preflight.json`. The workflow `.github/workflows/hector-main-qlora.yml` runs only on an explicitly attached GPU runner and never falls back to CPU.