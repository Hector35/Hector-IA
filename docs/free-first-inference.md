# Inferencia free-first

Revisión: 2026-07-22.

Orden de ejecución: reglas deterministas → Workers AI → modelo económico → modelo avanzado.

- Cloudflare Workers AI: 10,000 Neurons diarios sin costo según documentación oficial vigente; se usa con timeout, circuit breaker y fallback.
- Transformers.js: opción futura para clasificación, extracción y embeddings locales; librería Apache-2.0, validando además la licencia de cada modelo.
- ONNX Runtime Web: opción futura WASM para iPhone; MIT. WebGPU no se considera requisito porque Safari/iOS no figura como soportado por ONNX Runtime Web.
- D1 y TypeScript: routing y extracción deterministas, auditables y sin llamadas externas.

Fuentes oficiales:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://huggingface.co/docs/transformers.js/en/index
- https://huggingface.co/docs/transformers.js/guides/webgpu
- https://onnxruntime.ai/docs/get-started/with-javascript/web.html

`executePlannedWork` expone `freeFirst` con escalón, capacidad y llamadas avanzadas. Clasificación, extracción y routing deterministas reportan cero tokens, costo cero y cero llamadas avanzadas.
