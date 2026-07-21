# Enrutamiento adaptativo por feedback

Héctor OS usa el libro mayor de respuestas para mejorar decisiones futuras sin entrenar pesos ni aceptar cambios por una sola valoración.

## Evidencia utilizada

La política consulta `response_feedback` unido a `response_traces`, siempre limitado al propietario y a la misma categoría de tarea. La ventana es de 60 días y se consideran como máximo 60 muestras recientes.

## Cambios permitidos

La evidencia solo puede:

1. Escalar una categoría no profunda al nivel profundo cuando existen al menos cinco muestras no profundas y la tasa negativa suavizada alcanza 50 %.
2. Evitar Workers AI para una categoría cuando existen al menos cuatro muestras de ese proveedor y la tasa negativa suavizada alcanza 50 %.
3. Incorporar hasta cuatro correcciones explícitas, deduplicadas y acotadas, como instrucciones futuras para esa categoría.

La política nunca reduce el nivel de razonamiento, nunca habilita un proveedor más barato por feedback y no modifica las reglas de contenido sensible, búsqueda web o complejidad técnica.

## Estabilidad

Las tasas usan suavizado de Laplace: `(negativas + 1) / (muestras + 2)`. Esto evita interpretar una muestra pequeña como certeza. Las respuestas profundas no se usan para exigir una profundidad inexistente superior.

## Privacidad y auditoría

No se guarda cadena de pensamiento. Cada respuesta registra el perfil adaptativo aplicado dentro de su traza: muestras, tasas, escalamiento, proveedor evitado, guías y motivo. Después de marcar una respuesta como útil o corregirla, la API devuelve inmediatamente el nuevo perfil calculado.

## Reversibilidad

El comportamiento depende de una ventana móvil. Conforme las valoraciones antiguas salen de la ventana o nuevas respuestas útiles cambian las tasas, la adaptación puede desactivarse automáticamente. El usuario también puede corregir o sustituir valoraciones existentes mediante el mismo registro único por traza.
