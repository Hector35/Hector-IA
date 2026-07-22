# Hector ASI v0.1 candidate model card

## Status

Planned QLoRA adapter; no trained checkpoint has been promoted yet.

## Base model

- Repository: `Qwen/Qwen3-4B-Instruct-2507`
- License: Apache-2.0
- Revision: must be pinned before a promotion run
- Base-weight hash: not recorded yet

## Intended capability

The first candidate targets verifiable planning, metacognitive caution, tool selection, result verification, resource efficiency and reversible continual learning in Spanish and English.

## Training method

- Supervised fine-tuning with TRL
- QLoRA through PEFT and bitsandbytes
- NF4 4-bit frozen base weights
- LoRA rank 32, alpha 64, all linear layers
- Default maximum sequence length: 2,048 tokens

## Data

The committed seed contains project-authored synthetic examples under Apache-2.0 and no private user data. The held-out file is structurally separated from training. This seed only validates the pipeline and must not be used to claim benchmark improvement.

## Evaluation and promotion

A candidate can become champion only when:

- it improves at least 3 percentage points on an unseen evaluation;
- secondary regression is at most 1 percentage point;
- it introduces no critical regression;
- the run is reproducible and includes rollback artifacts;
- base revision, hashes, compute, package versions and data provenance are recorded.

## Known limitations

- No adapter has been trained in this cycle because no GPU training environment was available.
- The current dataset is far too small for a useful behavioral change.
- Keyword rubrics are not a substitute for broad model evaluation.
- The project name is not evidence of artificial superintelligence.

## Safety and privacy

Private user data is excluded by default. Future data sources require explicit provenance, compatible licensing, deduplication, contamination checks and safety review before entering a training split.
