# Hector ASI cycle 3 handoff — cognitive-plan-v1

## Estado de partida

- `main`: `02ac5fd9bbabaeb0252922ece89527c09dd30389`
- base open-weight registrada: `Qwen/Qwen3-4B-Instruct-2507`, Apache-2.0
- checkpoint entrenado: ninguno
- GPU disponible: no confirmada
- dataset SFT existente: semilla insuficiente para una mejora defendible de pesos
- trabajo concurrente observado: PR #576 sobre benchmark y datos metacognitivos; este candidato evita ese frente

## Debilidad elegida

Planificación jerárquica verificable bajo restricciones: evitar conflictos, fijar baseline, usar validación progresiva, manejar riesgo y producir handoff reutilizable.

## Dos enfoques baratos explorados

1. `generic-linear`: analizar → implementar → probar → entregar.
2. `constraint-aware-dag`: dependencias explícitas, detección de archivos ocupados, baseline obligatorio, intervención mínima, validación progresiva, verificación independiente para alto riesgo y entrega reusable.

El enfoque 1 queda explícitamente como baseline descartado. El enfoque 2 continúa como candidato porque cubre todos los gates del benchmark de contrato, mientras el baseline omite dependencias, conflicto, rollback, parada temprana y control de llamadas deterministas.

## Artefactos

- candidato: `model/hector-asi/candidates/cognitive-plan-v1.mjs`
- benchmark: `model/hector-asi/evals/cognitive-planning-v1.jsonl`
- runner: `model/hector-asi/evals/run_cognitive_planner_benchmark.mjs`
- pruebas: `tests/hector-asi-cognitive-planner.test.mjs`
- manifiesto: `model/hector-asi/experiments/cognitive-plan-v1.json`

## Comandos exactos

```bash
npm run model:cognitive-benchmark
npx vitest run tests/hector-asi-cognitive-planner.test.mjs
npm test
npm run typecheck
npm run build
```

## Métricas preliminares

El benchmark de cinco casos es determinista y mide gates de planificación, no inteligencia general. La función de puntuación evalúa ocho controles: baseline, dependencias, conflicto, validación progresiva, rollback, handoff, cero llamadas avanzadas en trabajo determinista y protección de alto riesgo.

- costo de API del benchmark: 0
- entrenamiento de pesos: no ejecutado
- compute: CPU/Node.js
- candidato esperado por contrato: 8/8 gates en los casos aplicables
- baseline genérico: menos de 4/8 gates en casos con conflicto

Estas cifras deben ser confirmadas por CI y por el ciclo 5; no constituyen promoción.

## Acelerador reusable

`comparePlanners` permite comparar cualquier planificador nuevo contra el baseline con el mismo conjunto de gates. El runner genera un informe JSON y evita reconstruir manualmente la evaluación en ciclos posteriores.

## Riesgos y límites

- benchmark pequeño y visible; no es un test oculto ni prueba de transferencia amplia;
- el candidato todavía no está conectado al runtime principal;
- no hay latencia medida por CI;
- no modifica pesos ni produce un checkpoint;
- el integrador debe revisar compatibilidad con el planificador existente antes de enrutar tráfico real.

## Instrucciones para ciclo 5

1. Ejecutar benchmark y pruebas focalizadas.
2. Revisar el PR concurrente #576 y evitar mezclar sus datos metacognitivos con este benchmark cognitivo.
3. Probar el candidato contra casos ocultos adicionales: dependencias múltiples, ciclo de dependencias, restricciones contradictorias y tareas parcialmente deterministas.
4. Medir latencia y regresiones.
5. Decidir entre integrar como planificador previo, conservar como especialista o descartar.
6. No promover como campeón de modelo; registrar como candidato de runtime en el árbol evolutivo.
