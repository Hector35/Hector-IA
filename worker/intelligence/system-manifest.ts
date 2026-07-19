export const SYSTEM_VERSION='2.6.0';
export const RELEASED_AT='2026-07-19';

export const RELEASE_CHANGES=[
  'Integra reportes y capturas del navegador en D1 y R2 mediante callbacks OIDC.',
  'Añade recuperación híbrida de memoria: coincidencia textual más similitud semántica con embeddings.',
  'Verifica los pull requests del agente después del merge mediante health check y Playwright móvil.',
  'Conserva evidencia reproducible del smoke test y publica recibos de éxito o fallo.',
  'Mantiene fallback seguro cuando embeddings o herramientas externas no están disponibles.'
] as const;

export const VERIFIED_CAPABILITIES=[
  'Chat contextual con historial, resúmenes y memoria híbrida en D1.',
  'Enrutamiento híbrido entre Cloudflare Workers AI y OpenAI con fallback.',
  'Búsqueda web cuando la solicitud requiere información reciente.',
  'Archivos y evidencias mediante R2.',
  'Trabajos persistentes con planner, selección de Skills, progreso y journal de experiencias.',
  'Runner de programación editar-probar-corregir mediante GitHub Actions y OpenAI de razonamiento.',
  'Navegador Playwright con reporte, captura y errores persistidos en Héctor OS.',
  'Smoke test automático posterior al merge de pull requests generados por el agente.',
  'Autoevaluación reproducible con resultados persistidos y prompts de mejora.',
  'PWA móvil con Markdown y metadatos reales del modelo.'
] as const;

export const CURRENT_LIMITATIONS=[
  'El runner modifica únicamente Héctor OS y una lista explícita de archivos permitidos; no es una terminal general para cualquier repositorio.',
  'Los artefactos quedan disponibles en D1/R2, pero la interfaz todavía no presenta la captura como imagen dentro del chat.',
  'El merge continúa requiriendo una decisión separada; la verificación automática ocurre después de fusionarlo.',
  'Solo las memorias nuevas guardadas explícitamente reciben embeddings; las anteriores necesitan backfill.',
  'No puede confirmar cambios externos recientes sin consultar una herramienta o recibir evidencia.',
  'Correo, calendario, Drive y otras aplicaciones aún no están conectadas dentro de Héctor OS.',
  'Respuestas históricas antiguas pueden no conservar el modelo exacto que las produjo.'
] as const;

export function shortImprovementPrompt(gaps:string[]=[]){const targets=gaps.length?gaps.join(', '):'backfill de embeddings, visualización de evidencias en la PWA e integraciones externas';return `Audita Hector35/Hector-IA y corrige estas carencias verificables: ${targets}. Añade pruebas reproducibles, ejecuta typecheck, tests y build, y no declares éxito sin evidencia de despliegue y smoke test.`;}
export function renderSystemReport(score?:number,grade?:string,gaps:string[]=[]){return[`## Héctor OS ${SYSTEM_VERSION}`,`Actualizado: ${RELEASED_AT}`,'','### Qué cambió',...RELEASE_CHANGES.map(x=>`- ${x}`),'','### Qué puede hacer ahora',...VERIFIED_CAPABILITIES.map(x=>`- ${x}`),'','### Limitaciones actuales',...CURRENT_LIMITATIONS.map(x=>`- ${x}`),...(score===undefined?[]:['',`### Autoevaluación real: ${score}/100 (${grade})`,gaps.length?`Pruebas pendientes: ${gaps.join(', ')}.`:'La suite actual no detectó fallos, aunque las limitaciones arquitectónicas anteriores siguen vigentes.']),'','### Prompt corto para mejorar',shortImprovementPrompt(gaps)].join('\n');}
