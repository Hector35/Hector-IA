# Estrategia free-first de Héctor OS

Fecha de revisión: 2026-07-22.

## Decisión

Héctor OS debe resolver cada subtarea con el primer escalón capaz y verificable:

1. reglas TypeScript, SQL, parsers y pruebas;
2. recuperación D1/R2 y caché exacta o semántica;
3. inferencia local en navegador mediante WebGPU/WASM, solo con detección de capacidad;
4. Workers AI dentro de su asignación gratuita diaria y con licencia de modelo permitida;
5. modelo externo económico;
6. modelo avanzado únicamente para novedad, ambigüedad o riesgo que no pueda resolverse antes.

Ningún proveedor de IA gratuito es requisito para que el núcleo funcione. La ausencia o agotamiento de una cuota debe producir fallback seguro, no pérdida de datos ni ejecución silenciosa de acciones riesgosas.

## Matriz de recursos

| Recurso | Capacidad útil | Cuota/costo verificado | Licencia/condición | Integración recomendada | Decisión |
|---|---|---|---|---|---|
| TypeScript + D1 SQL | routing, extracción estructurada, validación, búsqueda lexical | $0 dentro del proyecto y cuota D1 | código propio | primera línea para toda tarea repetible | adoptar ahora |
| Cloudflare D1 | memoria estructurada, índices, FTS/búsqueda híbrida | free plan con límites diarios; escala a cero | términos Cloudflare | metadatos, experiencias, habilidades, métricas y caché | adoptar ahora |
| Cloudflare R2 Standard | artefactos, modelos pequeños, documentos, resultados | 10 GB-mes, 1 M Class A y 10 M Class B al mes gratis; egress gratis | términos Cloudflare | objetos grandes e inmutables; no usar como base transaccional | adoptar ahora |
| Workers AI | embeddings, clasificación, extracción y generación pequeña | 10,000 Neurons/día gratis; después requiere plan de pago | términos Cloudflare + licencia específica del modelo | proveedor opcional con presupuesto diario y health check | piloto controlado |
| Cloudflare Vectorize | índice vectorial administrado | free allocation sujeta a dimensiones consultadas/almacenadas | términos Cloudflare | usar solo si supera D1 híbrido en benchmark y cabe en cuota | diferir hasta benchmark |
| Transformers.js v4 | inferencia local en navegador con WebGPU/WASM | sin costo de API | Apache-2.0 para runtime; licencia por modelo | embeddings/clasificación local, carga diferida y feature detection | piloto, no requisito |
| ONNX Runtime Web | ejecución WASM/WebGPU | sin costo de API | MIT | backend de modelos locales pequeños | adoptar vía Transformers.js |
| GitHub Actions | typecheck, tests, build, auditoría | runners estándar gratuitos para repositorios públicos | términos GitHub; licencias por action | verificación reproducible y sandbox CI | adoptar ahora |
| MiniSearch/FlexSearch o implementación propia | búsqueda lexical en memoria | $0 | MIT/Apache según paquete | solo si D1 no basta; evitar dependencia sin benchmark | evaluar |
| SQLite FTS5 en D1 | recuperación lexical | consume cuota D1 | SQLite public domain + servicio D1 | índice primario antes de embeddings | preferido |
| Modelos pequeños abiertos | clasificación, embedding, reranking | descarga/ejecución gratis | revisar cada model card | allow-list por hash, tamaño, tarea y licencia | seleccionar por tarea |

## Recursos descartados como dependencia inicial

- GPU propia o entrenamiento desde cero: costo y complejidad sin ventaja para esta etapa.
- servicios vectoriales externos con free tier temporal: introducen dependencia y riesgo de suspensión.
- sandboxes que exigen tarjeta o crédito promocional: no cuentan como costo recurrente cero.
- modelos sin licencia explícita, sin mantenimiento reciente o demasiado grandes para iPhone/PWA.
- WebGPU como requisito universal: debe existir fallback WASM o servidor porque soporte, memoria, temperatura y ejecución en segundo plano varían en iPhone.
- R2 SQL/Data Catalog como memoria caliente: son útiles para analítica, no para el camino crítico de cada mensaje.

## Contratos para las siguientes iteraciones

`worker/lib/free-resource-policy.ts` es la allow-list inicial y el selector determinista. Las integraciones posteriores deben:

- registrar proveedor, modelo, licencia, cuota consumida y razón de escalamiento;
- negar modelos o acciones no incluidos explícitamente;
- mantener límites por tarea y por día;
- medir éxito, latencia, tokens y llamadas avanzadas evitadas;
- comparar cualquier embedding o reranker contra una línea base lexical antes de activarlo;
- fijar acciones de GitHub de terceros a SHA inmutable;
- almacenar modelos y artefactos grandes en R2 con checksum;
- no enviar datos sensibles al navegador o a terceros sin política explícita.

## Fuentes primarias

- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Vectorize pricing: https://developers.cloudflare.com/vectorize/platform/pricing/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Transformers.js: https://github.com/huggingface/transformers.js
- ONNX Runtime: https://github.com/microsoft/onnxruntime
- GitHub Actions billing: https://docs.github.com/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
