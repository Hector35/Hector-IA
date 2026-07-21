import {readFile,writeFile} from 'node:fs/promises';

const reportPath=process.env.VISUAL_REPORT_PATH||'visual-diff/regression-report.json';
const outputPath=process.env.VISUAL_SUMMARY_PATH||'visual-diff/pr-summary.md';
const artifactUrl=process.env.VISUAL_ARTIFACT_URL||'';
const approved=process.env.VISUAL_CHANGE_APPROVED==='true';

const report=JSON.parse(await readFile(reportPath,'utf8'));
const icon=report.summary.passed?'✅':approved?'🟡':'❌';
const status=report.summary.passed?'Sin regresiones significativas':approved?'Cambio visual intencional aprobado':'Regresión visual detectada';
const rows=report.comparisons.map(item=>{
 const file=`\`${item.file}\``;
 if(item.reason)return `| ${item.passed?'✅':'❌'} | ${file} | — | — | ${item.reason} |`;
 const ratio=`${(Number(item.changedRatio||0)*100).toFixed(3)}%`;
 return `| ${item.passed?'✅':'❌'} | ${file} | ${Number(item.changedPixels||0).toLocaleString('en-US')} | ${ratio} | ${item.passed?'Dentro del umbral':'Supera el umbral'} |`;
}).join('\n');

const approvalNote=approved?'\n> La etiqueta `visual-change-approved` permite integrar este cambio intencional, pero el diff y sus métricas permanecen visibles para auditoría.\n':'';
const artifactLine=artifactUrl?`[Abrir ejecución y descargar capturas/diffs](${artifactUrl})`:'El artefacto `iphone-visual-regression` contiene capturas actuales, base, diffs y reportes.';
const markdown=`<!-- hector-iphone-visual-regression -->
## ${icon} Regresión visual de iPhone

**${status}**

| Estado | Vista | Píxeles modificados | Cambio | Resultado |
|---|---|---:|---:|---|
${rows||'| ⚠️ | Sin comparaciones | — | — | Revisar artefacto |'}

**Resumen:** ${report.summary.compared} comparadas · ${report.summary.failed} fallidas · ${report.summary.missing} ausentes.  
**Umbrales:** ${(report.thresholds.maxChangedRatio*100).toFixed(2)}% y ${Number(report.thresholds.maxChangedPixels).toLocaleString('en-US')} píxeles; sensibilidad ${report.thresholds.pixelThreshold}.  
${artifactLine}
${approvalNote}
Para aceptar un rediseño deliberado, añade la etiqueta \`visual-change-approved\` al PR. La etiqueta no reemplaza las referencias: la comparación siempre usa la rama base actual.
`;

await writeFile(outputPath,markdown);
console.log(markdown);
