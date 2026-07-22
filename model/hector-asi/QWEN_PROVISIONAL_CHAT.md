# Héctor Qwen Base — chat provisional

## Qué es

Esta ruta permite hablar directamente con `Qwen/Qwen3-4B-Instruct-2507`, la base abierta seleccionada para el primer candidato de Héctor ASI.

No es todavía el modelo entrenado de Héctor:

- `customWeights: false`
- no existe adaptador QLoRA promovido
- no existe campeón
- la identidad, memoria e instrucciones provienen del runtime de Héctor OS

## Activación

1. Crear un token de acceso de Hugging Face con el permiso mínimo necesario para Inference Providers.
2. Guardarlo como secreto de Cloudflare Worker, nunca en Git:

```bash
npx wrangler secret put HUGGINGFACE_TOKEN
```

3. Desplegar el Worker.
4. En el chat, iniciar el mensaje con:

```text
Héctor Qwen: hola
```

El runtime quitará la directiva antes de enviar el mensaje al modelo, conservará el historial reciente y marcará la respuesta con:

- proveedor: `huggingface`
- modelo: `Qwen/Qwen3-4B-Instruct-2507`
- runtime: `hector-qwen-base`
- `customWeights: false`

## Política de identidad

- No hay fallback silencioso a OpenAI o Workers AI cuando se solicita Héctor Qwen.
- Si falta el secreto, el endpoint falla explícitamente.
- Solicitudes que requieren web o contienen señales sensibles conservan el enrutamiento seguro existente y muestran el proveedor efectivo.
- El futuro adaptador entrenado se registrará como candidato separado; esta ruta no se renombrará como campeón.

## Configuración reversible

Variables no secretas en `wrangler.jsonc`:

- `HECTOR_QWEN_ENABLED`
- `HECTOR_QWEN_MODEL`
- `HECTOR_QWEN_BASE_URL`
- `HECTOR_QWEN_TIMEOUT_MS`

Para desactivar la ruta sin borrar código:

```text
HECTOR_QWEN_ENABLED=false
```
