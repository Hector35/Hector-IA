## Objetivo
Cerrar el runtime free-first de Héctor OS con cero costo recurrente obligatorio y el mínimo de llamadas avanzadas.

## Cambios
- gobernador que limita razonamiento alto a una inferencia avanzada salvo petición explícita de múltiples soluciones;
- caché exacta verificada, aislada por usuario y con expiración;
- compactación/deduplicación de contexto;
- telemetría D1 de llamadas, tokens, caché y costo evitado;
- benchmark reproducible;
- ADR de recursos gratuitos, límites y licencias.

## Seguridad
- alto riesgo no usa caché ni proveedor gratuito;
- solo respuestas aceptadas y verificadas se almacenan;
- memoria semántica existente sigue exigiendo evidencia verificada;
- fallback conserva el modelo avanzado cuando la capa gratuita falla.

## Validación requerida
TypeScript, Vitest, build, migraciones D1, Worker dry-run y Production Audit.
