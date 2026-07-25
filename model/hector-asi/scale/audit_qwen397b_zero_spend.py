#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TARGET_MODEL = "Qwen/Qwen3.5-397B-A17B"
SMOKE_MODEL = "Qwen/Qwen3-8B"
HF_MODEL_API = "https://huggingface.co/api/models/{model}?blobs=true"
HF_CONFIG = "https://huggingface.co/{model}/resolve/{revision}/config.json"
USER_AGENT = "Hector-IA-zero-spend-readiness/1.0"


def canonical_sha256(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def fetch_json(url: str, timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"GET {url} returned HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


def secret_presence() -> dict[str, bool]:
    names = (
        "HF_TOKEN",
        "HUGGINGFACE_TOKEN",
        "QWEN_397B_BASE_URL",
        "QWEN_397B_TOKEN",
        "QWEN_397B_MODEL",
    )
    return {name: bool(os.environ.get(name, "").strip()) for name in names}


def sibling_size(item: dict[str, Any]) -> int:
    direct = item.get("size")
    if isinstance(direct, int):
        return direct
    lfs = item.get("lfs")
    if isinstance(lfs, dict) and isinstance(lfs.get("size"), int):
        return int(lfs["size"])
    return 0


def provider_mapping(data: dict[str, Any]) -> list[dict[str, Any]]:
    raw = data.get("inferenceProviderMapping")
    if isinstance(raw, dict):
        return [
            {"provider": str(provider), "mapping": mapping}
            for provider, mapping in sorted(raw.items(), key=lambda item: str(item[0]))
        ]
    if isinstance(raw, list):
        normalized: list[dict[str, Any]] = []
        for item in raw:
            if isinstance(item, dict):
                normalized.append(item)
        return normalized
    return []


def audit_model(model_id: str, timeout: int) -> dict[str, Any]:
    data = fetch_json(HF_MODEL_API.format(model=model_id), timeout)
    effective_id = data.get("id") or data.get("modelId")
    revision = str(data.get("sha") or "")
    if effective_id != model_id:
        raise RuntimeError(f"model identity mismatch: requested={model_id!r}, effective={effective_id!r}")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise RuntimeError(f"invalid immutable revision for {model_id}: {revision!r}")

    config = fetch_json(HF_CONFIG.format(model=model_id, revision=revision), timeout)
    siblings = data.get("siblings") if isinstance(data.get("siblings"), list) else []
    weight_files = [
        item
        for item in siblings
        if isinstance(item, dict)
        and isinstance(item.get("rfilename"), str)
        and item["rfilename"].endswith(".safetensors")
        and "model" in item["rfilename"]
    ]
    mapping = provider_mapping(data)
    card = data.get("cardData") if isinstance(data.get("cardData"), dict) else {}
    tags = data.get("tags") if isinstance(data.get("tags"), list) else []
    architecture = config.get("architectures") if isinstance(config.get("architectures"), list) else []
    text_config = config.get("text_config") if isinstance(config.get("text_config"), dict) else {}

    return {
        "requestedModel": model_id,
        "effectiveModel": effective_id,
        "revisionSha": revision,
        "immutableRevisionPinned": True,
        "private": bool(data.get("private", False)),
        "gated": bool(data.get("gated", False)),
        "license": card.get("license") or ("apache-2.0" if "license:apache-2.0" in tags else None),
        "pipelineTag": data.get("pipeline_tag"),
        "libraryName": data.get("library_name"),
        "modelType": config.get("model_type"),
        "architectures": architecture,
        "textModelType": text_config.get("model_type"),
        "weightShardCount": len(weight_files),
        "knownWeightBytes": sum(sibling_size(item) for item in weight_files),
        "weightsPresent": bool(weight_files),
        "inferenceProviderMappingObserved": bool(mapping),
        "inferenceProviders": mapping,
        "source": {
            "modelApi": HF_MODEL_API.format(model=model_id),
            "pinnedConfig": HF_CONFIG.format(model=model_id, revision=revision),
        },
    }


def validate_target(audit: dict[str, Any]) -> None:
    if audit["effectiveModel"] != TARGET_MODEL:
        raise RuntimeError("target model attribution failed")
    if audit["private"] or audit["gated"]:
        raise RuntimeError("target model is not publicly accessible")
    if audit["license"] != "apache-2.0":
        raise RuntimeError(f"unexpected target license: {audit['license']!r}")
    if audit["modelType"] != "qwen3_5_moe":
        raise RuntimeError(f"unexpected target model_type: {audit['modelType']!r}")
    if "Qwen3_5MoeForConditionalGeneration" not in audit["architectures"]:
        raise RuntimeError("unexpected target architecture")
    if not audit["weightsPresent"] or audit["weightShardCount"] < 1:
        raise RuntimeError("target weight shards were not found")


def validate_smoke(audit: dict[str, Any]) -> None:
    if audit["effectiveModel"] != SMOKE_MODEL:
        raise RuntimeError("smoke model attribution failed")
    if audit["private"] or audit["gated"]:
        raise RuntimeError("smoke model is not publicly accessible")
    if not audit["weightsPresent"]:
        raise RuntimeError("smoke model weights were not found")
    if not any(str(name).startswith("Qwen3") for name in audit["architectures"]):
        raise RuntimeError("unexpected smoke model architecture")


def build_manifest(timeout: int) -> dict[str, Any]:
    target = audit_model(TARGET_MODEL, timeout)
    smoke = audit_model(SMOKE_MODEL, timeout)
    validate_target(target)
    validate_smoke(smoke)
    secrets = secret_presence()

    manifest: dict[str, Any] = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "zero-spend public readiness audit",
        "target": target,
        "smoke": {
            **smoke,
            "scope": "metadata/config compatibility only; no weights loaded, no candidate trained",
        },
        "providerCatalog": {
            "exactTargetMappingObserved": target["inferenceProviderMappingObserved"],
            "mapping": target["inferenceProviders"],
            "liveInferenceCallPerformed": False,
            "exactEndpointResponseAttested": False,
            "ownerFreeCreditsVerified": False,
            "reason": "Public catalog metadata is free to inspect; account quota and effective endpoint require an authenticated call.",
        },
        "secrets": {
            "presenceOnly": secrets,
            "valuesReadOrRecorded": False,
        },
        "spend": {
            "actualMxn": 0,
            "billingActivated": False,
            "checkoutReached": False,
            "explicitMaximumMxn": None,
        },
        "gates": {
            "exactPublicModelRepository": True,
            "immutableModelRevision": True,
            "exactWeightsPresent": True,
            "qwen3_8bMetadataSmoke": True,
            "exactLiveInference": False,
            "ownerFreeQuota": False,
            "distributedGpuAllocation": False,
            "explicitBudgetMxn": False,
            "corpus": {"current": 2600, "required": 10000, "open": False},
        },
        "decision": "do-not-train",
        "blockingReasons": [
            "corpus below 10000 verified examples",
            "no explicit MXN ceiling",
            "owner free-credit/quota state not authenticated",
            "no paid or credited distributed GPU allocation",
            "no live exact-model inference attestation",
        ],
    }
    manifest["sha256"] = canonical_sha256(manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        manifest = build_manifest(args.timeout)
    except (RuntimeError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        failure = {
            "schemaVersion": 1,
            "objective": "zero-spend public readiness audit",
            "decision": "fail-closed",
            "spend": {"actualMxn": 0, "billingActivated": False, "checkoutReached": False},
            "error": str(error),
        }
        failure["sha256"] = canonical_sha256(failure)
        output.write_text(json.dumps(failure, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(failure, sort_keys=True))
        raise SystemExit(2) from error
    output.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
