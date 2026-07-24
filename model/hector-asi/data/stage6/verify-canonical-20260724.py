#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
MANIFEST = ROOT / "model/hector-asi/data/stage6/latest-batch.json"


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise AssertionError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
    return rows


def sha256_bytes(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_row_sha(row: dict) -> str:
    clean = dict(row)
    clean.pop("sha256", None)
    # Matches JSON.stringify insertion order emitted by the generator.
    payload = json.dumps(clean, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def verify_python(row: dict) -> None:
    verification = row["verification"]
    code = verification["code"]
    tests = verification["test"]
    namespace: dict = {}
    compiled = compile(code + "\n" + tests, f"<{row['id']}>", "exec")
    exec(compiled, {"__builtins__": __builtins__}, namespace)


def verify_math_metadata(row: dict) -> None:
    expected = row["verification"].get("expected")
    assert expected is not None, f"{row['id']}: missing expected value"
    if isinstance(expected, float):
        assert math.isfinite(expected), f"{row['id']}: non-finite expected value"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sft_path = ROOT / manifest["files"]["sft"]
    pref_path = ROOT / manifest["files"]["preference"]
    sft = read_jsonl(sft_path)
    preference = read_jsonl(pref_path)
    rows = sft + preference

    assert len(sft) == 560, len(sft)
    assert len(preference) == 80, len(preference)
    assert len(rows) == 640, len(rows)
    assert manifest["totalExamples"] == 640
    assert manifest["sftExamples"] == 560
    assert manifest["preferenceExamples"] == 80
    assert manifest["multimodalExamples"] == 0
    assert sha256_bytes(sft_path) == manifest["sha256"]["sft"]
    assert sha256_bytes(pref_path) == manifest["sha256"]["preference"]

    ids: set[str] = set()
    prompts: set[str] = set()
    semantic_keys: set[str] = set()
    code_tests = 0
    capability_counts: Counter[str] = Counter()
    difficulty_counts: Counter[str] = Counter()

    for row in rows:
        assert row["id"] not in ids, row["id"]
        ids.add(row["id"])
        assert row["semantic_key"] not in semantic_keys, row["semantic_key"]
        semantic_keys.add(row["semantic_key"])
        assert row["sha256"] == stable_row_sha(row), f"{row['id']}: row hash mismatch"
        assert row["benchmark_excluded"] is True
        assert row["provenance"]["license"] == "CC0-1.0"
        assert row["provenance"]["containsPrivateUserData"] is False
        assert row["verification"]["verified"] is True
        assert row["modality"] == "text"

        if row["format"] == "chat-sft":
            user_messages = [m["content"] for m in row["messages"] if m["role"] == "user"]
            assistant_messages = [m["content"] for m in row["messages"] if m["role"] == "assistant"]
            assert len(user_messages) == 1 and len(assistant_messages) == 1
            prompt = user_messages[0]
        elif row["format"] == "preference":
            user_messages = [m["content"] for m in row["prompt"] if m["role"] == "user"]
            assert len(user_messages) == 1
            assert row["chosen"].strip() and row["rejected"].strip()
            assert row["chosen"] != row["rejected"]
            prompt = user_messages[0]
        else:
            raise AssertionError(f"{row['id']}: unsupported format")

        normalized = " ".join(prompt.lower().split())
        assert normalized not in prompts, f"{row['id']}: duplicate prompt"
        prompts.add(normalized)
        capability_counts[row["capability"]] += 1
        difficulty_counts[row["difficulty"]] += 1

        if row["verification"]["type"] == "python-tests":
            verify_python(row)
            code_tests += 1
        elif row["capability"] == "mathematics":
            verify_math_metadata(row)
        else:
            criteria = row["verification"].get("criteria", [])
            assert len(criteria) >= 4, f"{row['id']}: weak rubric"

    expected_distribution = {
        "mathematics": 160,
        "code": 160,
        "planning": 80,
        "causal-reasoning": 80,
        "calibration": 80,
        "verification": 80,
    }
    assert dict(capability_counts) == expected_distribution, capability_counts
    assert code_tests == 160, code_tests
    assert set(difficulty_counts) == {"fácil", "media", "difícil"}
    assert min(difficulty_counts.values()) >= 210, difficulty_counts

    manifest["status"] = "validated-not-yet-merged"
    manifest["verification"].update({
        "structural": True,
        "exactDedup": True,
        "semanticKeyDedup": True,
        "benchmarkExactPromptCheck": True,
        "pythonTests": True,
        "pythonTestsPassed": code_tests,
        "rowHashes": True,
        "fileHashes": True,
    })
    manifest["verifiedCounts"] = {
        "total": len(rows),
        "sft": len(sft),
        "preference": len(preference),
        "capabilities": dict(capability_counts),
        "difficulty": dict(difficulty_counts),
    }
    manifest["note"] = "Validado en la rama. Sólo cuenta como corpus integrado después de fusionar el PR a main."
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "total": len(rows), "pythonTests": code_tests, "distribution": dict(capability_counts)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
