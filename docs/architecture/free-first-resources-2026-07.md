# ADR — Héctor OS free-first (2026-07)

## Decisión

Héctor OS utiliza una cascada obligatoria de menor a mayor costo:

1. reglas, SQL, caché exacta y habilidades deterministas;
2. recuperación léxica/semántica verificada en D1;
3. Workers AI dentro de la asignación gratuita para clasificación, extracción y transformación breve;
4. una sola inferencia avanzada para la parte realmente nueva;
5. múltiples inferencias únicamente cuando el usuario pide explícitamente doble verificación o soluciones independientes.

No se incorpora ningún servicio con pago recurrente obligatorio.

## Recursos evaluados

| Recurso | Capacidad útil | Nivel gratuito vigente | Licencia / términos | Decisión para Héctor OS |
|---|---|---:|---|---|
| Cloudflare Workers AI | Modelos serverless para clasificación, extracción, embeddings e inferencia breve | 10,000 Neurons/día | Servicio Cloudflare; licencia depende de cada modelo | **Usar ahora** mediante binding `AI`, con timeout, evaluación de calidad y fallback |
| Cloudflare D1 | Ledger, memoria, caché, métricas, FTS/SQL e índices | 5 M filas leídas/día, 100 k escritas/día, 5 GB por cuenta; 500 MB por DB Free | Servicio Cloudflare; SQLite | **Usar ahora**; índices y consultas acotadas evitan escaneos |
| Cloudflare R2 | Archivos, artefactos y modelos opcionales | 10 GB-mes, 1 M operaciones A y 10 M B/mes; egreso gratis | Servicio Cloudflare | **Usar ahora** para artefactos; no para filas pequeñas |
| Cloudflare Vectorize | Búsqueda vectorial administrada | 30 M dimensiones consultadas/mes y 5 M almacenadas en Free | Servicio Cloudflare | **Preparado, no obligatorio**; activar cuando el corpus supere la precisión de D1 híbrido |
| GitHub Actions | Typecheck, pruebas, build, auditorías y benchmarks | Runners estándar gratis en repositorios públicos | Servicio GitHub | **Usar ahora**; evitar larger/GPU runners facturables |
| Transformers.js | Inferencia en navegador mediante WASM/WebGPU | Sin costo de ejecución local | Apache-2.0 | **Piloto futuro** para embeddings/clasificación local; carga diferida y modelos cuantizados |
| ONNX Runtime Web | Runtime WASM/WebGPU, offline y privado | Sin costo de ejecución local | MIT | **Piloto futuro**; feature detection y WASM fallback |
| WebGPU en Safari | Aceleración GPU en PWA | Recurso del dispositivo | Estándar web / implementación WebKit | **No forzar hoy**: Safari/iOS 26 lo incorpora; dispositivos anteriores usan WASM o servidor |
| WebAssembly | Clasificadores, parsers y modelos ligeros locales | Recurso del dispositivo/Worker | Estándar abierto | **Usar cuando el binario sea menor que el ahorro de red y memoria** |
| SQLite FTS / ranking léxico | Recuperación sin embeddings | Incluido en D1 cuando la característica esté disponible; fallback SQL propio | Dominio público | **Preferencia inicial** por costo cero y trazabilidad |
| Vitest + TypeScript | Verificación determinista | Gratis en Actions público | MIT / Apache-2.0 | **Usar ahora** como verificador antes de aprender |
| Pyodide | Python/WASM en navegador | Sin costo local | MPL-2.0 | **Diferir**: descarga y memoria excesivas para iPhone frente a parsers TS específicos |
| Modelos abiertos pequeños | Embeddings, clasificación, reranking | Sin costo local o dentro de Workers AI | Revisar licencia por modelo | **Lista permitida por capacidad y licencia**, nunca descarga automática sin presupuesto |
| Sandboxes gratuitos externos | Ejecución aislada de código | Cuotas variables/no garantizadas | Variable | **No dependencia crítica**; usar GitHub Actions o sandbox existente del proyecto |

## Fuentes primarias

- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Vectorize pricing: https://developers.cloudflare.com/vectorize/platform/pricing/
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- GitHub standard runners: https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job
- Safari 26 WebGPU: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- Transformers.js WebGPU: https://huggingface.co/docs/transformers.js/en/guides/webgpu
- ONNX Runtime Web: https://onnxruntime.ai/docs/tutorials/web/

## Contratos de integración

### Runtime

`createFreeFirstPolicy()` clasifica la tarea, calcula riesgo, determina elegibilidad gratuita, caché y máximo de llamadas avanzadas. El resultado se incluye en `policySummary` del plan.

### Caché

Solo se guarda una respuesta cuando:

- la tarea es de riesgo bajo;
- no utilizó web;
- la evaluación de calidad fue aceptada;
- la ejecución cumplió el plan;
- la respuesta tiene contenido suficiente.

La clave incluye usuario, prompt normalizado, contexto compactado y versión. No se comparte caché entre usuarios.

### Memoria semejante

La caché exacta no sustituye el motor de experiencias: `runtime-reuse` sigue recuperando únicamente experiencias completadas con evidencia estructurada verificada y las puntúa por similitud, éxito, recencia y costo.

### Gobernador de llamadas

- tarea conocida/caché: 0 llamadas;
- clasificación/extracción breve: 0 avanzadas, hasta 1 llamada de Workers AI;
- tarea parcialmente conocida: 1 avanzada con contexto reutilizado;
- tarea nueva: 1 avanzada;
- alto riesgo sin autorización: 0 llamadas y bloqueo;
- múltiples soluciones explícitas: hasta 3 llamadas.

Cada ejecución se registra en `inference_events` con llamadas avanzadas/gratuitas, tokens, caché y costo evitado.

## Recursos descartados como dependencia inicial

- GPU cloud gratuita: cuotas efímeras, colas y ausencia de garantía operativa.
- Hosting de modelos en servicios sin free tier contractual: riesgo de interrupción o cobro.
- Rerankers LLM por cada búsqueda: añaden una llamada donde el ranking léxico + evidencia ya es suficiente.
- Agentes que deliberan siempre en paralelo: multiplican costo sin demostrar mejora proporcional.
- WebGPU obligatorio: excluye iPhone con versiones anteriores a iOS 26.
- Caché semántica no verificada: puede devolver una solución de otro objetivo y propagar errores.

## Umbrales para evolucionar

Vectorize o embeddings locales se activarán solo cuando un benchmark versionado demuestre simultáneamente:

1. mejora de recuperación >= 10 puntos porcentuales;
2. cero contaminación entre usuarios;
3. costo dentro del free tier;
4. latencia p95 aceptable en iPhone;
5. fallback funcional sin el índice vectorial.
