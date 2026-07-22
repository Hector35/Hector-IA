# Benchmark de memoria híbrida gratuita

## Objetivo
Medir recuperación útil y reducción de contexto sin usar una API de embeddings pagada.

## Casos reproducibles

| Caso | Consulta | Candidatos esperados | Embedding recomendado | Resultado esperado |
|---|---|---:|---:|---|
| Exacto | `corrige compilación TypeScript` | 1 | no | experiencia de typecheck primero |
| Parcial | `analiza comportamiento inesperado complejo` | 4+ | sí, solo free/local | recuperación léxica + posible reranking gratuito |
| No relacionado | `evaluar paciente médico` frente a experiencia de compilación | 0 | no | sin contaminación semántica |
| No verificado | experiencia sin evidencia objetiva | 0 | no | excluida |
| Duplicado | mismo source_type/source_id repetido | 1 | no | conservar mejor puntuación |

## Métricas

- `sourceCount`: elementos inspeccionados.
- `hits.length`: contexto finalmente seleccionado.
- `context.length`: caracteres enviados al modelo.
- `embeddingRecommended`: solo verdadero en la zona ambigua.
- `finalScore`: mezcla reproducible de similitud léxica, etiquetas, recencia, confianza y éxito.

## Objetivos de costo

1. Coincidencia exacta o fuerte: cero llamadas de embedding y cero llamadas avanzadas si existe salida determinista verificada.
2. Coincidencia parcial: contexto comprimido a un máximo predeterminado y una sola inferencia para la parte nueva.
3. Consulta nueva: escalamiento normal, sin pagar por una búsqueda semántica sin candidatos suficientes.
4. Caché exacta: cero inferencias mientras el registro siga vigente y conserve su huella de evidencia.

## Invariantes

- aislamiento obligatorio por `user_id`;
- solo memoria con `verified=1`;
- caché separada por usuario y namespace;
- FTS5 y ranking TypeScript funcionan sin servicios externos;
- embeddings son opcionales y nunca requisito para el fallback;
- invalidación disponible cuando cambia la evidencia o el procedimiento.
