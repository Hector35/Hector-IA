# Inferencia free-first

Estado: implementado en runtime del Worker, sin cambios de UI.

## Objetivo

Resolver primero con código determinista y después con la cuota gratuita de Workers AI. Una API avanzada solo se usa cuando las reglas y el modelo ligero no son suficientes o no superan los controles existentes de calidad, riesgo y salud del proveedor.

## Escalones

| Escalón | Capacidades | Costo recurrente obligatorio | Límite operativo | Licencia / términos | Integración |
|---|---|---:|---|---|---|
| Reglas locales `hector-rules-v1` | clasificación, extracción de correos/URLs/números/fechas, routing y validación JSON | $0 | CPU del Worker | código propio del repositorio | activo; 0 llamadas y 0 tokens |
| `@cf/ibm-granite/granite-4.0-h-micro` | resumen, clasificación, extracción, RAG y function calling ligero | $0 dentro de la asignación diaria | 8 s; 220–360 tokens de salida por tarea | Apache-2.0 | activo como modelo de utilidad |
| `@cf/meta/llama-3.2-3b-instruct` | conversación breve y generación general | $0 dentro de la asignación diaria | 10 s; máximo 900 tokens | Meta Llama 3.2 Community License | activo como modelo rápido general |
| OpenAI configurado | tareas nuevas, web, sensibles o complejas; fallback de calidad | variable | una llamada simple después de fallo del escalón gratuito; el modo profundo conserva sus políticas existentes | servicio externo | fallback existente |

Cloudflare Workers AI incluye 10,000 Neurons diarios sin cargo. Al 8 de julio de 2026, Granite H Micro cuesta 1,542 Neurons por millón de tokens de entrada y 10,158 por millón de salida; Llama 3.2 3B cuesta 4,625 y 30,475 respectivamente. Fuentes oficiales:

- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/
- https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/
- https://huggingface.co/ibm-granite/granite-4.0-h-micro

## Contrato de runtime

1. `chooseProvider` detecta primero operaciones estructuradas.
2. `callCloudflare` intenta `tryDeterministicFreeInference` antes de consultar el binding `AI`.
3. Las operaciones deterministas funcionan incluso si Workers AI no está disponible.
4. Las utilidades no deterministas usan Granite con baja temperatura, salida limitada y timeout estricto.
5. Consultas generales breves usan Llama 3.2 3B.
6. Web, contenido sensible, tareas técnicas/complejas, circuito de calidad abierto o feedback negativo conservan el escalamiento a OpenAI.
7. Un error, timeout o respuesta vacía de Workers AI usa el fallback existente; no se oculta el fallo.

## Presupuesto por tarea

- Clasificación, extracción, routing y JSON: `0` llamadas gratuitas, `0` llamadas avanzadas.
- Resumen explícito: máximo `1` llamada a Workers AI y `1` fallback avanzado.
- Consulta breve general: máximo `1` llamada a Workers AI y `1` fallback avanzado.
- Tareas profundas: siguen el presupuesto cognitivo y deliberación ya existentes; esta capa no degrada su calidad.

## Recursos evaluados y no activados todavía

### Transformers.js + WebGPU/WASM

Transformers.js puede ejecutar modelos cuantizados en navegador mediante WASM y, cuando el navegador lo soporta, WebGPU. No se añadió al bundle de la PWA en esta iteración porque aumenta descarga, memoria y tiempo de arranque, y el soporte WebGPU sigue siendo variable en Safari/iPhone. Se conserva como siguiente escalón opcional para embeddings o clasificación privada después de medir compatibilidad real por dispositivo.

Documentación oficial: https://huggingface.co/docs/transformers.js/en/index y https://huggingface.co/docs/transformers.js/en/guides/webgpu

### Embeddings y reranking

Workers AI ofrece `@cf/baai/bge-m3` y `@cf/qwen/qwen3-embedding-0.6b` a 1,075 Neurons por millón de tokens de entrada, y `@cf/baai/bge-reranker-base` a 283. Son candidatos para la iteración de memoria híbrida. No se conectaron aquí para evitar duplicar el frente concurrente de recuperación.

## Criterios de rollback

- Configurar `CLOUDFLARE_AI_ENABLED=false` mantiene las reglas locales y envía el resto al proveedor avanzado.
- Cambiar `CLOUDFLARE_MODEL_UTILITY` o `CLOUDFLARE_MODEL_FAST` no requiere cambios de código.
- El timeout puede ajustarse con `HECTOR_FREE_FIRST_TIMEOUT_MS` entre 1 y 20 segundos.
- Eliminar la importación de `free-first` en `providers.ts` restaura el routing anterior sin migraciones ni pérdida de datos.
