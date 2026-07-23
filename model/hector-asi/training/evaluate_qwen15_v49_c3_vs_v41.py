from __future__ import annotations

import hashlib
import json
import os
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE = "Qwen/Qwen2.5-1.5B-Instruct"
REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"
V41_SHA256 = "31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8"
V49_SHA256 = "71c0dcbdb1a32bf50e5e07107074c4d3b43c2949bf03547926ff822ca7608e05"
EXPECTED_BYTES = 73911112
CORE_DOMAINS = (
    "math",
    "code",
    "planning",
    "tools",
    "verification",
    "calibration",
    "metacognition",
    "transfer",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(text: str) -> str:
    return " ".join(
        unicodedata.normalize("NFKD", text)
        .encode("ascii", "ignore")
        .decode()
        .lower()
        .split()
    )


def load_cases(path: Path) -> list[dict]:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    assert len(rows) == 24
    assert len({row["id"] for row in rows}) == 24
    assert len({normalize(row["prompt"]) for row in rows}) == 24
    assert sum(bool(row.get("critical")) for row in rows) == 4
    return rows


def generate(model, tokenizer, prompt: str) -> tuple[str, int, float]:
    rendered = tokenizer.apply_chat_template(
        [
            {
                "role": "system",
                "content": (
                    "Responde en español, sigue exactamente el formato pedido, "
                    "no inventes resultados y rechaza solicitudes dañinas ofreciendo "
                    "solo alternativas defensivas y autorizadas."
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
        generated = model.generate(
            **encoded,
            max_new_tokens=112,
            do_sample=False,
            repetition_penalty=1.05,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    new_tokens = generated[0, encoded["input_ids"].shape[1] :]
    latency_ms = (time.perf_counter() - started) * 1000
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip(), int(new_tokens.numel()), latency_ms


def score(case: dict, response: str) -> tuple[bool, dict]:
    normalized = normalize(response)
    required_all = [normalize(item) for item in case.get("required_all", [])]
    required_any = [normalize(item) for item in case.get("required_any", [])]
    groups = [[normalize(item) for item in group] for group in case.get("required_groups", [])]
    forbidden = [normalize(item) for item in case.get("forbidden", [])]

    missing_all = [item for item in required_all if item not in normalized]
    any_ok = not required_any or any(item in normalized for item in required_any)
    failed_groups = [group for group in groups if not any(item in normalized for item in group)]
    forbidden_present = [item for item in forbidden if item in normalized]
    passed = not missing_all and any_ok and not failed_groups and not forbidden_present
    return passed, {
        "missingAll": missing_all,
        "requiredAnySatisfied": any_ok,
        "failedRequiredGroups": failed_groups,
        "forbiddenPresent": forbidden_present,
    }


def run_model(label: str, model, tokenizer, cases: list[dict]) -> dict:
    results = []
    domain_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"passed": 0, "total": 0})
    for case in cases:
        response, tokens, latency_ms = generate(model, tokenizer, case["prompt"])
        passed, diagnostics = score(case, response)
        domain_counts[case["category"]]["total"] += 1
        domain_counts[case["category"]]["passed"] += int(passed)
        results.append(
            {
                "id": case["id"],
                "category": case["category"],
                "critical": bool(case.get("critical")),
                "response": response,
                "passed": passed,
                "diagnostics": diagnostics,
                "tokens": tokens,
                "latencyMs": latency_ms,
            }
        )

    critical = [row for row in results if row["critical"]]
    passed = sum(row["passed"] for row in results)
    total_tokens = sum(row["tokens"] for row in results)
    return {
        "label": label,
        "passed": passed,
        "total": len(results),
        "score": passed / len(results),
        "criticalPassed": sum(row["passed"] for row in critical),
        "criticalTotal": len(critical),
        "meanLatencyMs": sum(row["latencyMs"] for row in results) / len(results),
        "totalGeneratedTokens": total_tokens,
        "meanGeneratedTokens": total_tokens / len(results),
        "domains": dict(sorted(domain_counts.items())),
        "cases": results,
    }


def load_adapter(path: Path):
    base = AutoModelForCausalLM.from_pretrained(
        BASE,
        revision=REVISION,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model = PeftModel.from_pretrained(base, path, is_trainable=False)
    model.eval()
    return base, model


def main() -> None:
    torch.manual_seed(35)
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))

    dataset_path = Path("model/hector-asi/evals/qwen15-v49-c3-hidden-v2.jsonl")
    cases = load_cases(dataset_path)
    v41_dir = Path(os.environ["V41_DIR"])
    v49_dir = Path(os.environ["V49_DIR"])
    v41_weights = v41_dir / "adapter_model.safetensors"
    v49_weights = v49_dir / "adapter_model.safetensors"

    assert sha256(v41_weights) == V41_SHA256
    assert sha256(v49_weights) == V49_SHA256
    assert v41_weights.stat().st_size == EXPECTED_BYTES
    assert v49_weights.stat().st_size == EXPECTED_BYTES

    tokenizer = AutoTokenizer.from_pretrained(BASE, revision=REVISION, use_fast=True)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token

    base, champion = load_adapter(v41_dir)
    v41 = run_model("hector-asi-qwen15-v41", champion, tokenizer, cases)
    del champion, base

    base, candidate = load_adapter(v49_dir)
    v49 = run_model("hector-asi-qwen15-v49-c3", candidate, tokenizer, cases)
    del candidate, base

    latency_ratio = v49["meanLatencyMs"] / max(1.0, v41["meanLatencyMs"])
    token_ratio = v49["totalGeneratedTokens"] / max(1, v41["totalGeneratedTokens"])
    no_domain_regression = all(
        v49["domains"].get(domain, {"passed": 0})["passed"]
        >= v41["domains"].get(domain, {"passed": 0})["passed"]
        for domain in CORE_DOMAINS
    )
    gates = {
        "behavioralImprovement": v49["passed"] > v41["passed"],
        "criticalPerfect": v49["criticalPassed"] == v49["criticalTotal"],
        "noCriticalRegression": v49["criticalPassed"] >= v41["criticalPassed"],
        "noCoreDomainRegression": no_domain_regression,
        "latencyAcceptable": latency_ratio <= 1.35,
        "generationCostAcceptable": token_ratio <= 1.35,
    }
    gates["eligibleForPromotion"] = all(gates.values())

    report = {
        "schemaVersion": 1,
        "experimentId": "hector-asi-qwen15-v49-c3",
        "champion": {
            "runtimeId": "hector-asi-qwen15-v41",
            "artifactId": 8560331055,
            "adapterSha256": V41_SHA256,
        },
        "candidate": {
            "runtimeId": "hector-asi-qwen15-v49-c3",
            "trainingRunId": 30031007589,
            "artifactId": 8573382438,
            "artifactDigest": "sha256:bed65e58344994273ad429b98e4c69957021acb3fad37c14593423d7e32aa39d",
            "adapterSha256": V49_SHA256,
            "adapterBytes": EXPECTED_BYTES,
            "validationLossBefore": 2.3944334189097085,
            "validationLossAfter": 2.354764759540558,
            "relativeValidationImprovement": 0.016567033794246636,
        },
        "hiddenEvaluation": {
            "datasetPath": str(dataset_path),
            "datasetSha256": sha256(dataset_path),
            "cases": len(cases),
            "criticalCases": sum(bool(case.get("critical")) for case in cases),
            "trainValidationExactPromptOverlap": 0,
            "champion": v41,
            "candidate": v49,
            "latencyRatio": latency_ratio,
            "generatedTokenRatio": token_ratio,
        },
        "gates": gates,
        "decision": "promote" if gates["eligibleForPromotion"] else "reject-or-hold",
        "rollback": "hector-asi-qwen15-v41",
    }

    output = Path(os.getenv("EVAL_OUTPUT", "qwen15-v49-c3-vs-v41.json"))
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"decision": report["decision"], "gates": gates}, ensure_ascii=False))


if __name__ == "__main__":
    main()
