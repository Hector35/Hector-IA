# Inferencia free-first

Fecha de revisión: 2026-07-22.

## Política de ejecución

1. Reglas y código determinista para clasificación, extracción y routing verificables.
2. Workers AI para tareas breves y no sensibles dentro de su asignación gratuita.
3. Modelo económico cuando Workers AI no esté disponible o sano.
4. Modelo avanzado únicamente para información web actual, tareas nuevas complejas o riesgo elevado.

Toda tarea tiene como máximo una llamada avanzada salvo que un plan explícito y auditado autorice deliberación adicional. El proveedor gratuito tiene timeout de 12 segundos y fallback seguro.

## Recursos seleccionados

| Recurso | Uso | Costo inicial | Límite/decisión | Licencia o términos |
|---|---|---:|---|---|
| Cloudflare Workers AI | generación breve y futura inferencia auxiliar | 0 dentro de 10,000 Neurons/día | proveedor serverless principal gratuito; requiere circuit breaker y timeout | servicio Cloudflare; revisar términos del modelo elegido |
| D1 + reglas TypeScript | routing, clasificación, caché y metadatos | 0 dentro del free tier | primera opción por ser determinista y auditable | código propio |
| Transformers.js | clasificación, embeddings y extracción en navegador | 0 | candidato posterior; usar WASM en iPhone y modelos cuantizados | Apache-2.0 para la librería; comprobar licencia individual del modelo |
| ONNX Runtime Web | inferencia local WASM | 0 | WebGPU no es una base fiable en Safari/iOS; WASM sí está soportado | MIT |

## Decisiones técnicas

- No se añade un paquete de inferencia al bundle principal en esta iteración: descargar pesos en iPhone sin consentimiento empeoraría inicio, datos y memoria.
- WebGPU no se considera requisito porque ONNX Runtime Web no lo soporta actualmente en Safari/iOS. La ruta local futura debe usar WASM y modelos pequeños cuantizados.
- Los modelos abiertos siempre deben registrarse con identificador, revisión y licencia. No se acepta un modelo solo porque sea gratuito.
- La inferencia local se reserva para clasificación, embeddings, extracción y verificación; la generación compleja continúa escalándose.

## Fuentes oficiales consultadas

- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Transformers.js: https://huggingface.co/docs/transformers.js/en/index
- Transformers.js WebGPU: https://huggingface.co/docs/transformers.js/guides/webgpu
- ONNX Runtime Web support: https://onnxruntime.ai/docs/get-started/with-javascript/web.html
- ONNX Runtime WebGPU: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html

## Métricas expuestas

`executePlannedWork` devuelve `freeFirst` con:

- escalón seleccionado;
- capacidad detectada;
- llamadas avanzadas realizadas.

Las utilidades deterministas devuelven cero tokens, costo cero y `modelCalls: 0`.
