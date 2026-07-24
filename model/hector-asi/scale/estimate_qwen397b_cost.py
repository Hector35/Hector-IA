#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


def money(value: Decimal) -> str:
    return str(value.quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP))


def estimate(*, requests: int, input_tokens: int, cached_input_tokens: int, output_tokens: int,
             input_per_million: Decimal, cached_input_per_million: Decimal,
             output_per_million: Decimal, usd_to_mxn: Decimal) -> dict:
    if min(requests, input_tokens, cached_input_tokens, output_tokens) < 0:
        raise ValueError('Token counts and requests must be non-negative')
    if cached_input_tokens > input_tokens:
        raise ValueError('cached_input_tokens cannot exceed input_tokens')
    uncached = input_tokens - cached_input_tokens
    million = Decimal(1_000_000)
    per_request_usd = (
        Decimal(uncached) * input_per_million / million
        + Decimal(cached_input_tokens) * cached_input_per_million / million
        + Decimal(output_tokens) * output_per_million / million
    )
    total_usd = per_request_usd * Decimal(requests)
    total_mxn = total_usd * usd_to_mxn
    return {
        'schemaVersion': 1,
        'requests': requests,
        'tokensPerRequest': {
            'input': input_tokens,
            'cachedInput': cached_input_tokens,
            'uncachedInput': uncached,
            'output': output_tokens,
        },
        'pricingUsdPerMillion': {
            'input': money(input_per_million),
            'cachedInput': money(cached_input_per_million),
            'output': money(output_per_million),
        },
        'exchangeRate': {'usdToMxn': money(usd_to_mxn), 'source': 'operator-supplied; never assumed live'},
        'estimated': {
            'usdPerRequest': money(per_request_usd),
            'usdTotal': money(total_usd),
            'mxnTotal': money(total_mxn),
        },
        'billingActivated': False,
        'secretValuesRecorded': False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Estimate Qwen 397B serverless inference cost without calling a provider.')
    parser.add_argument('--requests', type=int, required=True)
    parser.add_argument('--input-tokens', type=int, required=True)
    parser.add_argument('--cached-input-tokens', type=int, default=0)
    parser.add_argument('--output-tokens', type=int, required=True)
    parser.add_argument('--input-usd-per-million', default='0.60')
    parser.add_argument('--cached-input-usd-per-million', default='0.35')
    parser.add_argument('--output-usd-per-million', default='3.60')
    parser.add_argument('--usd-to-mxn', required=True, help='Explicit exchange rate supplied at execution time')
    parser.add_argument('--maximum-mxn', default=None)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    report = estimate(
        requests=args.requests,
        input_tokens=args.input_tokens,
        cached_input_tokens=args.cached_input_tokens,
        output_tokens=args.output_tokens,
        input_per_million=Decimal(args.input_usd_per_million),
        cached_input_per_million=Decimal(args.cached_input_usd_per_million),
        output_per_million=Decimal(args.output_usd_per_million),
        usd_to_mxn=Decimal(args.usd_to_mxn),
    )
    maximum = Decimal(args.maximum_mxn) if args.maximum_mxn is not None else None
    estimated = Decimal(report['estimated']['mxnTotal'])
    report['budgetGate'] = {
        'maximumMxn': money(maximum) if maximum is not None else None,
        'estimatedMxn': money(estimated),
        'open': maximum is not None and estimated <= maximum,
        'reason': 'within explicit ceiling' if maximum is not None and estimated <= maximum else ('estimate exceeds explicit ceiling' if maximum is not None else 'explicit MXN ceiling missing'),
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(report, sort_keys=True))
    if not report['budgetGate']['open']:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
