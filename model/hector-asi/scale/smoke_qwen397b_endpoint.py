#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

EXPECTED_DEFAULT = "Qwen/Qwen3.5-397B-A17B"


def request_json(url: str, token: str, payload: dict, timeout: int) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {detail[:800]}") from error


def normalize_model(value: object) -> str:
    return str(value or "").strip().lower().replace("_", "-")


def verify_effective_model(response: dict, expected: str) -> str:
    effective = response.get("model") or response.get("model_id")
    if not effective:
        raise RuntimeError("Provider response did not report an effective model ID")
    expected_norm = normalize_model(expected)
    effective_norm = normalize_model(effective)
    if expected_norm != effective_norm:
        raise RuntimeError(f"Model mismatch: requested={expected!r}, effective={effective!r}")
    return str(effective)


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify an OpenAI-compatible Qwen 397B endpoint without exposing secrets.")
    parser.add_argument("--base-url", default=os.getenv("QWEN_397B_BASE_URL"))
    parser.add_argument("--token", default=os.getenv("QWEN_397B_TOKEN"))
    parser.add_argument("--model", default=os.getenv("QWEN_397B_MODEL", EXPECTED_DEFAULT))
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()

    if not args.base_url or not args.token:
        raise SystemExit("QWEN_397B_BASE_URL and QWEN_397B_TOKEN are required")

    endpoint = args.base_url.rstrip("/") + "/chat/completions"
    text_payload = {
        "model": args.model,
        "messages": [{"role": "user", "content": "Reply with exactly: HECTOR_QWEN397_OK"}],
        "temperature": 0,
        "max_tokens": 32,
    }
    response = request_json(endpoint, args.token, text_payload, args.timeout)
    effective = verify_effective_model(response, args.model)
    choices = response.get("choices") or []
    content = (((choices[0] if choices else {}).get("message") or {}).get("content") or "").strip()
    if "HECTOR_QWEN397_OK" not in content:
        raise RuntimeError("Text smoke test returned unexpected content")

    tool_payload = {
        "model": args.model,
        "messages": [{"role": "user", "content": "Use the health_check tool once."}],
        "tools": [{
            "type": "function",
            "function": {
                "name": "health_check",
                "description": "Return endpoint health status",
                "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
            },
        }],
        "tool_choice": "auto",
        "temperature": 0,
        "max_tokens": 128,
    }
    tool_response = request_json(endpoint, args.token, tool_payload, args.timeout)
    verify_effective_model(tool_response, args.model)
    tool_choices = tool_response.get("choices") or []
    tool_calls = (((tool_choices[0] if tool_choices else {}).get("message") or {}).get("tool_calls") or [])
    if not tool_calls or ((tool_calls[0].get("function") or {}).get("name") != "health_check"):
        raise RuntimeError("Tool-calling smoke test did not produce health_check")

    report = {
        "schemaVersion": 1,
        "requestedModel": args.model,
        "effectiveModel": effective,
        "fallback": False,
        "text": {"passed": True},
        "toolCalling": {"passed": True, "tool": "health_check"},
        "vision": {"passed": False, "reason": "Run separately with a controlled image fixture before production activation."},
        "activationReady": False,
        "secretValuesRecorded": False,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"qwen397b smoke test failed: {error}", file=sys.stderr)
        raise SystemExit(2)
