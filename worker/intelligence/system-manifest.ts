export const SYSTEM_VERSION='6.1.0';
export const RELEASED_AT='2026-07-24';

export const RELEASE_CHANGES=[
  'Selecciona Kimi K2.5 como cerebro abierto operativo para chat, visión, programación, agentes y herramientas.',
  'Mantiene Kimi K2 Base separado como fundamento entrenable para los futuros pesos propios de Héctor.',
  'Conserva Qwen3-8B como runtime de transición y V41 como campeón propio hasta que un candidato mayor lo supere.',
  'Identifica cualquier fallback y nunca presenta Kimi como activo si el endpoint no respondió.',
  'Actualiza la Vista Etapa 6 para mostrar claramente uso diario, entrenamiento propio, maestro, fallback y campeón.'
] as const;

export const VERIFIED_CAPABILITIES=[
  'Etapa 6 visible y consultable desde cualquier pantalla de la PWA.',
  'Kimi K2.5 integrado mediante un endpoint OpenAI-compatible con estado verificable.',
  'Fallback explícito a Workers AI cuando Kimi no está configurado o falla.',
  'Separación visible entre modelo operativo, fundamento entrenable y campeón neuronal propio.',
  'Chat contextual con historial, resúmenes y memoria híbrida en D1.',
  'Búsqueda web cuando la solicitud requiere información reciente.',
  'Archivos y evidencias mediante R2.',
  'Trabajos persistentes con planner, selección de Skills, progreso y journal de experiencias.',
  'Runner de programación editar-probar-corregir mediante GitHub Actions y modelos de razonamiento.',
  'PWA móvil con Markdown, metadatos reales del modelo y estado de la arquitectura.'
] as const;

export const CURRENT_LIMITATIONS=[
  'Kimi K2.5 sólo responde realmente cuando KIMI_K2_BASE_URL y KIMI_K2_TOKEN apuntan a un endpoint compatible; sin ellos la PWA muestra fallback.',
  'Kimi K2 Base es entrenable, pero su escala de 1T parámetros exige almacenamiento y cómputo multi-GPU que todavía no están conectados.',
  'El campeón neuronal propio vigente sigue siendo V41, basado en Qwen2.5-1.5B; no se sustituirá sin una mejora reproducible.',
  'Qwen3-8B sirve para validar el pipeline y no cumple la meta final de modelo 70B/MoE o superior.',
  'El corpus canónico de 10,000 ejemplos y Benchmark V2 de 500–1,000 casos todavía deben completarse antes del siguiente entrenamiento principal.',
  'La máxima inteligencia y los modelos MoE grandes pueden aumentar costo y latencia.',
  'Correo, calendario, Drive y otras aplicaciones aún no están conectadas dentro de Héctor OS.',
  'No puede confirmar cambios externos recientes sin consultar una herramienta o recibir evidencia.'
] as const;

export function shortImprovementPrompt(gaps:string[]=[]){const targets=gaps.length?gaps.join(', '):'corpus canónico de 10,000 ejemplos, Benchmark V2, endpoint operativo de Kimi K2.5, infraestructura de entrenamiento para Kimi K2 Base y aumento medible de autonomía';return `Trabaja en Hector35/Hector-IA dentro de Etapa 6 y corrige estas carencias verificables: ${targets}. Prioriza activos neuronales reutilizables, ejecuta typecheck, tests y build, y no declares progreso sin evidencia reproducible.`;}
export function renderSystemReport(score?:number,grade?:string,gaps:string[]=[]){return[`## Héctor OS ${SYSTEM_VERSION} · Etapa 6`,`Actualizado: ${RELEASED_AT}`,'','### Qué cambió',...RELEASE_CHANGES.map(x=>`- ${x}`),'','### Qué puede hacer ahora',...VERIFIED_CAPABILITIES.map(x=>`- ${x}`),'','### Limitaciones actuales',...CURRENT_LIMITATIONS.map(x=>`- ${x}`),...(score===undefined?[]:['',`### Autoevaluación real: ${score}/100 (${grade})`,gaps.length?`Pruebas pendientes: ${gaps.join(', ')}.`:'La suite actual no detectó fallos, aunque las limitaciones arquitectónicas anteriores siguen vigentes.']),'','### Prompt corto para mejorar',shortImprovementPrompt(gaps)].join('\n');}
