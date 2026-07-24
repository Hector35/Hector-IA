#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    root = Path(os.path.expandvars(args.root)).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    probe = root / ".hector-resume-probe"
    payload = f"hector-resume-probe:{datetime.now(timezone.utc).isoformat()}".encode()
    probe.write_bytes(payload)
    read_back = probe.read_bytes()
    ok = read_back == payload and os.access(root, os.W_OK | os.R_OK)
    result = {
        "schemaVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "ok": ok,
        "sha256": hashlib.sha256(read_back).hexdigest(),
        "bytes": len(read_back),
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    probe.unlink(missing_ok=True)
    if not ok:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
