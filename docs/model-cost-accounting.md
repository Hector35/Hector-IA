# Contabilidad de costos por modelo

Héctor OS calcula el costo estimado de cada respuesta usando el identificador efectivo registrado por el proveedor. La tabla está versionada como `openai-pricing-2026-07`.

## GPT-5.6

| Familia | Entrada / millón | Entrada en caché / millón | Salida / millón |
| --- | ---: | ---: | ---: |
| GPT-5.6 Sol | USD 5.00 | USD 0.50 | USD 30.00 |
| GPT-5.6 Terra | USD 2.50 | USD 0.25 | USD 15.00 |
| GPT-5.6 Luna | USD 1.00 | USD 0.10 | USD 6.00 |

Las escrituras de caché se contabilizan como 1.25 veces la tarifa normal de entrada. Cuando una solicitud supera 272 000 tokens de entrada, la entrada se multiplica por 2 y la salida por 1.5.

## Metadatos persistidos

Cada registro nuevo de `api_usage` puede incluir:

- `pricingModel`: familia usada para calcular;
- `pricingKnown`: si la tarifa pertenece a la tabla versionada;
- `pricingSource`: versión de la tabla;
- `cacheWriteTokens`: tokens escritos en caché;
- `longContext`: si se aplicó el recargo de contexto largo.

## Modelos desconocidos y Workers AI

Un modelo no reconocido nunca se presenta como precio oficial. Se marca `pricingKnown=false` y se utiliza temporalmente la estimación heredada hasta que exista una tarifa verificada.

Héctor OS no asigna una tarifa inventada al modelo rápido de Workers AI. Su registro conserva el identificador real y marca el costo como aproximado mientras no exista una regla específica verificada en la tabla local.

## Alcance histórico

La corrección se aplica a registros nuevos. Los registros anteriores conservan el importe almacenado originalmente para no reescribir evidencia histórica sin los datos completos de uso y modelo efectivo.
