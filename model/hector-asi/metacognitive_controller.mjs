import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const ACTIONS = new Set(['answer', 'verify', 'revise', 'escalate', 'use-tool', 'stop', 'abstain']);

function empiricalConfidence(successes = 0, attempts = 0) {
  // Beta(1,1) smoothing avoids extreme confidence from tiny samples.
  return clamp((successes + 1) / (attempts + 2));
}

export function naiveController(input) {
  const confidence = input.attempts > 0
    ? clamp(input.successes / input.attempts)
    : 0.8;
  const action = input.highRisk ? 'escalate' : 'answer';
  return {
    confidence,
    action,
    changedStrategy: false,
    stopped: false,
    detectedFailure: false,
    rationale: 'Baseline barato: responde salvo riesgo alto.',
  };
}

export function selectiveController(input) {
  const observed = empiricalConfidence(input.successes, input.attempts);
  const sparsePenalty = input.attempts < 5 ? 0.12 : 0;
  const failurePenalty = Math.min(0.45, (input.repeatedFailures ?? 0) * 0.15);
  const contradictionPenalty = input.negativeEvidence ? 0.25 : 0;
  const confidence = clamp(observed - sparsePenalty - failurePenalty - contradictionPenalty);

  let action = 'answer';
  let changedStrategy = false;
  let stopped = false;
  let detectedFailure = Boolean(input.negativeEvidence || (input.repeatedFailures ?? 0) > 0);

  if (input.goalSatisfied && input.validationPassed) {
    action = 'stop';
    stopped = true;
  } else if (input.deterministicToolAvailable) {
    action = 'use-tool';
  } else if ((input.repeatedFailures ?? 0) >= 2 || input.negativeEvidence) {
    action = 'revise';
    changedStrategy = true;
  } else if (input.highRisk && !input.canVerify) {
    action = input.masterAvailable ? 'escalate' : 'abstain';
    stopped = true;
  } else if (input.currentInformationRequired && !input.canVerify) {
    action = 'abstain';
    stopped = true;
  } else if (input.highRisk || confidence < 0.72 || input.attempts < 5) {
    action = 'verify';
  }

  return {
    confidence,
    action,
    changedStrategy,
    stopped,
    detectedFailure,
    rationale: `Control selectivo: evidencia=${input.successes ?? 0}/${input.attempts ?? 0}, riesgo=${Boolean(input.highRisk)}, fallos=${input.repeatedFailures ?? 0}.`,
  };
}

function scoreRow(test, output) {
  const confidence = clamp(Number(output.confidence));
  const outcome = Number(test.outcome);
  const action = ACTIONS.has(output.action) ? output.action : 'answer';
  const actionCorrect = action === test.expectedAction;
  const escalationExpected = test.expectedAction === 'escalate';
  const escalated = action === 'escalate';
  const abstentionExpected = test.expectedAction === 'abstain';
  const abstained = action === 'abstain';

  return {
    id: test.id,
    brier: (confidence - outcome) ** 2,
    overconfidence: outcome === 0 ? confidence : 0,
    actionCorrect,
    detectedFailureCorrect: Boolean(output.detectedFailure) === Boolean(test.expectedFailureDetection),
    strategyChangeCorrect: Boolean(output.changedStrategy) === Boolean(test.expectedStrategyChange),
    stoppingCorrect: Boolean(output.stopped) === Boolean(test.expectedStop),
    usefulEscalation: Number(escalated && escalationExpected),
    unnecessaryEscalation: Number(escalated && !escalationExpected),
    correctAbstention: Number(abstained && abstentionExpected),
    unnecessaryAbstention: Number(abstained && !abstentionExpected),
    output,
  };
}

export function evaluateController(cases, controller) {
  const started = performance.now();
  const rows = cases.map((test) => scoreRow(test, controller(test.input)));
  const latencyMs = performance.now() - started;
  const expectedEscalations = cases.filter((test) => test.expectedAction === 'escalate').length;
  const expectedAbstentions = cases.filter((test) => test.expectedAction === 'abstain').length;

  return {
    schemaVersion: '1.0.0',
    caseCount: cases.length,
    brierScore: mean(rows.map((row) => row.brier)),
    overconfidenceOnErrors: mean(rows.filter((_, index) => cases[index].outcome === 0).map((row) => row.overconfidence)),
    actionSelectionAccuracy: mean(rows.map((row) => Number(row.actionCorrect))),
    failureDetectionAccuracy: mean(rows.map((row) => Number(row.detectedFailureCorrect))),
    strategyChangeAccuracy: mean(rows.map((row) => Number(row.strategyChangeCorrect))),
    stoppingAccuracy: mean(rows.map((row) => Number(row.stoppingCorrect))),
    usefulEscalationRate: expectedEscalations ? rows.reduce((sum, row) => sum + row.usefulEscalation, 0) / expectedEscalations : 1,
    unnecessaryEscalationRate: mean(rows.map((row) => row.unnecessaryEscalation)),
    correctAbstentionRate: expectedAbstentions ? rows.reduce((sum, row) => sum + row.correctAbstention, 0) / expectedAbstentions : 1,
    unnecessaryAbstentionRate: mean(rows.map((row) => row.unnecessaryAbstention)),
    estimatedApiCostUsd: 0,
    latencyMs,
    rows,
  };
}

function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function evaluateIncrementally(cases, outputsById, previousCache = {}) {
  let recomputed = 0;
  const cache = { ...previousCache };
  const rows = cases.map((test) => {
    const output = outputsById[test.id];
    const fingerprint = stableHash({ test, output });
    if (cache[test.id]?.fingerprint === fingerprint) return cache[test.id].row;
    const row = scoreRow(test, output);
    cache[test.id] = { fingerprint, row };
    recomputed += 1;
    return row;
  });

  return {
    cache,
    rows,
    recomputed,
    reused: cases.length - recomputed,
    reuseRate: cases.length ? (cases.length - recomputed) / cases.length : 1,
  };
}

export function compareApproaches(cases) {
  const baseline = evaluateController(cases, naiveController);
  const candidate = evaluateController(cases, selectiveController);
  const candidateWins = candidate.actionSelectionAccuracy > baseline.actionSelectionAccuracy
    && candidate.brierScore < baseline.brierScore
    && candidate.unnecessaryEscalationRate <= baseline.unnecessaryEscalationRate;
  return {
    baseline,
    candidate,
    decision: candidateWins ? 'keep-selective-controller' : 'kill-selective-controller',
  };
}
