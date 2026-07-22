# Free-first call governor

El runtime aplica esta jerarquía antes de una inferencia avanzada:

1. procedimiento determinista verificado: 0 llamadas avanzadas;
2. experiencia parcial reutilizable: 1 llamada para la parte nueva;
3. tarea nueva simple: 1 llamada;
4. tarea nueva compleja, extensa y de alto razonamiento: conserva hasta 3 pasadas.

## Benchmark reproducible

El test `worker/lib/call-governor.test.ts` compara cuatro escenarios con un baseline de tres pasadas:

| Escenario | Antes | Después | Ahorro |
| --- | ---: | ---: | ---: |
| Conocido y determinista | 3 | 0 | 3 |
| Parcialmente conocido | 3 | 1 | 2 |
| Nuevo simple | 3 | 1 | 2 |
| Nuevo complejo | 3 | 3 | 0 |

Además verifica deduplicación de inferencias idénticas en vuelo, bloqueo al exceder presupuesto y preservación del escalamiento para tareas realmente complejas. No introduce proveedores pagados ni dependencias nuevas.
