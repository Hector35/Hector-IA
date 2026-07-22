import { describe, expect, it } from 'vitest';
import { readJsonl } from '../model/hector-asi/evaluate_metacognition.mjs';
import {
  compareApproaches,
  evaluateIncrementally,
  selectiveController,
} from '../model/hector-asi/metacognitive_controller.mjs';

const cases = readJsonl('model/hector-asi/evals/metacognitive-controller-v1.jsonl');

describe('Hector ASI selective metacognitive controller', () => {
  it('kills the naive approach and keeps the selective controller', () => {
    const comparison = compareApproaches(cases);
    expect(comparison.decision).toBe('keep-selective-controller');
    expect(comparison.baseline.actionSelectionAccuracy).toBe(0.25);
    expect(comparison.candidate.actionSelectionAccuracy).toBe(1);
    expect(comparison.candidate.brierScore).toBeLessThan(comparison.baseline.brierScore);
    expect(comparison.candidate.estimatedApiCostUsd).toBe(0);
  });

  it('does not collapse into always escalating or always abstaining', () => {
    const comparison = compareApproaches(cases);
    expect(comparison.candidate.usefulEscalationRate).toBe(1);
    expect(comparison.candidate.unnecessaryEscalationRate).toBe(0);
    expect(comparison.candidate.correctAbstentionRate).toBe(1);
    expect(comparison.candidate.unnecessaryAbstentionRate).toBe(0);
    expect(comparison.candidate.failureDetectionAccuracy).toBe(1);
    expect(comparison.candidate.strategyChangeAccuracy).toBe(1);
    expect(comparison.candidate.stoppingAccuracy).toBe(1);
  });

  it('reuses unchanged benchmark rows and recomputes only a changed output', () => {
    const outputs = Object.fromEntries(cases.map((test) => [test.id, selectiveController(test.input)]));
    const first = evaluateIncrementally(cases, outputs);
    expect(first.recomputed).toBe(cases.length);
    expect(first.reused).toBe(0);

    const second = evaluateIncrementally(cases, outputs, first.cache);
    expect(second.recomputed).toBe(0);
    expect(second.reused).toBe(cases.length);
    expect(second.reuseRate).toBe(1);

    const changed = {
      ...outputs,
      [cases[0].id]: { ...outputs[cases[0].id], confidence: outputs[cases[0].id].confidence - 0.01 },
    };
    const third = evaluateIncrementally(cases, changed, second.cache);
    expect(third.recomputed).toBe(1);
    expect(third.reused).toBe(cases.length - 1);
    expect(third.rows).toHaveLength(cases.length);
  });
});
