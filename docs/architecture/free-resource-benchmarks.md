# Gates de adopción free-first

Una integración gratuita no se activa por existir. Debe superar estos gates:

1. **Exactitud:** no reducir la tasa de éxito respecto de la línea base.
2. **Costo:** evitar al menos una llamada avanzada en el escenario objetivo.
3. **Latencia:** no añadir más de 500 ms en reglas/SQL ni más de 2 s en inferencia local interactiva, salvo carga inicial explícita.
4. **Memoria:** no provocar cierre de la PWA en iPhone de gama objetivo; modelos locales se cargan bajo demanda y se descargan al terminar.
5. **Privacidad:** datos sensibles permanecen en reglas/D1 o ejecución local según política.
6. **Licencia:** runtime y modelo deben estar en allow-list versionada.
7. **Fallback:** cuota agotada, WebGPU ausente o modelo corrupto deben volver al escalón siguiente sin respuesta inventada.
8. **Evidencia:** todo resultado reutilizable debe tener prueba verificable.

## Casos mínimos

- clasificación conocida: 0 llamadas avanzadas;
- extracción estructurada conocida: 0 llamadas avanzadas;
- recuperación de procedimiento conocido: 0 llamadas avanzadas;
- tarea parcialmente conocida: máximo 1 llamada avanzada con contexto reducido;
- tarea nueva: máximo 1 llamada avanzada inicial, salvo verificación explícitamente justificada;
- acción de alto riesgo: nunca se automatiza por ahorro de costo.
