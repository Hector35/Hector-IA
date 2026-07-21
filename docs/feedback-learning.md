# Aprendizaje controlado por feedback

Héctor OS aprende preferencias operativas sin reentrenar pesos ni editar código automáticamente.

## Señales aceptadas

- Valoración positiva o negativa de una respuesta concreta.
- Razones limitadas: incorrecta, incompleta, no personalizada, demasiado larga, demasiado corta, insegura u otra.
- Frases naturales ancladas a la respuesta anterior, por ejemplo: «esa respuesta me sirvió» o «tu respuesta anterior estuvo mal, corrígela».

## Cambios permitidos

- Escalar una clase de tarea a razonamiento profundo después de evidencia mínima.
- Evitar Workers AI para una clase de tarea cuando acumula baja utilidad.
- Añadir instrucciones de estilo derivadas de razones repetidas.

## Límites de seguridad

- Nunca reduce el nivel de razonamiento por feedback.
- No cambia pesos, secretos, código, permisos ni infraestructura.
- No almacena texto adicional de la conversación en la tabla de feedback.
- Usa una ventana móvil de 60 días y mínimos de muestra para evitar reaccionar a un evento aislado.
- Cada valoración es reversible mediante una nueva valoración sobre el mismo mensaje.
