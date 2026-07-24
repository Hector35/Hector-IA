#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

TARGET = "Qwen/Qwen3.5-397B-A17B"


def request_json(url: str, token: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="GET" if data is None else "POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=180) as response:
        return json.loads(response.read().decode())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--token-env", default="QWEN_397B_TOKEN")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    token = os.environ.get(args.token_env, "").strip()
    if not token:
        raise SystemExit(f"missing token environment variable: {args.token_env}")
    base = args.base_url.rstrip("/")
    if not base.endswith("/v1"):
        base += "/v1"

    result = {
        "schemaVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "targetModel": TARGET,
        "baseUrl": base,
        "modelsCheck": False,
        "chatCheck": False,
        "reportedModels": [],
        "effectiveModel": None,
        "responseText": None,
        "verified": False,
    }
    try:
        models = request_json(f"{base}/models", token)
        ids = [item.get("id") for item in models.get("data", []) if isinstance(item, dict)]
        result["reportedModels"] = ids
        result["modelsCheck"] = TARGET in ids or any("397B-A17B" in str(item) for item in ids)

        chat = request_json(f"{base}/chat/completions", token, {
            "model": TARGET,
            "messages": [{"role": "user", "content": "Responde exactamente: QWEN397_OK"}],
            "max_tokens": 32,
            "temperature": 0,
            "stream": False,
        })
        result["effectiveModel"] = chat.get("model")
        text = (((chat.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
        result["responseText"] = text[:200]
        result["chatCheck"] = "QWEN397_OK" in text
        model_identity_ok = result["effectiveModel"] == TARGET or "397B-A17B" in str(result["effectiveModel"])
        result["verified"] = bool(result["modelsCheck"] and result["chatCheck"] and model_identity_ok)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as error:
        result["error"] = str(error)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"verified": result["verified"], "effectiveModel": result["effectiveModel"]}, sort_keys=True))
    if not result["verified"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
