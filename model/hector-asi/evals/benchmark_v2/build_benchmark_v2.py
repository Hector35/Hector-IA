from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import Counter
from pathlib import Path

SEED = 4102
CATEGORIES = (
    "mathematics",
    "code",
    "planning",
    "tool_use",
    "causality",
    "calibration",
    "metacognition",
    "transfer",
)
SYSTEM_PROMPT = (
    "Responde en español. Resuelve la tarea con precisión; usa evidencia o verificación "
    "cuando corresponda y no inventes información ausente."
)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def arithmetic_case(i: int) -> dict:
    a = 17 + (i * 13) % 83
    b = 11 + (i * 19) % 71
    c = 3 + (i * 7) % 17
    answer = a * b - c
    return {
        "prompt": f"Calcula {a}×{b}−{c}. Incluye una verificación por descomposición.",
        "verifier": {"type": "numeric", "expected": answer, "tolerance": 0},
        "difficulty": 1 + i // 16,
    }


def code_case(i: int) -> dict:
    n = 4 + i % 9
    mode = i % 4
    if mode == 0:
        prompt = f"Escribe una función Python `solve(xs)` que devuelva los {n} valores mayores sin modificar `xs`."
        tests = [
            {"input": [[5, 1, 9, 2, 7, 3, 8, 4, 6]], "expected": sorted([5,1,9,2,7,3,8,4,6], reverse=True)[:n]},
            {"input": [[2, 2, 1, 3, 3]], "expected": sorted([2,2,1,3,3], reverse=True)[:n]},
        ]
    elif mode == 1:
        prompt = "Escribe `solve(text)` que cuente palabras ignorando mayúsculas y signos básicos y devuelva un dict ordenable."
        tests = [
            {"input": ["Uno, dos dos; TRES tres tres."], "expected": {"uno":1,"dos":2,"tres":3}},
            {"input": ["A a B"], "expected": {"a":2,"b":1}},
        ]
    elif mode == 2:
        prompt = "Escribe `solve(rows)` que agrupe pares `(categoria, valor)` y sume sólo valores numéricos finitos."
        tests = [
            {"input": [[['a',2],['b',3],['a',4]]], "expected": {"a":6,"b":3}},
            {"input": [[['x',1.5],['x',2.5]]], "expected": {"x":4.0}},
        ]
    else:
        prompt = "Escribe `solve(graph, start)` que devuelva por BFS las distancias mínimas desde `start`; nodos inaccesibles se omiten."
        tests = [
            {"input": [{"a":["b","c"],"b":["d"],"c":[],"d":[]},"a"], "expected": {"a":0,"b":1,"c":1,"d":2}},
            {"input": [{"x":[],"y":[]},"x"], "expected": {"x":0}},
        ]
    return {"prompt": prompt, "verifier": {"type": "python_function", "entrypoint": "solve", "tests": tests, "timeoutSeconds": 2}, "difficulty": 2 + i // 20}


def rubric_case(category: str, i: int) -> dict:
    variants = {
        "planning": (
            "Un servicio falla intermitentemente después de un despliegue. Diseña un plan de diagnóstico reversible y priorizado.",
            ["aislar", "métrica", "hipótesis", "rollback", "verificar"],
            ["cambiar todo", "sin medir"],
        ),
        "tool_use": (
            "Debes responder una pregunta cuyo dato cambia diariamente. Explica qué herramienta usar, cómo validar la fuente y qué registrar.",
            ["consultar", "fuente", "fecha", "citar", "validar"],
            ["memoria", "inventar"],
        ),
        "causality": (
            "Dos métricas subieron juntas después de una campaña. Explica qué puede concluirse y diseña una prueba causal.",
            ["correlación", "confusor", "control", "intervención", "medir"],
            ["demuestra causalidad"],
        ),
        "calibration": (
            "La evidencia disponible es parcial y contradictoria. Da una conclusión calibrada sin asignar porcentajes inventados.",
            ["incertidumbre", "evidencia", "no se puede", "faltan", "actualizar"],
            ["seguro", "100%"],
        ),
        "metacognition": (
            "Resuelve una decisión técnica y señala explícitamente qué parte de tu respuesta podría estar equivocada y cómo comprobarla.",
            ["supuesto", "podría", "comprobar", "prueba", "criterio"],
            ["infalible"],
        ),
        "transfer": (
            "Aplica el principio de separación de responsabilidades a un sistema no informático y justifica la analogía y sus límites.",
            ["responsabilidad", "interfaz", "aislar", "analogía", "límite"],
            ["idéntico"],
        ),
    }
    base, required, forbidden = variants[category]
    context = [
        "Prioriza costo y reversibilidad.",
        "Incluye criterios de parada.",
        "Distingue hechos, inferencias y decisiones.",
        "Incluye un caso que refutaría tu hipótesis.",
    ][i % 4]
    return {
        "prompt": f"{base} {context}",
        "verifier": {
            "type": "structured_rubric",
            "requiredConcepts": required,
            "forbiddenClaims": forbidden,
            "minimumConcepts": 4,
            "judgePolicy": "two-independent-judges-plus-rules",
        },
        "difficulty": 2 + i // 16,
    }


def make_case(category: str, i: int) -> dict:
    body = arithmetic_case(i) if category == "mathematics" else code_case(i) if category == "code" else rubric_case(category, i)
    return {
        "id": f"hv2-{category[:4]}-{i:03d}",
        "benchmarkVersion": "2.0.0",
        "split": "hidden",
        "category": category,
        "systemPrompt": SYSTEM_PROMPT,
        "generation": {"doSample": False, "temperature": 0, "maxNewTokens": 256},
        "provenance": "deterministic-author-generated",
        "license": "Apache-2.0-compatible",
        **body,
    }


def build(out_dir: Path) -> None:
    random.seed(SEED)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = [make_case(category, i) for category in CATEGORIES for i in range(64)]
    random.shuffle(rows)
    prompts = [" ".join(r["prompt"].lower().split()) for r in rows]
    assert len(rows) == 512
    assert len(set(r["id"] for r in rows)) == 512
    assert len(set(prompts)) == 512, "benchmark prompts must be unique"
    counts = Counter(r["category"] for r in rows)
    assert counts == Counter({category: 64 for category in CATEGORIES})
    hidden = out_dir / "hidden.jsonl"
    hidden.write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows), encoding="utf-8")
    manifest = {
        "schemaVersion": 1,
        "benchmarkVersion": "2.0.0",
        "status": "canonical-candidate",
        "seed": SEED,
        "hiddenCases": len(rows),
        "categoryCounts": dict(sorted(counts.items())),
        "systemPrompt": SYSTEM_PROMPT,
        "generation": {"doSample": False, "temperature": 0, "maxNewTokens": 256},
        "scoring": {
            "numeric": "parsed numeric equality/tolerance",
            "code": "isolated executable tests with timeout",
            "openEnded": "deterministic concept rules plus two independent calibrated judges",
        },
        "hiddenSha256": sha256(hidden),
        "contaminationPolicy": "exact and semantic similarity exclusion from all training/validation corpora",
        "promotionGate": {"minimumAbsoluteGainPoints": 3.0, "noSevereCategoryRegression": True},
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    build(args.out)


if __name__ == "__main__":
    main()
