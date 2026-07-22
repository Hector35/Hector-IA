# Recuperación híbrida gratuita de Héctor OS

## Decisión

La recuperación predeterminada usa componentes ya disponibles en la infraestructura:

1. D1 como índice unificado y caché persistente.
2. FTS5/BM25 para recuperar candidatos sin llamadas a modelos.
3. Ranking TypeScript por similitud léxica, posición FTS, evidencia, éxito, recencia y costo histórico.
4. Deduplicación y compresión extractiva antes de añadir contexto al modelo.
5. Embeddings como adaptador opcional, únicamente cuando la cobertura léxica es insuficiente.

No se añadió una dependencia npm ni un servicio pagado obligatorio.

## Fuentes evaluadas

| Recurso | Capacidad | Costo inicial | Licencia/servicio | Decisión |
| --- | --- | ---: | --- | --- |
| Cloudflare D1 + FTS5 | SQL, FTS, BM25, triggers y caché | Incluido en el despliegue actual | Servicio Cloudflare | Seleccionado como ruta principal |
| Cloudflare Vectorize | Búsqueda vectorial administrada | Free tier para prototipos | Servicio Cloudflare | Adaptador futuro; no obligatorio |
| Workers AI embeddings | Embeddings en el borde | Cuota/free tier y consumo medido | Servicio Cloudflare | Solo bajo selector de necesidad |
| qmd | BM25, vectores y búsqueda híbrida local | Código abierto | MIT | Útil fuera de Workers; no se integra al runtime serverless |
| ck | Búsqueda local BM25/semántica para código | Código abierto | MIT | Útil como herramienta de desarrollo; no como dependencia de producción |

Documentación oficial consultada:

- https://developers.cloudflare.com/d1/sql-api/sql-statements/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/vectorize/platform/pricing/
- https://developers.cloudflare.com/vectorize/platform/limits/
- https://developers.cloudflare.com/workers-ai/platform/pricing/

Repositorios evaluados:

- https://github.com/qntx-labs/qmd
- https://github.com/BeaconBay/ck

## Índice unificado

`agent_retrieval_items` admite cuatro clases de conocimiento:

- `experience`: ejecuciones verificadas del agente;
- `skill`: habilidades versionadas y promovidas;
- `document`: fragmentos de archivos o memoria documental;
- `result`: resultados reutilizables verificados.

La migración sincroniza automáticamente las experiencias válidas existentes. Los demás módulos pueden usar `upsertRetrievalItem` para indexar habilidades, documentos y resultados sin conocer la implementación FTS.

## Selector de embeddings

El selector evita una llamada cuando:

- no existe proveedor configurado;
- FTS y ranking local ya recuperaron al menos cuatro candidatos;
- la mejor coincidencia léxica supera `0.42`;
- la consulta contiene dos términos significativos o menos.

Solo solicita embedding cuando existe proveedor y la consulta tiene suficiente información, pero la recuperación gratuita no produjo señal adecuada.

## Caché e invalidación

La clave combina consulta normalizada, límite y presupuesto de contexto. Cada usuario mantiene `corpus_version`. Los triggers incrementan esa versión y eliminan la caché cuando cambia cualquier elemento indexado, evitando reutilizar resultados obsoletos.

## Métricas

Cada recuperación devuelve:

- candidatos leídos y devueltos;
- acierto de caché;
- llamadas de embeddings;
- caracteres de contexto;
- tokens de entrada estimados.

Estas métricas permiten comparar la ruta anterior —hasta 120 experiencias genéricas— con recuperación dirigida, deduplicada y comprimida.
