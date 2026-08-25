"""Tests for deterministic weekly-timesheet allocation validation."""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory


VALIDATOR_PATH = (
    Path(__file__).parent.parent / "scripts" / "validate_timesheet.py"
)
SPEC = importlib.util.spec_from_file_location("validate_timesheet", VALIDATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load validator from {VALIDATOR_PATH}")
validator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = validator
SPEC.loader.exec_module(validator)


def run_validator(
    evidence: dict[str, object],
    allocation: dict[str, object] | str,
    extra_arguments: list[str] | None = None,
) -> tuple[int, str, str]:
    with TemporaryDirectory() as directory:
        evidence_path = Path(directory) / "evidence.json"
        allocation_path = Path(directory) / "allocation.json"
        evidence_path.write_text(json.dumps(evidence), encoding="utf-8")
        allocation_text = (
            allocation if isinstance(allocation, str) else json.dumps(allocation)
        )
        allocation_path.write_text(allocation_text, encoding="utf-8")
        stdout = StringIO()
        stderr = StringIO()
        arguments = [
            "--evidence",
            str(evidence_path),
            "--allocation",
            str(allocation_path),
        ]
        if extra_arguments is not None:
            arguments.extend(extra_arguments)
        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = validator.main(arguments)
    return exit_code, stdout.getvalue(), stderr.getvalue()


class TimesheetValidatorCliTests(unittest.TestCase):
    def evidence(self) -> dict[str, object]:
        return {
            "calendar_days": [
                {"date": "2024-01-01", "has_activity": False},
                {"date": "2024-01-02", "has_activity": True},
            ],
            "activities": [
                {"date": "2024-01-02", "ticket": "ABC-123"},
                {"date": "2024-01-02", "ticket": "UNASSIGNED"},
            ],
        }

    def allocation(self) -> dict[str, object]:
        return {
            "entries": [
                {"date": "2024-01-01", "ticket": "NO_ACTIVITY", "hours": "0"},
                {"date": "2024-01-02", "ticket": "ABC-123", "hours": "5"},
                {
                    "date": "2024-01-02",
                    "ticket": "UNASSIGNED",
                    "hours": "3",
                },
            ],
            "ticket_totals": [
                {"ticket": "ABC-123", "hours": "5"},
                {"ticket": "UNASSIGNED", "hours": "3"},
            ],
        }

    def test_accepts_a_complete_valid_allocation(self) -> None:
        exit_code, stdout, stderr = run_validator(
            self.evidence(), self.allocation()
        )

        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(stdout, "Timesheet allocation is valid.\n")
        self.assertEqual(stderr, "")

    def test_rejects_a_self_consistent_policy_that_breaks_the_default(self) -> None:
        allocation = self.allocation()
        entries = allocation["entries"]
        ticket_totals = allocation["ticket_totals"]
        assert isinstance(entries, list)
        assert isinstance(ticket_totals, list)
        entries[1]["hours"] = "4"
        ticket_totals[0]["hours"] = "4"

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("2024-01-02 hours must total 8", stderr)

    def test_rejects_policy_fields_inside_the_allocation(self) -> None:
        allocation = self.allocation()
        allocation["increment"] = "0.25"
        allocation["daily_targets"] = {"2024-01-02": "7"}

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("pass policy to the validator", stderr)

    def test_rejects_an_active_day_that_does_not_reach_its_target(self) -> None:
        allocation = self.allocation()
        entries = allocation["entries"]
        assert isinstance(entries, list)
        entries[1]["hours"] = "4"

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("2024-01-02 hours must total 8", stderr)

    def test_rejects_hours_that_are_not_multiples_of_the_increment(self) -> None:
        allocation = self.allocation()
        entries = allocation["entries"]
        assert isinstance(entries, list)
        entries[1]["hours"] = "4.75"
        entries[2]["hours"] = "3.25"

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("hours must use the 0.5 increment", stderr)

    def test_preserves_exact_json_decimal_values(self) -> None:
        evidence = {
            "calendar_days": [{"date": "2024-01-02", "has_activity": True}],
            "activities": [{"date": "2024-01-02", "ticket": "ABC-123"}],
        }
        allocation = """{
            "entries": [
                {
                    "date": "2024-01-02",
                    "ticket": "ABC-123",
                    "hours": 0.100000000000000005
                }
            ],
            "ticket_totals": [
                {"ticket": "ABC-123", "hours": 0.100000000000000005}
            ]
        }"""

        exit_code, stdout, stderr = run_validator(
            evidence,
            allocation,
            ["--increment", "0.1", "--target-hours", "0.1"],
        )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("hours must use the 0.1 increment", stderr)

    def test_uses_exact_arithmetic_beyond_decimal_context_precision(self) -> None:
        evidence = {
            "calendar_days": [{"date": "2024-01-02", "has_activity": True}],
            "activities": [
                {"date": "2024-01-02", "ticket": "ABC-123"},
                {"date": "2024-01-02", "ticket": "DEF-456"},
            ],
        }
        allocation = {
            "entries": [
                {
                    "date": "2024-01-02",
                    "ticket": "ABC-123",
                    "hours": "9.999999999999999999999999999",
                },
                {
                    "date": "2024-01-02",
                    "ticket": "DEF-456",
                    "hours": "2e-27",
                },
            ],
            "ticket_totals": [
                {"ticket": "ABC-123", "hours": "9.999999999999999999999999999"},
                {"ticket": "DEF-456", "hours": "2e-27"},
            ],
        }

        exit_code, stdout, stderr = run_validator(
            evidence,
            allocation,
            ["--increment", "1e-27", "--target-hours", "10"],
        )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("2024-01-02 hours must total 10", stderr)

    def test_rejects_non_finite_decimal_values_without_a_traceback(self) -> None:
        evidence = {
            "calendar_days": [{"date": "2024-01-01", "has_activity": False}],
            "activities": [],
        }
        for increment in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(increment=increment):
                allocation = {
                    "entries": [
                        {
                            "date": "2024-01-01",
                            "ticket": "NO_ACTIVITY",
                            "hours": "0",
                        }
                    ],
                    "ticket_totals": [],
                }

                exit_code, stdout, stderr = run_validator(
                    evidence, allocation, [f"--increment={increment}"]
                )

                self.assertEqual(exit_code, 1)
                self.assertEqual(stdout, "")
                self.assertIn("must be a finite decimal number", stderr)
                self.assertNotIn("Traceback", stderr)

    def test_requires_a_zero_hour_no_activity_row_for_inactive_days(self) -> None:
        allocation = self.allocation()
        entries = allocation["entries"]
        assert isinstance(entries, list)
        entries[0]["ticket"] = "ABC-123"

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("2024-01-01 must contain only NO_ACTIVITY at 0 hours", stderr)

    def test_keeps_unassigned_evidence_as_a_separate_entry(self) -> None:
        allocation = self.allocation()
        entries = allocation["entries"]
        assert isinstance(entries, list)
        entries[1]["hours"] = "8"
        entries.pop(2)

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("2024-01-02 tickets must match evidence", stderr)

    def test_excludes_no_activity_from_ticket_totals(self) -> None:
        allocation = self.allocation()
        ticket_totals = allocation["ticket_totals"]
        assert isinstance(ticket_totals, list)
        ticket_totals.append({"ticket": "NO_ACTIVITY", "hours": "0"})

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("ticket_totals must exclude NO_ACTIVITY", stderr)

    def test_accepts_explicit_date_target_and_increment_overrides(self) -> None:
        allocation = self.allocation()
        entries = allocation["entries"]
        ticket_totals = allocation["ticket_totals"]
        assert isinstance(entries, list)
        assert isinstance(ticket_totals, list)
        entries[1]["hours"] = "4.75"
        entries[2]["hours"] = "2.25"
        ticket_totals[0]["hours"] = "4.75"
        ticket_totals[1]["hours"] = "2.25"

        exit_code, stdout, stderr = run_validator(
            self.evidence(),
            allocation,
            ["--increment", "0.25", "--target", "2024-01-02=7"],
        )

        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(stdout, "Timesheet allocation is valid.\n")
        self.assertEqual(stderr, "")

    def test_rejects_entries_outside_the_evidence_window(self) -> None:
        allocation = self.allocation()
        entries = allocation["entries"]
        assert isinstance(entries, list)
        entries.append(
            {"date": "2024-01-03", "ticket": "NO_ACTIVITY", "hours": "0"}
        )

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("entries must stay inside the evidence window", stderr)

    def test_requires_ticket_totals_to_equal_the_allocated_entries(self) -> None:
        allocation = self.allocation()
        ticket_totals = allocation["ticket_totals"]
        assert isinstance(ticket_totals, list)
        ticket_totals[0]["hours"] = "4"

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("ticket_totals must equal", stderr)

    def test_rejects_non_positive_hours_for_active_entries(self) -> None:
        allocation = self.allocation()
        entries = allocation["entries"]
        ticket_totals = allocation["ticket_totals"]
        assert isinstance(entries, list)
        assert isinstance(ticket_totals, list)
        entries[1]["hours"] = "-1"
        entries[2]["hours"] = "9"
        ticket_totals[0]["hours"] = "-1"
        ticket_totals[1]["hours"] = "9"

        exit_code, stdout, stderr = run_validator(self.evidence(), allocation)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("active entries must be greater than zero", stderr)


if __name__ == "__main__":
    unittest.main()
