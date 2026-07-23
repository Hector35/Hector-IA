from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from huggingface_hub import HfApi


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", required=True)
    parser.add_argument("--repo-name", default="hector-asi-qwen15-v10-runtime")
    parser.add_argument("--output", required=True)
    parser.add_argument("--commit-message", default="Deploy Hector ASI Qwen15 v10 runtime")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        raise RuntimeError("HF_TOKEN no está configurado")

    folder = Path(args.folder)
    required = [folder / "app.py", folder / "Dockerfile", folder / "README.md", folder / "adapter" / "adapter_model.safetensors"]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Faltan archivos del bundle: {missing}")

    api = HfApi(token=token)
    who = api.whoami()
    namespace = str(who.get("name") or who.get("fullname") or "").strip()
    if not namespace:
        raise RuntimeError("No se pudo resolver el propietario del token de Hugging Face")
    repo_id = f"{namespace}/{args.repo_name}"

    api.create_repo(
        repo_id=repo_id,
        repo_type="space",
        space_sdk="docker",
        private=True,
        exist_ok=True,
    )
    api.add_space_secret(repo_id=repo_id, key="HF_TOKEN", value=token)
    variables = {
        "MODEL_ID": "Qwen/Qwen2.5-1.5B-Instruct",
        "MODEL_REVISION": "989aa7980e4cf806f80c7fef2b1adb7bc71aa306",
        "ADAPTER_PATH": "/app/adapter",
        "RUNTIME_ID": "hector-asi-qwen15-v10",
        "ADAPTER_SHA256": "e1170e7a2a4e2fb19ce66744720e178955ce02fea07531f1b187366c7fa8c502",
        "MAX_NEW_TOKENS": "256",
    }
    for key, value in variables.items():
        api.add_space_variable(repo_id=repo_id, key=key, value=value)

    commit = api.upload_folder(
        folder_path=str(folder),
        repo_id=repo_id,
        repo_type="space",
        commit_message=args.commit_message,
    )

    try:
        info = api.space_info(repo_id, expand=["subdomain", "private", "sdk", "sha"])
    except TypeError:
        info = api.space_info(repo_id)
    subdomain = getattr(info, "subdomain", None) or repo_id.lower().replace("_", "-").replace("/", "-")
    result = {
        "repoId": repo_id,
        "private": bool(getattr(info, "private", True)),
        "subdomain": subdomain,
        "spaceUrl": f"https://{subdomain}.hf.space",
        "hubUrl": f"https://huggingface.co/spaces/{repo_id}",
        "commit": str(commit),
    }
    Path(args.output).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
