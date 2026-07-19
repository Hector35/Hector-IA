export const SYSTEM_VERSION='2.4.0';
export const RELEASED_AT='2026-07-19';

export const RELEASE_CHANGES=[
  'Muestra el proveedor y el modelo real usado en cada respuesta.',
  'Responde qué proveedor, modelo, nivel y motivo de enrutamiento utilizó.',
  'El autoanálisis ya no depende de introspección libre: combina manifiesto, D1 y pruebas ejecutadas.',
  'Incluye cada prueba aprobada o fallida, puntuación, modelo y latencia.',
  'Genera un prompt técnico completo y un prompt corto para continuar las mejoras en GitHub.'
] as const;

export const VERIFIED_CAPABILITIES=[
  'Chat contextual con historial, resúmenes y memoria relevante en D1.',
  'Enrutamiento híbrido entre Cloudflare Workers AI y OpenAI con fallback.',
  'Búsqueda web cuando la solicitud requiere información reciente.',
  'Archivos mediante R2.',
  'Trabajos persistentes con planner, selección de Skills, progreso y journal de experiencias.',
  'Workflow de navegador con Playwright para verificar URLs conocidas y guardar evidencia.',
  'Autoevaluación reproducible con resultados persistidos y prompts de mejora.',
  'PWA móvil con Markdown y metadatos reales del modelo.'
] as const;

export const CURRENT_LIMITATIONS=[
  'El workflow de navegador todavía no se despacha automáticamente desde el orquestador ni devuelve sus artefactos al chat.',
  'No dispone aún de un runner general con terminal y filesystem aislado para modificar proyectos arbitrarios.',
  'Los trabajos persistentes todavía no ejecutan un ciclo completo editar-probar-corregir.',
  'No puede confirmar cambios externos recientes sin consultar una herramienta o recibir evidencia.',
  'La recuperación de memoria sigue basada principalmente en coincidencia textual.',
  'Correo, calendario, Drive y otras aplicaciones aún no están conectadas dentro de Héctor OS.',
  'Respuestas históricas antiguas pueden no conservar el modelo exacto que las produjo.'
] as const;

export function shortImprovementPrompt(gaps:string[]=[]){
  const targets=gaps.length?gaps.join(', '):'despacho automático del navegador, runner agentivo, ciclo editar-probar-corregir y memoria semántica';
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
