# Hector ASI metacognition benchmark

This module evaluates control decisions separately from answer fluency. It is intentionally model-agnostic and can score the open-weight base, an adapter candidate, a router or a dedicated metacognitive controller.

## Measured capabilities

- confidence calibration through Brier score;
- overconfidence on incorrect answers;
- detection of negative evidence;
- action and strategy selection;
- strategy change after repeated failure;
- correct stopping and abstention;
- explicit recognition of operational limits.

## Output contract

Each model output is one JSONL row:

```json
{"id":"meta-cal-001","confidence":0.6,"correct":true,"action":"verify","changedStrategy":false,"stopped":false,"detectedFailure":false,"rationale":"...","limitExplanation":"..."}
```

Allowed actions are `answer`, `verify`, `revise`, `escalate`, `use-tool`, `stop` and `abstain`.

## Run

```bash
node model/hector-asi/evaluate_metacognition.mjs \
  model/hector-asi/evals/metacognition-v1.jsonl \
  path/to/model-outputs.jsonl \
  artifacts/hector-asi-metacognition.json

npx vitest run tests/hector-asi-metacognition.test.mjs
```

The committed fixture validates the evaluator itself. It is not a trained-model baseline and must never be reported as model performance.

## Training asset

`data/metacognition-preferences-v1.jsonl` contains project-authored chosen/rejected pairs suitable for expanding into DPO or reward-model data. It contains no private user data and is released with the project under Apache-2.0. Eight examples are sufficient to validate schemas only, not to train a useful controller.

## Promotion guidance

A candidate should not be promoted from a single aggregate score. Require at minimum:

- lower or equal Brier score;
- lower overconfidence on errors;
- no regression in failure detection, escalation, stopping or abstention;
- improvement on a hidden set that was unavailable to training;
- repeated evaluation with pinned decoding settings;
- rollback artifacts and valid provenance.

The next experiment should run the selected base model and first QLoRA candidate on this benchmark, then expand the held-out set with licensed adversarial cases before any claim of metacognitive improvement.
