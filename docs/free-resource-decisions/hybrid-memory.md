# Memoria híbrida gratuita

## Decisión

Usar primero D1 + SQLite FTS5 + ranking TypeScript reproducible. Los embeddings quedan como mejora opcional solo para consultas ambiguas con suficientes candidatos.

## Motivos

- costo recurrente obligatorio: 0;
- compatible con Cloudflare Workers y D1;
- aislamiento por usuario en cada consulta;
- verificable por pruebas, sin depender de un proveedor externo;
- degradación segura: si FTS5 o las tablas nuevas aún no existen, se conservan las experiencias verificadas del ledger;
- permite experiencias, habilidades, documentos, resultados y reglas bajo el mismo contrato.

## Algoritmos

- FTS5 `unicode61` con eliminación de diacríticos;
- similitud léxica Jaccard + cobertura;
- solapamiento de etiquetas;
- decaimiento exponencial de recencia;
- confianza y tasa de éxito;
- deduplicación por fuente;
- compresión por presupuesto de caracteres;
- selector de embeddings para evitar inferencias innecesarias;
- caché exacta persistente con hash FNV-1a, namespace, usuario, TTL y huella de evidencia.

## Embeddings

No son requisito del runtime. Solo se recomiendan cuando:

1. la consulta tiene al menos tres términos informativos;
2. existen al menos cuatro candidatos;
3. la mejor similitud léxica está entre 0.16 y 0.68.

Así se evita gastar una llamada en coincidencias claras, consultas sin candidatos o entradas demasiado cortas.

## Licencias

La implementación no introduce dependencias nuevas. Usa TypeScript, SQLite/FTS5 y la infraestructura ya presente en el proyecto.
