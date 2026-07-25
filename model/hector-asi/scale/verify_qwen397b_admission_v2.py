#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    req = manifest['requirements']
    obs = manifest['observed']

    gates = {
        'data': int(obs['canonicalTrainExamples']) >= int(req['canonicalTrainExamples']),
        'benchmark': int(obs['hiddenBenchmarkCases']) >= int(req['hiddenBenchmarkCases']),
        'failures': int(obs['trainableChampionFailures']) >= int(req['trainableChampionFailures']),
        'hardware': bool(obs['distributedHardwareVerified']),
        'resume': bool(obs['resumeRoundTripVerified']),
        'budget': isinstance(obs['budgetMaximumMxn'], (int, float)) and obs['budgetMaximumMxn'] > 0,
        'costWithinBudget': (
            isinstance(obs['budgetMaximumMxn'], (int, float))
            and isinstance(obs['estimatedMaximumCostMxn'], (int, float))
            and 0 <= obs['estimatedMaximumCostMxn'] <= obs['budgetMaximumMxn']
        ),
        'liveExactModelAttestation': bool(obs['liveExactModelAttested']),
    }
    eligible = all(gates.values())
    evidence = {
        'schemaVersion': 3,
        'baseModel': manifest['baseModel'],
        'champion': manifest['champion'],
        'eligible': eligible,
        'gates': gates,
        'missing': [name for name, opened in gates.items() if not opened],
        'decision': 'train' if eligible else 'do-not-train',
        'artifactAllowed': eligible,
        'observed': obs,
    }

    assert manifest['trainingAllowed'] is eligible
    assert manifest['gates'] == gates
    if not eligible:
        assert obs.get('adapter') is None
        assert obs.get('checkpoint') is None
        assert int(obs.get('replicasCompleted', 0)) == 0

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(evidence, sort_keys=True))
    raise SystemExit(0 if eligible else 2)


if __name__ == '__main__':
    main()
