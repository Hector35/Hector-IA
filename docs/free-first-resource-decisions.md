# Héctor OS: recursos gratuitos y política free-first

Estado verificado: 22 de julio de 2026.

Este registro existe para que las decisiones sobre infraestructura gratuita sean versionadas, revisables y consumibles por el runtime. No sustituye las pruebas ni autoriza por sí mismo una nueva dependencia.

## Objetivo operativo

Reducir llamadas pagadas con esta jerarquía obligatoria:

1. reglas, código, validadores y resultados reutilizables;
2. caché exacta y recuperación D1;
3. inferencia local en el iPhone mediante WASM/WebGPU cuando el dispositivo lo soporte;
4. Workers AI dentro de su asignación gratuita;
5. modelo económico externo;
6. modelo avanzado únicamente para la parte nueva, ambigua o de alto riesgo.

Una etapa solo escala cuando no puede demostrar suficiente confianza o evidencia. Las tareas de alto riesgo conservan autorización explícita aunque exista una habilidad previa.

## Infraestructura ya disponible en Héctor OS

| Recurso | Estado en el repositorio | Decisión |
|---|---|---|
| Cloudflare Worker | Activo | Mantener como orquestador; no ejecutar ML pesado en sus 10 ms de CPU del plan Free. |
| D1 | Binding `DB` activo | Fuente principal de experiencias, habilidades, índices, caché persistente y métricas. |
| R2 | Binding `FILES` activo | Guardar modelos ONNX, evidencias, snapshots y artefactos grandes. |
| Workers AI | Binding `AI` activo | Usar para embedding, reranking y generación rápida con presupuesto diario. |
| GitHub Actions | Repositorio público | Usar runners estándar para typecheck, tests, builds, auditorías y procesos batch. |
| Vectorize | Sin binding | Añadir solo cuando el benchmark híbrido supere de forma medible a D1 léxico. |
| Queues | Sin binding | Añadir para batching y tareas largas cuando la concurrencia del cron sea insuficiente. |
| Browser Rendering | Sin binding | Reservar para páginas que requieren navegador real; no usar como crawler general. |
| Inferencia local PWA | No integrada | Implementar con detección de WebGPU y fallback WASM, sin bloquear dispositivos antiguos. |

## Matriz de capacidades, costo y límites

| Recurso | Capacidad principal | Cuota gratuita verificada | Privacidad | Licencia/términos | Prioridad |
|---|---|---|---|---|---:|
| Reglas + Zod + verificadores | routing, extracción, planificación, verificación | Sin consumo adicional | Worker | Código propio y dependencias actuales | 0 |
| D1 + índices | memoria y recuperación híbrida | 5 M filas leídas/día, 100 k escritas/día, 5 GB por cuenta; 500 MB por DB Free | Cuenta Cloudflare | Servicio Cloudflare | 10 |
| Workers Cache API | memoización exacta e idempotente | 50 llamadas Cache API/subrequests por solicitud Free | PoP Cloudflare | Servicio Cloudflare | 15 |
| ONNX Runtime Web | clasificación, embeddings y modelos pequeños | Cómputo del dispositivo | Local | MIT | 20 |
| Transformers.js | pipelines y modelos cuantizados en browser | Cómputo del dispositivo | Local | Apache-2.0; licencia del modelo se valida aparte | 21 |
| WebGPU Safari | aceleración GPU en iPhone/PWA | Cómputo del dispositivo | Local | Estándar Web; framework según licencia | 22 |
| Workers AI | modelos serverless | 10,000 neuronas/día | Cuenta Cloudflare | Servicio + términos de cada modelo | 30 |
| EmbeddingGemma 300M | embedding multilingüe | Dentro de Workers AI | Cuenta Cloudflare | Términos de EmbeddingGemma | 31 |
| BGE reranker base | reranking query-documento | Dentro de Workers AI | Cuenta Cloudflare | Términos BAAI | 40 |
| GLM 4.7 Flash | routing, extracción, tool calling y generación rápida | Dentro de Workers AI | Cuenta Cloudflare | Términos Zhipu AI | 50 |
| Vectorize | búsqueda vectorial | 30 M dimensiones consultadas/mes, 5 M almacenadas | Cuenta Cloudflare | Servicio Cloudflare | 55 |
| GitHub Actions estándar | compilación, pruebas, batch y auditoría | Gratis e ilimitado para repositorios públicos | Repositorio | Servicio GitHub; fijar acciones por SHA | 60 |
| R2 Standard | objetos, modelos y artefactos | 10 GB-mes, 1 M ops A, 10 M ops B/mes; egreso gratis | Cuenta Cloudflare | Servicio Cloudflare | 70 |
| Cloudflare Queues | batching y entrega garantizada | 10 k operaciones/día; retención Free 24 h | Cuenta Cloudflare | Servicio Cloudflare | 75 |
| Browser Rendering | navegador real y extracción difícil | 10 min/día, 3 concurrentes en Free | Cuenta Cloudflare | Servicio Cloudflare | 80 |
| Workers Builds | builds remotos | 3,000 min/mes, 1 concurrente | Cuenta Cloudflare | Servicio Cloudflare | 85 |
| Tree-sitter WASM | análisis sintáctico de código | Local/GitHub runner | Local | MIT | Candidato |
| esbuild-wasm | parsing/transpilación/bundling | Local/GitHub runner | Local | MIT | Candidato |
| QuickJS Emscripten | sandbox JavaScript acotado | Local/Worker | Local | MIT; revisar límites de aislamiento | Candidato |
| Fuse.js | fuzzy search en colecciones pequeñas | Local | Local | Apache-2.0 | Candidato |

## Modelos seleccionados

### Generación rápida

`@cf/zai-org/glm-4.7-flash`

Razones:

- Cloudflare lo recomienda explícitamente en su renovación del catálogo de mayo de 2026;
- multilingüe, tool calling y contexto de 131,072 tokens;
- apropiado para clasificación, extracción, resúmenes y planificación simple antes de escalar.

El modelo actual `@cf/meta/llama-3.1-8b-instruct-fast` sigue disponible, por lo que no debe romperse el runtime mientras la iteración de modelos migra y compara calidad. Los defaults `@cf/meta/llama-3.1-8b-instruct`, `@hf/meta-llama/meta-llama-3-8b-instruct` y otros modelos marcados como deprecados no se usarán en código nuevo.

### Embeddings

`@cf/google/embeddinggemma-300m`

Razones:

- 768 dimensiones;
- 100+ idiomas, incluyendo español;
- orientado a búsqueda, clasificación, clustering y similitud semántica;
- evita depender de un proveedor externo adicional.

Para fragmentos largos, comparar en benchmark con `@cf/qwen/qwen3-embedding-0.6b` (1,024 dimensiones, 4,096 tokens). No migrar el índice sin estrategia de doble escritura/versionado porque cambiar dimensiones invalida vectores previos.

### Reranking

`@cf/baai/bge-reranker-base`

Se ejecuta únicamente después de un filtro barato de D1/Vectorize. Nunca se rerankea la base completa. El objetivo es enviar menos contexto y de mayor relevancia al generador.

## Inferencia local en iPhone/PWA

Safari 26 incorporó WebGPU en iOS, iPadOS y macOS. La estrategia compatible es:

1. detectar `navigator.gpu`;
2. usar WebGPU para modelos pequeños cuantizados;
3. usar WASM SIMD como fallback;
4. cachear binarios y modelos en IndexedDB/Cache Storage;
5. descargar solo con consentimiento y preferiblemente bajo Wi-Fi;
6. limitar tamaño, memoria, temperatura y batería;
7. no ejecutar generación larga en segundo plano de iOS.

Primeros usos recomendados:

- clasificación de intención y riesgo;
- extracción de campos estructurados;
- embeddings de consultas cortas;
- detección de duplicados;
- resumen corto offline.

No comenzar con un LLM grande en el iPhone. El beneficio máximo por MB se obtiene primero con clasificadores y embeddings pequeños.

## Búsqueda híbrida sin llamadas innecesarias

Orden recomendado:

1. clave exacta normalizada en Cache API/D1;
2. filtros por usuario, tipo, estado verificado y riesgo;
3. coincidencia léxica/FTS y recencia;
4. embedding solo si la señal léxica es insuficiente;
5. Vectorize solo cuando exista binding y presupuesto de dimensiones;
6. reranker sobre los mejores 5-20 candidatos;
7. contexto comprimido y trazable para el modelo.

No debe calcularse embedding en cada lectura. Se genera al escribir/cambiar una experiencia y se reutiliza mientras la versión del modelo no cambie.

## Herramientas de código y sandbox

### Adoptar cuando exista caso medido

- Tree-sitter WASM: análisis estructural y selección de símbolos sin modelo.
- esbuild-wasm: sintaxis, transpile y bundling rápido.
- QuickJS Emscripten: evaluación JavaScript con memoria/tiempo limitados; no sustituye un aislamiento de sistema operativo.
- GitHub Actions: ejecución real de pruebas, builds, linters, auditorías y benchmarks.

### Reglas de seguridad

- ninguna entrada no confiable se ejecuta mediante `eval` del Worker;
- dependencias y acciones se fijan por versión/SHA;
- tokens no se exponen en logs o artefactos;
- acciones destructivas necesitan autorización;
- un resultado de sandbox no se promueve a habilidad sin evidencia verificable.

## Recursos descartados o aplazados

| Opción | Decisión | Motivo |
|---|---|---|
| Runners GPU de GitHub | Descartado | Siempre facturables; no son parte del free tier público estándar. |
| Larger runners | Descartado | Facturables incluso para repos públicos. |
| Vector DB externo gratuito | Aplazado | D1/Vectorize ya cubren el caso, reducen egress y evitan otra dependencia. |
| Inferencia alojada gratuita sin SLA | Descartado como runtime | Cuotas cambiantes, cold starts y riesgo de suspensión. Puede servir solo para pruebas manuales. |
| Modelo LLM grande dentro de la PWA | Aplazado | Descarga, memoria, batería y estabilidad inferiores al valor inicial. |
| Browser Rendering para búsquedas normales | Descartado | La cuota de 10 min/día debe reservarse para páginas dinámicas inevitables. |
| Modelos Cloudflare marcados deprecados | Descartado | Riesgo de alias, cambio de precio o fallo futuro. |
| R2 Infrequent Access | Descartado inicialmente | El free tier solo aplica a Standard y la recuperación tiene cargo. |

## Contrato para las siguientes iteraciones

El archivo `worker/lib/free-resource-catalog.ts` exporta:

- `FREE_FIRST_MODELS`: IDs verificados para generación, embeddings y reranking;
- `FREE_RESOURCE_CATALOG`: capacidades, límites, prioridad, privacidad e integración;
- `selectFreeResourcePlan`: lista ordenada de recursos disponibles para una capacidad;
- `firstFreeResource`: primer escalón gratuito posible;
- `canAvoidPaidApi`: determina si todas las capacidades solicitadas tienen ruta gratuita;
- `isRejectedWorkersAiDefault`: impide introducir modelos ya deprecados como defaults.

Las siguientes ramas pueden integrar estos contratos sin modificar la UI ni duplicar decisiones.

## Criterios de aceptación para integrar un recurso nuevo

Un recurso entra al runtime solo si:

- su documentación oficial está vigente;
- la licencia del código y del modelo es compatible;
- tiene fallback seguro;
- tiene presupuesto y límites explícitos;
- no empeora la tasa de éxito del benchmark;
- reduce llamadas, tokens o costo de forma medible;
- conserva aislamiento por usuario y evidencia;
- no introduce una obligación de pago recurrente.

## Fuentes primarias verificadas

- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers AI models: https://developers.cloudflare.com/workers-ai/models/
- Workers AI deprecations: https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/
- GLM 4.7 Flash: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- EmbeddingGemma 300M: https://developers.cloudflare.com/workers-ai/models/embeddinggemma-300m/
- BGE reranker: https://developers.cloudflare.com/workers-ai/models/bge-reranker-base/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Vectorize pricing: https://developers.cloudflare.com/vectorize/platform/pricing/
- Vectorize limits: https://developers.cloudflare.com/vectorize/platform/limits/
- Queues Free plan: https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/
- Browser Rendering pricing: https://developers.cloudflare.com/changelog/post/2025-07-28-br-pricing/
- Workers Builds limits: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Standard public runners: https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job
- Safari 26 WebGPU: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- ONNX Runtime Web: https://onnxruntime.ai/docs/tutorials/web/
- ONNX Runtime WebGPU: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- Transformers.js: https://huggingface.co/docs/transformers.js/en/index
- Transformers.js repository/license: https://github.com/huggingface/transformers.js
- Tree-sitter: https://github.com/tree-sitter/tree-sitter
- esbuild: https://github.com/evanw/esbuild
- QuickJS Emscripten: https://github.com/justjake/quickjs-emscripten
