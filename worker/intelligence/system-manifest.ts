export const SYSTEM_VERSION='6.2.0';
export const RELEASED_AT='2026-07-24';

export const RELEASE_CHANGES=[
  'Selecciona Qwen3.5-397B-A17B como cerebro abierto principal para chat, visión, programación, agentes y herramientas.',
  'Usa los mismos pesos Apache 2.0 de Qwen 397B como objetivo neuronal grande y entrenable de Héctor.',
  'Conserva Kimi K2.5 como respaldo MoE y Workers AI como fallback ligero identificado.',
  'Mantiene V41 como campeón propio vigente hasta que un checkpoint grande lo supere de forma reproducible.',
  'Actualiza la Vista Etapa 6 para mostrar Qwen 397B, su estado real, entrenamiento, respaldos, maestro y campeón.'
] as const;

export const VERIFIED_CAPABILITIES=[
  'Etapa 6 visible y consultable desde cualquier pantalla de la PWA.',
  'Qwen3.5-397B-A17B integrado mediante un endpoint OpenAI-compatible con estado verificable.',
  'Cadena de fallback explícita: Qwen 397B, Kimi K2.5 y Workers AI.',
  'Registro en D1 del modelo solicitado, modelo efectivo, nivel de fallback y motivo de enrutamiento.',
  'Separación visible entre cerebro operativo, fundamento entrenable y campeón neuronal propio.',
  'Chat contextual con historial, resúmenes y memoria híbrida en D1.',
  'Búsqueda web cuando la solicitud requiere información reciente.',
  'Archivos y evidencias mediante R2.',
  'Trabajos persistentes con planner, selección de Skills, progreso y journal de experiencias.',
  'PWA móvil con Markdown, metadatos reales del modelo y estado de la arquitectura.'
] as const;

export const CURRENT_LIMITATIONS=[
  'Qwen 397B sólo responde realmente cuando QWEN_397B_BASE_URL y QWEN_397B_TOKEN apuntan a un endpoint compatible; sin ellos la PWA usa fallback.',
  'Los pesos oficiales ocupan cientos de gigabytes y su inferencia o adaptación exige infraestructura multi-GPU que todavía no está conectada.',
  'El campeón neuronal propio vigente sigue siendo V41, basado en Qwen2.5-1.5B; no se sustituirá sin una mejora reproducible.',
  'Qwen3-8B continúa como herramienta económica para validar partes del pipeline, pero no es la meta final.',
  'El corpus canónico de 10,000 ejemplos y Benchmark V2 de 500–1,000 casos todavía deben completarse antes del siguiente entrenamiento principal.',
  'La máxima inteligencia y los modelos MoE grandes pueden aumentar costo y latencia.',
  'Correo, calendario, Drive y otras aplicaciones aún no están conectadas dentro de Héctor OS.',
  'No puede confirmar cambios externos recientes sin consultar una herramienta o recibir evidencia.'
] as const;

export function shortImprovementPrompt(gaps:string[]=[]){const targets=gaps.length?gaps.join(', '):'corpus canónico de 10,000 ejemplos, Benchmark V2, endpoint operativo de Qwen3.5-397B-A17B, infraestructura distribuida de entrenamiento y aumento medible de autonomía';return `Trabaja en Hector35/Hector-IA dentro de Etapa 6 y corrige estas carencias verificables: ${targets}. Prioriza activos neuronales reutilizables, ejecuta typecheck, tests y build, y no declares progreso sin evidencia reproducible.`;}
export function renderSystemReport(score?:number,grade?:string,gaps:string[]=[]){return[`## Héctor OS ${SYSTEM_VERSION} · Etapa 6`,`Actualizado: ${RELEASED_AT}`,'','### Qué cambió',...RELEASE_CHANGES.map(x=>`- ${x}`),'','### Qué puede hacer ahora',...VERIFIED_CAPABILITIES.map(x=>`- ${x}`),'','### Limitaciones actuales',...CURRENT_LIMITATIONS.map(x=>`- ${x}`),...(score===undefined?[]:['',`### Autoevaluación real: ${score}/100 (${grade})`,gaps.length?`Pruebas pendientes: ${gaps.join(', ')}.`:'La suite actual no detectó fallos, aunque las limitaciones arquitectónicas anteriores siguen vigentes.']),'','### Prompt corto para mejorar',shortImprovementPrompt(gaps)].join('\n');}
