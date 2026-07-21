# Presupuesto cognitivo predictivo

Héctor OS puede estimar el costo marginal de una respuesta antes de ejecutarla mediante:

`POST /api/intelligence/budget/forecast`

La ruta requiere autenticación y no persiste el texto enviado para el pronóstico.

## Entrada

- `prompt`: texto cuya longitud se usa para estimar tokens;
- `task`: categoría para aplicar protección de tareas sensibles;
- `tier`: `fast`, `balanced` o `deep`;
- `contextChars`: tamaño aproximado del contexto dinámico;
- `passes`: una ejecución simple, dos candidatos o ensamble completo de tres pasadas;
- `explicitHigh`: preserva razonamiento alto cuando fue solicitado explícitamente;
- `model`: identificador opcional; si se omite se usa el modelo configurado para el nivel.

## Resultado

El pronóstico devuelve:

- tokens de entrada y salida estimados;
- costo estimado por el modelo efectivo;
- saldo diario y mensual después de responder;
- si la respuesta cabe dentro de ambos límites;
- decisión `allow`, `allow-protected` o `degrade`;
- indicador de tarifa conocida;
- aviso de que el costo real puede variar por herramientas, caché y longitud final.

## Política

En modo `observe`, la estimación nunca cambia el router.

En modo `protect`, una tarea ordinaria puede degradarse preventivamente cuando el costo proyectado rebasaría el saldo disponible, incluso si el gasto acumulado todavía no alcanzó el 100 %.

Las tareas sensibles y las solicitudes explícitas de razonamiento alto siguen protegidas contra degradación automática.

## Limitaciones

La proyección es conservadora y determinista. No sustituye el uso real registrado posteriormente en `api_usage`. No intenta predecir exactamente la longitud final ni las llamadas adicionales producidas por búsqueda web o fallback de proveedor.
