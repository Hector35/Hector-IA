export const SYSTEM_VERSION='6.0.0';
export const RELEASED_AT='2026-07-24';

export const RELEASE_CHANGES=[
  'Activa Etapa 6 como arquitectura híbrida autoevolutiva visible desde la PWA.',
  'Fuerza razonamiento alto y doble deliberación en el chat normal para producir una síntesis final reforzada.',
  'Registra GPT-5.6 de razonamiento como cerebro maestro, Qwen3-8B como cerebro abierto de transición y V41 como campeón propio vigente.',
  'Publica un panel verificable con modelos conectados, modo operativo y metas de datos, benchmark y autonomía.',
  'Conserva el ciclo de entrenamiento propio con promoción únicamente por mejora reproducible.'
] as const;

export const VERIFIED_CAPABILITIES=[
  'Etapa 6 visible y consultable desde cualquier pantalla de la PWA.',
  'Chat contextual en modo de máxima inteligencia con razonamiento alto y deliberación independiente.',
  'Enrutamiento híbrido entre OpenAI, Cloudflare Workers AI, Qwen abierto y el campeón neuronal propio.',
  'Chat contextual con historial, resúmenes y memoria híbrida en D1.',
  'Búsqueda web cuando la solicitud requiere información reciente.',
  'Archivos y evidencias mediante R2.',
  'Trabajos persistentes con planner, selección de Skills, progreso y journal de experiencias.',
  'Runner de programación editar-probar-corregir mediante GitHub Actions y modelos de razonamiento.',
  'Navegador Playwright con reporte, captura y errores persistidos en Héctor OS.',
  'Autoevaluación reproducible con resultados persistidos y prompts de mejora.',
  'PWA móvil con Markdown, metadatos reales del modelo y estado de la arquitectura.'
] as const;

export const CURRENT_LIMITATIONS=[
  'El campeón neuronal propio vigente sigue basado en Qwen2.5-1.5B; Qwen3-8B es el siguiente cerebro abierto y objetivo de adaptación, no un campeón propio promovido todavía.',
  'La máxima inteligencia usa más inferencias y puede aumentar costo y latencia porque genera dos soluciones y una síntesis.',
  'La autonomía propia todavía no alcanza la meta de 90%; GPT-5.6 continúa siendo el cerebro maestro para tareas difíciles.',
  'El corpus canónico de 10,000 ejemplos y Benchmark V2 de 500–1,000 casos todavía deben completarse antes del siguiente entrenamiento principal.',
  'El runner modifica únicamente Héctor OS y una lista explícita de archivos permitidos; no es una terminal general para cualquier repositorio.',
  'Correo, calendario, Drive y otras aplicaciones aún no están conectadas dentro de Héctor OS.',
  'No puede confirmar cambios externos recientes sin consultar una herramienta o recibir evidencia.'
] as const;

export function shortImprovementPrompt(gaps:string[]=[]){const targets=gaps.length?gaps.join(', '):'corpus canónico de 10,000 ejemplos, Benchmark V2, cómputo QLoRA para Qwen3-8B y aumento medible de autonomía';return `Trabaja en Hector35/Hector-IA dentro de Etapa 6 y corrige estas carencias verificables: ${targets}. Prioriza activos neuronales reutilizables, ejecuta typecheck, tests y build, y no declares progreso sin evidencia reproducible.`;}
export function renderSystemReport(score?:number,grade?:string,gaps:string[]=[]){return[`## Héctor OS ${SYSTEM_VERSION} · Etapa 6`,`Actualizado: ${RELEASED_AT}`,'','### Qué cambió',...RELEASE_CHANGES.map(x=>`- ${x}`),'','### Qué puede hacer ahora',...VERIFIED_CAPABILITIES.map(x=>`- ${x}`),'','### Limitaciones actuales',...CURRENT_LIMITATIONS.map(x=>`- ${x}`),...(score===undefined?[]:['',`### Autoevaluación real: ${score}/100 (${grade})`,gaps.length?`Pruebas pendientes: ${gaps.join(', ')}.`:'La suite actual no detectó fallos, aunque las limitaciones arquitectónicas anteriores siguen vigentes.']),'','### Prompt corto para mejorar',shortImprovementPrompt(gaps)].join('\n');}
