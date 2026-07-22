# Inferencia free-first

Estado: implementado en runtime del Worker, sin cambios de UI.

## Objetivo
Resolver primero con código determinista y después con la cuota gratuita de Workers AI. Una API avanzada solo se usa cuando las reglas y el modelo ligero no son suficientes o no superan los controles existentes de calidad, riesgo y salud del proveedor.

## Escalones

| Escalón | Capacidades | Costo recurrente obligatorio | Límite operativo | Licencia / términos | Integración |
|---|---|---:|---|---|---|
| Reglas locales `hector-rules-v1` | clasificación, extracción de correos/URLs/números/fechas, routing y validación JSON | $0 | CPU del Worker | código propio | activo; 0 llamadas y 0 tokens |
| `@cf/ibm-granite/granite-4.0-h-micro` | resumen, clasificación, extracción, RAG y function calling ligero | $0 dentro de la asignación diaria | 8 s; 220–360 tokens | Apache-2.0 | activo como modelo de utilidad |
| `@cf/meta/llama-3.2-3b-instruct` | conversación breve y generación general | $0 dentro de la asignación diaria | 10 s; máximo 900 tokens | Meta Llama 3.2 Community License | activo como modelo rápido general |
| OpenAI configurado | tareas nuevas, web, sensibles o complejas; fallback de calidad | variable | gobernador vigente: 0/1/3 llamadas según reutilización y complejidad | servicio externo | último escalón |

Fuentes oficiales:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/
- https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/
- https://huggingface.co/ibm-granite/granite-4.0-h-micro

## Contrato de runtime
1. La caché semántica D1 y la memoria híbrida se consultan antes de inferir.
2. `chooseProvider` detecta operaciones estructuradas.
3. `callCloudflare` intenta `tryDeterministicFreeInference` antes del binding `AI`.
4. Las reglas funcionan incluso si Workers AI está apagado.
5. Granite atiende utilidades ligeras y Llama 3.2 consultas breves.
6. Web, contenido sensible, tareas técnicas/complejas, circuito abierto o feedback negativo conservan OpenAI.
7. Timeout, respuesta vacía o calidad insuficiente activan el fallback existente.
8. El call governor registra cero llamadas para `hector-rules-v1`, deduplica inferencias concurrentes y limita pasadas avanzadas.

## Presupuesto por tarea
- clasificación, extracción, routing y JSON: 0 llamadas;
- caché o habilidad determinista: 0 llamadas;
- resumen breve: hasta 1 Workers AI y 1 fallback solo si falla;
- tarea parcialmente conocida o nueva simple: 1 avanzada;
- tarea nueva compleja: hasta 3 únicamente cuando el gobernador lo justifica;
- alto riesgo: no se automatiza por ahorro.

## Recursos locales diferidos
Transformers.js y ONNX Runtime Web siguen disponibles como escalón futuro WASM/WebGPU, pero no se añaden al bundle del iPhone hasta medir memoria, descarga, latencia y compatibilidad por dispositivo. Los embeddings/rerankers gratuitos se activarán solo si superan el ranking D1/FTS ya integrado sin introducir contaminación semántica.

## Rollback
- `CLOUDFLARE_AI_ENABLED=false` conserva reglas locales y envía el resto al proveedor avanzado.
- `CLOUDFLARE_MODEL_UTILITY`, `CLOUDFLARE_MODEL_FAST` y `HECTOR_FREE_FIRST_TIMEOUT_MS` son configurables.
- retirar la importación de `free-first` en `providers.ts` restaura el routing anterior sin migraciones ni pérdida de datos.
