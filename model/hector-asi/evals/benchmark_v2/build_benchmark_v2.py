from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import Counter
from pathlib import Path

SEED = 4102
VERSION = "2.1.0"
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
    "Responde en español. Resuelve la tarea con precisión; usa evidencia o "
    "verificación cuando corresponda y no inventes información ausente."
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mathematics(index: int) -> dict:
    a = 17 + (index * 13) % 83
    b = 11 + (index * 19) % 71
    c = 3 + (index * 7) % 17
    return {
        "prompt": f"Calcula {a}×{b}−{c}. Incluye una verificación por descomposición. Caso {index + 1}.",
        "verifier": {"type": "numeric", "expected": a * b - c, "tolerance": 0},
        "difficulty": 1 + index // 16,
    }


def code(index: int) -> dict:
    n = 4 + index % 5
    variant = index % 4
    suffix = f" Variante controlada {index + 1}."
    if variant == 0:
        prompt = f"Escribe una función Python `solve(xs)` que devuelva los {n} valores mayores sin modificar `xs`." + suffix
        tests = [
            {"input": [[5, 1, 9, 2, 7, 3, 8, 4, 6]], "expected": sorted([5, 1, 9, 2, 7, 3, 8, 4, 6], reverse=True)[:n]},
            {"input": [[2, 2, 1, 3, 3]], "expected": sorted([2, 2, 1, 3, 3], reverse=True)[:n]},
        ]
    elif variant == 1:
        prompt = "Escribe `solve(text)` que cuente palabras ignorando mayúsculas y signos básicos y devuelva un dict." + suffix
        tests = [
            {"input": ["Uno, dos dos; TRES tres tres."], "expected": {"uno": 1, "dos": 2, "tres": 3}},
            {"input": ["A a B"], "expected": {"a": 2, "b": 1}},
        ]
    elif variant == 2:
        prompt = "Escribe `solve(rows)` que agrupe pares `(categoria, valor)` y sume sólo valores numéricos finitos." + suffix
        tests = [
            {"input": [[("a", 2), ("b", 3), ("a", 4)]], "expected": {"a": 6, "b": 3}},
            {"input": [[("x", 1.5), ("x", 2.5)]], "expected": {"x": 4.0}},
        ]
    else:
        prompt = "Escribe `solve(graph, start)` que devuelva por BFS las distancias mínimas; omite nodos inaccesibles." + suffix
        tests = [
            {"input": [{"a": ["b", "c"], "b": ["d"], "c": [], "d": []}, "a"], "expected": {"a": 0, "b": 1, "c": 1, "d": 2}},
            {"input": [{"x": [], "y": []}, "x"], "expected": {"x": 0}},
        ]
    return {
        "prompt": prompt,
        "verifier": {"type": "python_function", "entrypoint": "solve", "tests": tests, "timeoutSeconds": 2},
        "difficulty": 2 + index // 20,
    }


def rubric(category: str, index: int) -> dict:
    definitions = {
        "planning": ("Un servicio falla intermitentemente después de un despliegue. Diseña un plan reversible y priorizado.", ["aislar", "métrica", "hipótesis", "rollback", "verificar"], ["cambiar todo", "sin medir"]),
        "tool_use": ("Debes responder una pregunta cuyo dato cambia diariamente. Explica herramienta, validación y registro.", ["consultar", "fuente", "fecha", "citar", "validar"], ["memoria", "inventar"]),
        "causality": ("Dos métricas subieron juntas después de una campaña. Explica qué concluir y diseña una prueba causal.", ["correlación", "confusor", "control", "intervención", "medir"], ["demuestra causalidad"]),
        "calibration": ("La evidencia es parcial y contradictoria. Da una conclusión calibrada sin porcentajes inventados.", ["incertidumbre", "evidencia", "no se puede", "faltan", "actualizar"], ["seguro", "100%"]),
        "metacognition": ("Resuelve una decisión técnica y señala qué podría estar equivocado y cómo comprobarlo.", ["supuesto", "podría", "comprobar", "prueba", "criterio"], ["infalible"]),
        "transfer": ("Aplica separación de responsabilidades a un sistema no informático y justifica analogía y límites.", ["responsabilidad", "interfaz", "aislar", "analogía", "límite"], ["idéntico"]),
    }
    base, required, forbidden = definitions[category]
    contexts = (
        "Prioriza costo y reversibilidad.",
        "Incluye criterios de parada.",
        "Distingue hechos, inferencias y decisiones.",
        "Incluye un caso que refutaría tu hipótesis.",
    )
    return {
        "prompt": f"{base} {contexts[index % 4]} Escenario independiente {index + 1}.",
        "verifier": {
            "type": "structured_rubric",
            "requiredConcepts": required,
            "forbiddenClaims": forbidden,
            "minimumConcepts": 4,
            "judgePolicy": "two-independent-judges-plus-rules",
        },
        "difficulty": 2 + index // 16,
    }


def case(category: str, index: int) -> dict:
    body = mathematics(index) if category == "mathematics" else code(index) if category == "code" else rubric(category, index)
    return {
        "id": f"hv2-{category[:4]}-{index:03d}",
        "benchmarkVersion": VERSION,
        "split": "hidden",
        "category": category,
        "systemPrompt": SYSTEM_PROMPT,
        "generation": {"doSample": False, "temperature": 0, "maxNewTokens": 256},
        "provenance": "deterministic-author-generated",
        "license": "Apache-2.0-compatible",
        **body,
    }


def build(output: Path) -> None:
    random.seed(SEED)
    output.mkdir(parents=True, exist_ok=True)
    rows = [case(category, index) for category in CATEGORIES for index in range(64)]
    random.shuffle(rows)
    prompts = [" ".join(row["prompt"].lower().split()) for row in rows]
    counts = Counter(row["category"] for row in rows)
    assert len(rows) == len({row["id"] for row in rows}) == len(set(prompts)) == 512
    assert counts == Counter({category: 64 for category in CATEGORIES})
    hidden = output / "hidden.jsonl"
    hidden.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8")
    manifest = {
        "schemaVersion": 1,
        "benchmarkVersion": VERSION,
        "status": "canonical-candidate",
        "seed": SEED,
        "hiddenCases": 512,
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
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    build(parser.parse_args().out)


if __name__ == "__main__":
    main()
