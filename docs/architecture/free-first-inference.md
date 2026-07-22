# Inferencia free-first

Estado: integrada en el runtime del Worker, sin cambios visuales.

## Escalones

| Escalón | Capacidades | Costo obligatorio | Límite | Licencia / términos | Estado |
|---|---|---:|---|---|---|
| `hector-rules-v1` | clasificación, extracción, routing y validación JSON | $0 | CPU del Worker | código propio | activo, 0 llamadas |
| `@cf/ibm-granite/granite-4.0-h-micro` | resumen y utilidades estructuradas | $0 dentro del free tier | timeout 8 s, 360 tokens | Apache-2.0 | activo |
| `@cf/meta/llama-3.2-3b-instruct` | conversación breve general | $0 dentro del free tier | timeout 10 s, 900 tokens | Meta Llama Community | activo |
| OpenAI configurado | web, tareas sensibles, técnicas o profundas y fallback | variable | una llamada tras fallo gratuito cuando basta | servicio externo | fallback |

Cloudflare Workers AI ofrece una asignación gratuita diaria de Neurons. La política usa primero reglas locales, luego Workers AI y solo escala si la capacidad, riesgo, salud o calidad lo requieren.

Fuentes oficiales verificadas el 22 de julio de 2026:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/
- https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/
- https://huggingface.co/ibm-granite/granite-4.0-h-micro

## Seguridad y rollback

- Web, salud, finanzas, secretos, legal y tareas técnicas/complejas conservan OpenAI.
- Un timeout, respuesta vacía o fallo de Workers AI activa el fallback existente.
- `CLOUDFLARE_AI_ENABLED=false` desactiva los modelos gratuitos, pero mantiene las reglas locales.
- Los modelos y timeout se cambian mediante variables, sin migraciones.
- WebGPU/WASM no se fuerza en iPhone por costo de descarga, memoria y soporte variable; queda como opción futura medida por dispositivo.
