export const SYSTEM_VERSION='2.5.0';
export const RELEASED_AT='2026-07-19';

export const RELEASE_CHANGES=[
  'Añade un runner de programación despachable desde los trabajos de Héctor OS.',
  'El runner puede inspeccionar archivos permitidos, proponer cambios y ejecutar hasta tres ciclos de reparación.',
  'Solo publica un pull request después de aprobar typecheck, pruebas y build.',
  'Registra en D1 las fases working, testing, repairing, completed o blocked.',
  'Mantiene una jaula de archivos, tamaño, intentos y riesgo bajo para evitar cambios descontrolados.'
] as const;

export const VERIFIED_CAPABILITIES=[
  'Chat contextual con historial, resúmenes y memoria relevante en D1.',
  'Enrutamiento híbrido entre Cloudflare Workers AI y OpenAI con fallback.',
  'Búsqueda web cuando la solicitud requiere información reciente.',
  'Archivos mediante R2.',
  'Trabajos persistentes con planner, selección de Skills, progreso y journal de experiencias.',
  'Runner de programación editar-probar-corregir mediante GitHub Actions y OpenAI de razonamiento.',
  'Workflow de navegador con Playwright para verificar URLs conocidas y guardar evidencia.',
  'Autoevaluación reproducible con resultados persistidos y prompts de mejora.',
  'PWA móvil con Markdown y metadatos reales del modelo.'
] as const;

export const CURRENT_LIMITATIONS=[
  'El runner modifica únicamente Héctor OS y una lista explícita de archivos permitidos; no es una terminal general para cualquier repositorio.',
  'El workflow de navegador todavía no devuelve automáticamente capturas y artefactos al chat.',
  'La publicación termina en pull request; el merge y la verificación de producción siguen siendo pasos separados.',
  'No puede confirmar cambios externos recientes sin consultar una herramienta o recibir evidencia.',
  'La recuperación de memoria sigue basada principalmente en coincidencia textual.',
  'Correo, calendario, Drive y otras aplicaciones aún no están conectadas dentro de Héctor OS.',
  'Respuestas históricas antiguas pueden no conservar el modelo exacto que las produjo.'
] as const;

export function shortImprovementPrompt(gaps:string[]=[]){
  const targets=gaps.length?gaps.join(', '):'integración de artefactos del navegador, memoria semántica, merge verificado y smoke test de producción';
  return `Audita Hector35/Hector-IA y corrige estas carencias verificables: ${targets}. Añade pruebas reproducibles, ejecuta typecheck, tests y build, y no declares éxito sin evidencia de despliegue y smoke test.`;
}

export function renderSystemReport(score?:number,grade?:string,gaps:string[]=[]){
  return [
    `## Héctor OS ${SYSTEM_VERSION}`,
    `Actualizado: ${RELEASED_AT}`,
    '',
    '### Qué cambió',
    ...RELEASE_CHANGES.map(x=>`- ${x}`),
    '',
    '### Qué puede hacer ahora',
    ...VERIFIED_CAPABILITIES.map(x=>`- ${x}`),
    '',
    '### Limitaciones actuales',
    ...CURRENT_LIMITATIONS.map(x=>`- ${x}`),
    ...(score===undefined?[]:['',`### Autoevaluación real: ${score}/100 (${grade})`,gaps.length?`Pruebas pendientes: ${gaps.join(', ')}.`:'La suite actual no detectó fallos, aunque las limitaciones arquitectónicas anteriores siguen vigentes.']),
    '',
    '### Prompt corto para mejorar',
    shortImprovementPrompt(gaps)
  ].join('\n');
}