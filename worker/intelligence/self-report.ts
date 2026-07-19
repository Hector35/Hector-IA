import {renderSystemReport,shortImprovementPrompt} from './system-manifest';

export type SelfEvaluationReport={
  score:number;
  grade:string;
  strengths:string[];
  gaps:string[];
  tests:Array<{name:string;passed:boolean;score:number;max:number;latencyMs?:number;model?:string;error?:string}>;
  averageLatencyMs:number;
  prompt:string;
};

export function renderEvidenceSelfAnalysis(report:SelfEvaluationReport){
  const passed=report.tests.filter(x=>x.passed);
  const failed=report.tests.filter(x=>!x.passed);
  return [
    renderSystemReport(report.score,report.grade,report.gaps),
    '',
    '### Pruebas ejecutadas',
    ...report.tests.map(x=>`${x.passed?'✓':'✗'} **${x.name}** — ${x.score}/${x.max}${x.model?` · ${x.model}`:''}${x.error?` · ${x.error}`:''}`),
    '',
    '### Evidencia resumida',
    `- Pruebas aprobadas: ${passed.length}/${report.tests.length}.`,
    `- Pruebas fallidas: ${failed.length}.`,
    `- Latencia media: ${report.averageLatencyMs} ms.`,
    '- Diagnóstico construido con manifiesto versionado, registros persistidos en D1 y pruebas ejecutadas en este momento.',
    '- La introspección libre del modelo no cuenta como evidencia de una capacidad.',
    '',
    '### Prompt técnico completo',
    report.prompt,
    '',
    '### Prompt corto',
    shortImprovementPrompt(report.gaps)
  ].join('\n');
}
