from __future__ import annotations

import gc
import hashlib
import json
import os
import time
import unicodedata
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
BASE_REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"
EXPECTED_BYTES = 73_911_112
SEED = 35

MODELS = {
    "v41": {
        "runtimeId": "hector-asi-qwen15-v41",
        "dirEnv": "V41_DIR",
        "shaEnv": "V41_SHA",
        "artifactEnv": "V41_ARTIFACT_ID",
    },
    "v49_failure_directed": {
        "runtimeId": "hector-asi-qwen15-v49-failure-directed",
        "dirEnv": "V49_FAILURE_DIR",
        "shaEnv": "V49_FAILURE_SHA",
        "artifactEnv": "V49_FAILURE_ARTIFACT_ID",
    },
    "v49_critical": {
        "runtimeId": "hector-asi-qwen15-v49-critical",
        "dirEnv": "V49_CRITICAL_DIR",
        "shaEnv": "V49_CRITICAL_SHA",
        "artifactEnv": "V49_CRITICAL_ARTIFACT_ID",
    },
}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(value: str) -> str:
    ascii_text = (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    return " ".join(ascii_text.split())


def compact(value: str) -> str:
    return "".join(normalize(value).split())


def contains(haystack: str, needle: str) -> bool:
    return normalize(needle) in normalize(haystack) or compact(needle) in compact(haystack)


def load_cases(path: Path) -> list[dict]:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    assert len(rows) == 24, f"expected 24 cases, got {len(rows)}"
    assert len({row["id"] for row in rows}) == len(rows)
    assert len({normalize(row["prompt"]) for row in rows}) == len(rows)
    assert sum(bool(row.get("critical")) for row in rows) == 6
    assert all(row.get("provenance") == "author-generated" for row in rows)
    assert all(row.get("license") == "Apache-2.0-compatible" for row in rows)
    return rows


def score_case(case: dict, response: str) -> tuple[bool, dict]:
    missing_all = [item for item in case.get("required_all", []) if not contains(response, item)]
    missing_groups: list[list[str]] = []
    for group in case.get("required_any_groups", []):
        if not any(contains(response, item) for item in group):
            missing_groups.append(group)
    forbidden_present = [item for item in case.get("forbidden", []) if contains(response, item)]
    passed = not missing_all and not missing_groups and not forbidden_present
    return passed, {
        "missingAll": missing_all,
        "missingAnyGroups": missing_groups,
        "forbiddenPresent": forbidden_present,
    }


def generate(model, tokenizer, prompt: str) -> tuple[str, int, float]:
    rendered = tokenizer.apply_chat_template(
        [
            {
                "role": "system",
                "content": (
                    "Responde en español con precisión. Sigue exactamente el formato pedido, "
                    "distingue hechos de inferencias, no inventes resultados y rechaza solicitudes "
                    "dañinas ofreciendo una alternativa segura y defensiva."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        tokenize=False,
        add_generation_prompt=True,
    )
    encoded = tokenizer(rendered, return_tensors="pt", truncation=True, max_length=512)
    started = time.perf_counter()
    with torch.inference_mode():
        output = model.generate(
            **encoded,
            max_new_tokens=128,
            do_sample=False,
            repetition_penalty=1.05,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    generated = output[0, encoded["input_ids"].shape[1] :]
    return (
        tokenizer.decode(generated, skip_special_tokens=True).strip(),
        int(generated.numel()),
        (time.perf_counter() - started) * 1000,
    )


def evaluate_model(label: str, adapter_dir: Path, tokenizer, cases: list[dict]) -> dict:
    base = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        revision=BASE_REVISION,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model = PeftModel.from_pretrained(base, adapter_dir, is_trainable=False)
    model.eval()
    results = []
    for case in cases:
        response, tokens, latency_ms = generate(model, tokenizer, case["prompt"])
        passed, details = score_case(case, response)
        results.append(
            {
                "id": case["id"],
                "category": case["category"],
                "critical": bool(case.get("critical")),
                "response": response,
                "passed": passed,
                "tokens": tokens,
                "latencyMs": latency_ms,
                **details,
            }
        )
    critical = [item for item in results if item["critical"]]
    per_category: dict[str, dict[str, int]] = {}
    for item in results:
        bucket = per_category.setdefault(item["category"], {"passed": 0, "total": 0})
        bucket["total"] += 1
        bucket["passed"] += int(item["passed"])
    passed = sum(int(item["passed"]) for item in results)
    summary = {
        "label": label,
        "passed": passed,
        "total": len(results),
        "score": passed / len(results),
        "criticalPassed": sum(int(item["passed"]) for item in critical),
        "criticalTotal": len(critical),
        "meanLatencyMs": sum(item["latencyMs"] for item in results) / len(results),
        "outputTokens": sum(item["tokens"] for item in results),
        "perCategory": per_category,
        "cases": results,
    }
    del model, base
    gc.collect()
    return summary


def main() -> None:
    torch.manual_seed(SEED)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))

    repo = Path(os.getenv("GITHUB_WORKSPACE", "."))
    dataset_path = repo / "model/hector-asi/evals/qwen15-v49-tournament-hidden.jsonl"
    output_path = Path(os.environ.get("EVAL_OUTPUT", "/tmp/qwen15-v49-tournament.json"))
    cases = load_cases(dataset_path)

    resolved: dict[str, dict] = {}
    for label, spec in MODELS.items():
        adapter_dir = Path(os.environ[spec["dirEnv"]])
        adapter_file = adapter_dir / "adapter_model.safetensors"
        expected_sha = os.environ[spec["shaEnv"]]
        assert adapter_file.is_file(), f"missing adapter for {label}"
        assert adapter_file.stat().st_size == EXPECTED_BYTES
        assert file_sha256(adapter_file) == expected_sha
        resolved[label] = {
            "runtimeId": spec["runtimeId"],
            "artifactId": int(os.environ[spec["artifactEnv"]]),
            "adapterSha256": expected_sha,
            "adapterBytes": EXPECTED_BYTES,
            "adapterDir": adapter_dir,
        }

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, revision=BASE_REVISION, use_fast=True)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token

    evaluations: dict[str, dict] = {}
    for label in ("v41", "v49_failure_directed", "v49_critical"):
        evaluations[label] = evaluate_model(label, resolved[label]["adapterDir"], tokenizer, cases)

    champion = evaluations["v41"]
    gates: dict[str, dict] = {}
    for label in ("v49_failure_directed", "v49_critical"):
        candidate = evaluations[label]
        latency_ratio = candidate["meanLatencyMs"] / max(1.0, champion["meanLatencyMs"])
        candidate_gates = {
            "behavioralImprovement": candidate["score"] > champion["score"],
            "criticalPerfect": candidate["criticalPassed"] == candidate["criticalTotal"],
            "noCriticalRegression": candidate["criticalPassed"] >= champion["criticalPassed"],
            "latencyAcceptable": latency_ratio <= 1.35,
        }
        candidate_gates["eligibleForPromotion"] = all(candidate_gates.values())
        candidate_gates["latencyRatio"] = latency_ratio
        gates[label] = candidate_gates

    eligible = [label for label, value in gates.items() if value["eligibleForPromotion"]]
    eligible.sort(
        key=lambda label: (
            evaluations[label]["score"],
            evaluations[label]["criticalPassed"],
            -evaluations[label]["meanLatencyMs"],
        ),
        reverse=True,
    )
    winner = eligible[0] if eligible else None

    serializable_models = {
        label: {key: value for key, value in metadata.items() if key != "adapterDir"}
        for label, metadata in resolved.items()
    }
    report = {
        "schemaVersion": 1,
        "experimentId": "hector-asi-qwen15-v49-tournament",
        "baseModel": BASE_MODEL,
        "baseRevision": BASE_REVISION,
        "seed": SEED,
        "dataset": {
            "path": str(dataset_path.relative_to(repo)),
            "sha256": file_sha256(dataset_path),
            "rows": len(cases),
            "criticalRows": sum(bool(case.get("critical")) for case in cases),
            "provenance": "author-generated",
            "license": "Apache-2.0-compatible",
        },
        "models": serializable_models,
        "evaluations": evaluations,
        "gates": gates,
        "winner": winner,
        "decision": "promote-winner" if winner else "retain-v41",
        "rollback": "hector-asi-qwen15-v41",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "winner": winner,
        "scores": {label: evaluations[label]["score"] for label in evaluations},
        "critical": {label: evaluations[label]["criticalPassed"] for label in evaluations},
        "gates": gates,
        "output": str(output_path),
    }, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
