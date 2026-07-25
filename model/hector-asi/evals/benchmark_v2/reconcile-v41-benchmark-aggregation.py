#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from decimal import Decimal
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
SOURCE=Path('model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json')


def digest(value):
    raw=json.dumps(value,sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(raw).hexdigest()


def build():
    benchmark=json.loads((ROOT/SOURCE).read_text(encoding='utf-8'))
    capabilities=benchmark['capabilities']
    capability_cases=sum(int(value['cases']) for value in capabilities.values())
    equivalent=sum(Decimal(str(value['score']))*Decimal(int(value['cases'])) for value in capabilities.values())
    weighted_percent=equivalent/Decimal(capability_cases)*Decimal(100)
    published_percent=Decimal(str(benchmark['scorePercent']))
    full_pass_cases=int(benchmark['cases'])-int(benchmark['failureCount'])
    partial_equivalent=equivalent-Decimal(full_pass_cases)
    non_trainable=int(benchmark['failureCount'])-int(benchmark['trainableFailureCount'])
    checks={
      'capabilityCasesMatchTotal':capability_cases==int(benchmark['cases']),
      'weightedScoreMatchesPublishedAfterRounding':round(float(weighted_percent),3)==float(benchmark['scorePercent']),
      'failuresPlusFullPassesMatchTotal':int(benchmark['failureCount'])+full_pass_cases==int(benchmark['cases']),
      'trainableFailuresSubsetOfFailures':0<=int(benchmark['trainableFailureCount'])<=int(benchmark['failureCount']),
      'partialCreditEquivalentNonNegative':partial_equivalent>=0,
      'partialCreditEquivalentNotGreaterThanFailures':partial_equivalent<=int(benchmark['failureCount']),
    }
    report={
      'schemaVersion':1,
      'benchmarkVersion':benchmark['benchmarkVersion'],
      'source':{
        'hiddenSha256':benchmark['hiddenSha256'],
        'predictionsSha256':benchmark['predictionsSha256'],
        'cases':benchmark['cases'],
        'publishedScorePercent':benchmark['scorePercent'],
        'publishedFailureCount':benchmark['failureCount'],
        'publishedTrainableFailureCount':benchmark['trainableFailureCount'],
      },
      'semantics':{
        'score':'Weighted normalized partial-credit points across capabilities.',
        'failureCount':'Number of cases below the full-pass criterion; failed cases may retain partial credit.',
        'trainableFailureCount':'Subset of failed cases admitted to the trainable failure taxonomy.',
        'warning':'scorePercent is not a case pass rate and must not be converted to failureCount by cases * (1 - score).',
      },
      'reconciliation':{
        'capabilityCaseTotal':capability_cases,
        'weightedPointEquivalentCases':float(equivalent),
        'weightedScorePercentExact':float(weighted_percent),
        'publishedScorePercent':float(published_percent),
        'scoreRoundingDifferencePercentagePoints':float(abs(weighted_percent-published_percent)),
        'fullPassCases':full_pass_cases,
        'fullPassRatePercent':full_pass_cases/int(benchmark['cases'])*100,
        'partialCreditEquivalentCasesAmongFailures':float(partial_equivalent),
        'publishedFailureCount':benchmark['failureCount'],
        'publishedTrainableFailureCount':benchmark['trainableFailureCount'],
        'nonTrainableFailureCount':non_trainable,
      },
      'checks':checks,
      'aggregateConsistencyVerified':all(checks.values()),
    }
    report['sha256']=digest(report)
    return report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    report=build()
    output=Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(report,sort_keys=True))
    if not report['aggregateConsistencyVerified']:
        raise SystemExit(2)


if __name__=='__main__':main()
