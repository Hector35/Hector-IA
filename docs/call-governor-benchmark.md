# Free-first call governor

El runtime aplica esta jerarquía antes de una inferencia avanzada:

1. procedimiento determinista verificado: 0 llamadas avanzadas;
2. respuesta exacta estable en caché: 0 llamadas nuevas;
3. inferencia idéntica ya en vuelo: se comparte la misma promesa;
4. experiencia parcial reutilizable: 1 llamada para la parte nueva;
5. tarea nueva simple: 1 llamada;
6. tarea nueva compleja, extensa y de alto razonamiento: conserva hasta 3 pasadas.

## Seguridad de la caché

La caché exacta es oportunista y vive en el isolate del Worker. La clave usa SHA-256 e incluye usuario, plan, instrucción y contexto. Solo se activa para tareas de bajo riesgo, sin web y sin términos volátiles como `hoy`, `actual`, `precio` o `clima`. Solo guarda respuestas aceptadas, sin búsqueda web y sin fallback.

No se añadió GPTCache como dependencia: su patrón de caché semántica es útil, pero el proyecto es Python y su última versión publicada es de 2024. Para este Worker se prefirió una implementación TypeScript sin dependencias, exacta y conservadora. La API Cache de Cloudflare sigue siendo una opción posterior para respuestas HTTP cacheables, pero la primera etapa evita persistir prompts o respuestas sensibles en el edge global.

Fuentes técnicas revisadas:

- Cloudflare Cache API: https://developers.cloudflare.com/workers/runtime-apis/cache/
- Workers AI pricing/free allocation: https://developers.cloudflare.com/workers-ai/platform/pricing/
- GPTCache (MIT, patrón de caché semántica): https://github.com/zilliztech/GPTCache

## Benchmark reproducible

El test `worker/lib/call-governor.test.ts` compara cuatro escenarios con un baseline de tres pasadas:

| Escenario | Antes | Después | Ahorro |
| --- | ---: | ---: | ---: |
| Conocido y determinista | 3 | 0 | 3 |
| Parcialmente conocido | 3 | 1 | 2 |
| Nuevo simple | 3 | 1 | 2 |
| Nuevo complejo | 3 | 3 | 0 |
| Repetición exacta estable | 1 | 0 | 1 |
| Solicitudes idénticas concurrentes | N | 1 | N-1 |

Además verifica deduplicación entre ejecuciones distintas, caché exacta, bloqueo al exceder presupuesto y preservación del escalamiento para tareas realmente complejas.

## Métricas persistentes

La migración `0034_call_governor_events.sql` registra por usuario:

- llamadas avanzadas ejecutadas;
- llamadas deduplicadas;
- hits de caché;
- llamadas bloqueadas;
- pasadas solicitadas y ejecutadas;
- llamadas estimadas evitadas;
- justificaciones de la decisión.

El registro es de solo metadatos: no almacena el prompt ni la respuesta. No introduce proveedores pagados ni dependencias nuevas.
