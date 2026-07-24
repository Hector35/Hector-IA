#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

TOKEN_RE = re.compile(r"[a-z0-9áéíóúñü]+", re.IGNORECASE)
QWEN_397 = "Qwen/Qwen3.5-397B-A17B"
KIMI = "moonshotai/Kimi-K2.5"


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def prompt(row: dict) -> str:
    value = row.get("prompt")
    if isinstance(value, str):
        return value
    messages = row.get("messages") or []
    return "\n".join(str(item.get("content", "")) for item in messages if item.get("role") == "user")


def tokens(text: str) -> set[str]:
    return set(TOKEN_RE.findall(text.lower()))


def jaccard(a: set[str], b: set[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def attributable(result: dict, expected: str) -> bool:
    requested = str(result.get("requestedModel", ""))
    effective = str(result.get("effectiveModel", result.get("model", "")))
    return requested == expected and effective == expected and result.get("fallback") is False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hidden", required=True)
    parser.add_argument("--corpus", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--semantic-threshold", type=float, default=0.82)
    args = parser.parse_args()

    hidden_path = Path(args.hidden)
    hidden = rows(hidden_path)
    corpus = [item for path in map(Path, args.corpus) for item in rows(path)]
    hidden_prompts = [" ".join(prompt(row).lower().split()) for row in hidden]
    corpus_prompts = [" ".join(prompt(row).lower().split()) for row in corpus]
    exact = sorted(set(hidden_prompts) & set(corpus_prompts))

    hidden_tokens = [tokens(value) for value in hidden_prompts]
    semantic = []
    for corpus_index, corpus_value in enumerate(corpus_prompts):
        corpus_tokens = tokens(corpus_value)
        for hidden_index, hidden_value in enumerate(hidden_tokens):
            score = jaccard(corpus_tokens, hidden_value)
            if score >= args.semantic_threshold:
                semantic.append({"corpusIndex": corpus_index, "hiddenIndex": hidden_index, "score": round(score, 6)})

    attribution_contract = {
        "qwen397Accepted": attributable({"requestedModel": QWEN_397, "effectiveModel": QWEN_397, "fallback": False}, QWEN_397),
        "qwen397FallbackRejected": not attributable({"requestedModel": QWEN_397, "effectiveModel": "@cf/qwen/qwen3-30b-a3b-fp8", "fallback": True}, QWEN_397),
        "kimiAccepted": attributable({"requestedModel": KIMI, "effectiveModel": KIMI, "fallback": False}, KIMI),
        "kimiFallbackRejected": not attributable({"requestedModel": KIMI, "effectiveModel": "@cf/qwen/qwen3-30b-a3b-fp8", "fallback": True}, KIMI),
    }
    ok = len(hidden) >= 500 and not exact and not semantic and all(attribution_contract.values())
    report = {
        "schemaVersion": 1,
        "benchmarkVersion": "2.1.1",
        "hiddenCases": len(hidden),
        "corpusExamples": len(corpus),
        "hiddenSha256": hashlib.sha256(hidden_path.read_bytes()).hexdigest(),
        "exactPromptOverlaps": len(exact),
        "semanticOverlapsAtOrAboveThreshold": len(semantic),
        "semanticThreshold": args.semantic_threshold,
        "semanticExamples": semantic[:20],
        "modelAttribution": attribution_contract,
        "passed": ok,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, sort_keys=True))
    if not ok:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
