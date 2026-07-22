# Control metacognitivo calibrado

Estado: integrado en el runtime de Trabajo, sin cambios de UI ni dependencias pagadas.

## Problema

La selección anterior dependía de reglas estáticas, feedback agregado y salud del proveedor. No existía una memoria explícita que respondiera: **¿qué estrategia funciona realmente para este usuario y este tipo de tarea, con qué costo y cuánta incertidumbre?**

La confianza declarada por un modelo no se trata como evidencia. El controlador usa únicamente resultados observados: verificación del plan, calidad aceptada, fallback, llamadas, tokens, costo y duración.

## Diseño

Cada ejecución no recuperada de caché registra en D1:

- usuario y tipo de tarea;
- estrategia planeada y ejecutada;
- proveedor, nivel y modo cognitivo;
- probabilidad de éxito predicha;
- éxito observado y verificación;
- calidad, fallback, llamadas avanzadas, tokens, costo y duración;
- acción y justificación del controlador.

No se guardan prompts ni respuestas en `metacognitive_outcomes`.

El perfil de cada estrategia usa una posterior Beta(1,1), límite inferior aproximado al 90%, incertidumbre, Brier score, costo y llamadas promedio. La política es conservadora:

1. **Conservar** una estrategia más barata solo con al menos cinco resultados y límite inferior de éxito suficiente.
2. **Escalar** después de fallos repetidos cuando una estrategia más fuerte posee evidencia superior o, si aún no la hay, subir un escalón de forma determinista.
3. **Verificar** con más rigor cuando el riesgo, la incertidumbre o la probabilidad predicha lo requieren.
4. **Monitorear** cuando faltan datos, sin comprar llamadas de reflexión para fabricar confianza.
5. Nunca degradar una solicitud con razonamiento alto explícito, web o riesgo no bajo hacia Workers AI.

## Recursos técnicos

La implementación es TypeScript + D1 y no necesita librerías externas. El diseño toma principios de:

- calibración de autoevaluación: https://arxiv.org/abs/2207.05221
- calibración de modelos generativos: https://arxiv.org/abs/2012.00955
- reflexión basada en resultados: https://arxiv.org/abs/2303.11366
- refinamiento iterativo: https://arxiv.org/abs/2303.17651
- aprendizaje continuo con errores, verificación y biblioteca de habilidades: https://arxiv.org/abs/2305.16291
- control metacognitivo externo: https://arxiv.org/abs/2604.19809

No se copió código de estos proyectos; se implementó un controlador estadístico propio con primitivas existentes del repositorio.

## Benchmark reproducible

`metacognitiveBenchmark()` cubre:

- conservación de una estrategia barata con historial fuerte;
- escalamiento de una estrategia sobreconfiada con fallos repetidos;
- llamadas avanzadas evitadas;
- reducción de fallos confiados.

Las cifras son pruebas deterministas de política, no métricas de producción. Las métricas reales empiezan a acumularse por usuario después de aplicar la migración `0036_metacognitive_control.sql`.

## Rollback

- El runtime tolera que la tabla no exista: carga perfiles vacíos y conserva la política anterior.
- Retirar la integración de `planned-work.ts` restaura el enrutamiento anterior sin perder respuestas ni experiencias.
- La tabla es aditiva y puede conservarse para auditoría aunque el controlador se desactive.
