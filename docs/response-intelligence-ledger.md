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

## Enrutamiento adaptativo

Antes de responder, Héctor OS consulta las valoraciones de los últimos 60 días para la misma clase de tarea:

- exige al menos cinco respuestas no profundas antes de elevar esa categoría a razonamiento profundo;
- exige al menos cuatro respuestas de Workers AI antes de evitar ese proveedor;
- usa una tasa suavizada para que una sola valoración no cambie la política;
- incorpora hasta cuatro correcciones explícitas recientes como reglas de respuesta;
- nunca reduce el nivel de razonamiento ni sustituye reglas de seguridad o autoconocimiento profundo.

La adaptación queda visible en `model_reason`, `provider_reason`, la metadata de uso y la respuesta del endpoint de feedback.

## Privacidad

Las rutas requieren sesión autenticada y filtran siempre por `user_id`. Las trazas no contienen cadenas de razonamiento privadas. Solo registran metadatos, contexto suministrado y evidencia observable de ejecución.

## Despliegue

La adaptación reutiliza `migrations/0025_response_intelligence.sql`; no necesita una tabla paralela ni una migración adicional.
