import { describe, expect, it } from 'vitest';
import { evaluateMetacognition, readJsonl } from '../model/hector-asi/evaluate_metacognition.mjs';

const cases = readJsonl('model/hector-asi/evals/metacognition-v1.jsonl');
const fixture = readJsonl('model/hector-asi/evals/metacognition-baseline-fixture.jsonl');

describe('Hector ASI metacognition evaluator', () => {
  it('scores the verified fixture as fully compliant', () => {
    const report = evaluateMetacognition(cases, fixture);
    expect(report.caseCount).toBe(8);
    expect(report.missingCount).toBe(0);
    expect(report.compositeScore).toBe(1);
    expect(report.brierScore).toBeLessThan(0.05);
    expect(report.actionSelectionAccuracy).toBe(1);
    expect(report.strategyChangeAccuracy).toBe(1);
    expect(report.stoppingAccuracy).toBe(1);
    expect(report.failureDetectionRate).toBe(1);
  });

  it('penalizes confident claims after an observed failure and missing cases', () => {
    const outputs = [{
      id: 'meta-fail-001',
      confidence: 0.99,
      correct: false,
      action: 'answer',
      changedStrategy: false,
      stopped: false,
      detectedFailure: false,
      rationale: 'No necesito revisar el fallo.',
    }];
    const report = evaluateMetacognition(cases, outputs);
    expect(report.missingCount).toBe(7);
    expect(report.overconfidenceOnErrors).toBeCloseTo(0.99);
    expect(report.brierScore).toBeGreaterThan(0.9);
    expect(report.compositeScore).toBeLessThan(0.5);
  });

  it('reports capability-level metrics separately', () => {
    const report = evaluateMetacognition(cases, fixture);
    expect(report.byCapability.calibration.count).toBe(1);
    expect(report.byCapability['strategy-selection'].score).toBe(1);
    expect(report.byCapability.overconfidence.brier).toBeLessThan(0.01);
  });
});
