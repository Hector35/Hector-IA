# Libro mayor de respuestas de Héctor OS

## Propósito

Cada respuesta contextual de IA registra evidencia operativa suficiente para auditar cómo fue producida sin almacenar razonamiento privado:

- proveedor solicitado y proveedor efectivo;
- modelo, nivel de ruta y esfuerzo de razonamiento;
- motivo de enrutamiento y motivo del proveedor;
- uso de web, fallback, latencia, costo y control de calidad;
- memorias exactas incorporadas al contexto;
- conteos del contexto dinámico;
- siguiente acción determinista recomendada.

## Retroalimentación

El propietario puede marcar una respuesta como útil o corregirla. Una corrección explícita se guarda como memoria de tipo `correction`, importancia 5 y fuente `response-feedback`. El embedding se genera posteriormente mediante el backfill semántico normal.

## Privacidad

Las rutas requieren sesión autenticada y filtran siempre por `user_id`. Las trazas no contienen cadenas de razonamiento privadas. Solo registran metadatos, contexto suministrado y evidencia observable de ejecución.

## Despliegue

Aplicar `migrations/0025_response_intelligence.sql` antes de habilitar el panel en producción.
