#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def count_jsonl(path: Path) -> int:
    if not path.is_file():
        return 0
    count = 0
    with path.open('r', encoding='utf-8') as handle:
        for line in handle:
            if line.strip():
                json.loads(line)
                count += 1
    return count


def sha256(path: Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--train', required=True)
    parser.add_argument('--hidden', required=True)
    parser.add_argument('--failures', required=True)
    parser.add_argument('--hardware-report', required=True)
    parser.add_argument('--resume-report', required=True)
    parser.add_argument('--budget-mxn', type=float)
    parser.add_argument('--estimated-max-cost-mxn', type=float)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    config_path = Path(args.config)
    config = json.loads(config_path.read_text(encoding='utf-8'))
    requirements = config['requirements']
    train_path, hidden_path, failures_path = map(Path, (args.train, args.hidden, args.failures))
    hardware_path, resume_path = map(Path, (args.hardware_report, args.resume_report))
    hardware = json.loads(hardware_path.read_text()) if hardware_path.is_file() else {}
    resume = json.loads(resume_path.read_text()) if resume_path.is_file() else {}

    observed = {
        'canonicalTrainExamples': count_jsonl(train_path),
        'hiddenBenchmarkCases': count_jsonl(hidden_path),
        'trainableChampionFailures': count_jsonl(failures_path),
        'distributedHardwareVerified': bool(hardware.get('qwen397bEligible', False)),
        'resumeRoundTripVerified': bool(resume.get('ok', False)),
        'budgetMaximumMxn': args.budget_mxn,
        'estimatedMaximumCostMxn': args.estimated_max_cost_mxn,
        'datasetHash': sha256(train_path),
        'benchmarkHash': sha256(hidden_path),
        'failuresHash': sha256(failures_path),
    }
    gates = {
        'data': observed['canonicalTrainExamples'] >= requirements['canonicalTrainExamples'],
        'benchmark': observed['hiddenBenchmarkCases'] >= requirements['hiddenBenchmarkCases'],
        'failures': observed['trainableChampionFailures'] >= requirements['trainableChampionFailures'],
        'hardware': observed['distributedHardwareVerified'],
        'resume': observed['resumeRoundTripVerified'],
        'budgetDefined': args.budget_mxn is not None and args.budget_mxn > 0,
        'costWithinBudget': args.budget_mxn is not None and args.estimated_max_cost_mxn is not None and args.estimated_max_cost_mxn <= args.budget_mxn,
    }
    eligible = all(gates.values())
    payload = {
        'schemaVersion': 1,
        'profile': config['profile'],
        'baseModel': config['baseModel'],
        'eligible': eligible,
        'gates': gates,
        'observed': observed,
        'decision': 'train' if eligible else 'do-not-train',
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(payload, sort_keys=True))
    if not eligible:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
