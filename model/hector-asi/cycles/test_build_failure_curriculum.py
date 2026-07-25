import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("build_failure_curriculum.py")
SPEC = importlib.util.spec_from_file_location("build_failure_curriculum", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FailureCurriculumTests(unittest.TestCase):
    def test_allocation_is_exact_and_prioritizes_weakness(self):
        scores = {
            "planning": 0.05,
            "calibration": 0.10,
            "code": 0.50,
            "causality": 0.75,
        }
        rows = MODULE.allocate_examples(scores, 101)
        self.assertEqual(sum(row.target_examples for row in rows), 101)
        self.assertEqual(rows[0].capability, "planning")
        self.assertGreater(rows[0].target_examples, rows[-1].target_examples)

    def test_curriculum_remains_fail_closed(self):
        gates = {
            "model": "hector-v41",
            "benchmarkVersion": "2.1.0",
            "scorePercent": 5.66,
            "byCapability": {"planning": 0.05, "code": 0.20},
        }
        result = MODULE.build_curriculum(gates, 64)
        self.assertFalse(result["trainingAuthorized"])
        self.assertEqual(result["totalTargetExamples"], 64)
        self.assertEqual(result["priorityCapabilities"][0], "planning")

    def test_invalid_inputs_fail(self):
        with self.assertRaises(ValueError):
            MODULE.allocate_examples({}, 10)
        with self.assertRaises(ValueError):
            MODULE.allocate_examples({"planning": 0.2}, 0)


if __name__ == "__main__":
    unittest.main()
