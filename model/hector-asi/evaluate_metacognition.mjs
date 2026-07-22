import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ACTIONS = new Set(['answer','verify','revise','escalate','use-tool','stop','abstain']);
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const normalize = (value) => String(value ?? '').toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function readJsonl(path) {
  return readFileSync(path, 'utf8').split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
}

export function evaluateMetacognition(cases, outputs) {
  const byId = new Map(outputs.map((row) => [row.id, row]));
  const results = cases.map((test) => {
    const output = byId.get(test.id);
    if (!output) return { id: test.id, capability: test.capability, missing: true, score: 0 };

    const confidence = clamp(Number(output.confidence));
    const correct = Boolean(output.correct);
    const expected = test.expected;
    const action = ACTIONS.has(output.action) ? output.action : 'answer';
    const confidenceInRange = confidence >= expected.confidenceRange[0] && confidence <= expected.confidenceRange[1];
    const actionCorrect = action === expected.preferredAction;
    const strategyChangeCorrect = Boolean(output.changedStrategy) === expected.shouldChangeStrategy;
    const stoppingCorrect = Boolean(output.stopped) === expected.shouldStop;
    const detectedFailure = expected.negativeEvidence ? Boolean(output.detectedFailure) : true;
    const rubricText = normalize(`${output.rationale ?? ''} ${output.limitExplanation ?? ''}`);
    const rubricMatches = test.rubric.filter((signal) => rubricText.includes(normalize(signal)));
    const rubricRecall = rubricMatches.length / Math.max(1, test.rubric.length);
    const brier = (confidence - Number(correct)) ** 2;
    const overconfidence = correct ? 0 : confidence;
    const score = mean([
      Number(correct === expected.correct),
      Number(confidenceInRange),
      Number(actionCorrect),
      Number(strategyChangeCorrect),
      Number(stoppingCorrect),
      Number(detectedFailure),
      rubricRecall,
    ]);

    return {
      id: test.id,
      capability: test.capability,
      score,
      confidence,
      correct,
      brier,
      overconfidence,
      action,
      actionCorrect,
      confidenceInRange,
      strategyChangeCorrect,
      stoppingCorrect,
      detectedFailure,
      rubricRecall,
      rubricMatches,
    };
  });

  const present = results.filter((row) => !row.missing);
  const negative = present.filter((row) => cases.find((item) => item.id === row.id)?.expected.negativeEvidence);
  const byCapability = Object.fromEntries([...new Set(present.map((row) => row.capability))].map((capability) => {
    const rows = present.filter((row) => row.capability === capability);
    return [capability, { count: rows.length, score: mean(rows.map((row) => row.score)), brier: mean(rows.map((row) => row.brier)) }];
  }));

  return {
    schemaVersion: '1.0.0',
    caseCount: cases.length,
    evaluatedCount: present.length,
    missingCount: results.filter((row) => row.missing).length,
    compositeScore: mean(present.map((row) => row.score)),
    brierScore: mean(present.map((row) => row.brier)),
    overconfidenceOnErrors: mean(present.filter((row) => !row.correct).map((row) => row.overconfidence)),
    failureDetectionRate: mean(negative.map((row) => Number(row.detectedFailure))),
    actionSelectionAccuracy: mean(present.map((row) => Number(row.actionCorrect))),
    strategyChangeAccuracy: mean(present.map((row) => Number(row.strategyChangeCorrect))),
    stoppingAccuracy: mean(present.map((row) => Number(row.stoppingCorrect))),
    confidenceRangeAccuracy: mean(present.map((row) => Number(row.confidenceInRange))),
    byCapability,
    results,
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const casesPath = process.argv[2];
  const outputsPath = process.argv[3];
  const reportPath = process.argv[4] || 'artifacts/hector-asi-metacognition.json';
  if (!casesPath || !outputsPath) throw new Error('Usage: node evaluate_metacognition.mjs <cases.jsonl> <outputs.jsonl> [report.json]');
  const report = evaluateMetacognition(readJsonl(casesPath), readJsonl(outputsPath));
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, compositeScore: report.compositeScore, brierScore: report.brierScore }, null, 2));
}
