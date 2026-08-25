#!/usr/bin/env python3
"""Validate a model-produced weekly-timesheet allocation against evidence."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from pathlib import Path
from typing import Sequence


def parse_args(arguments: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate weekly-timesheet allocation invariants."
    )
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--allocation", required=True, type=Path)
    parser.add_argument("--increment", default="0.5")
    parser.add_argument("--target-hours", default="8")
    parser.add_argument(
        "--target",
        action="append",
        default=[],
        metavar="DATE=HOURS",
        help="Override target hours for one active date; may be repeated",
    )
    return parser.parse_args(arguments)


def load_json(path: Path) -> object:
    try:
        return json.loads(
            path.read_text(encoding="utf-8"),
            parse_float=Decimal,
        )
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read {path}: {error}") from error


def require_object(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


def decimal_value(value: object, label: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (str, int, Decimal)):
        raise ValueError(f"{label} must be a decimal number")
    try:
        parsed = value if isinstance(value, Decimal) else Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError(f"{label} must be a decimal number") from error
    if not parsed.is_finite():
        raise ValueError(f"{label} must be a finite decimal number")
    return parsed


def validate_timesheet(
    evidence: object,
    allocation: object,
    increment_value: object = "0.5",
    default_target_value: object = "8",
    target_overrides: Sequence[str] = (),
) -> None:
    evidence_object = require_object(evidence, "evidence")
    calendar_days = evidence_object.get("calendar_days")
    if not isinstance(calendar_days, list):
        raise ValueError("evidence.calendar_days must be an array")
    activity_by_day: dict[str, bool] = {}
    for index, raw_day in enumerate(calendar_days):
        calendar_day = require_object(raw_day, f"evidence.calendar_days[{index}]")
        day = calendar_day.get("date")
        has_activity = calendar_day.get("has_activity")
        if not isinstance(day, str) or not isinstance(has_activity, bool):
            raise ValueError(f"evidence.calendar_days[{index}] is malformed")
        if day in activity_by_day:
            raise ValueError(f"evidence contains duplicate calendar date {day}")
        activity_by_day[day] = has_activity

    activities = evidence_object.get("activities")
    if not isinstance(activities, list):
        raise ValueError("evidence.activities must be an array")
    evidence_tickets: dict[str, set[str]] = defaultdict(set)
    for index, raw_activity in enumerate(activities):
        activity = require_object(raw_activity, f"evidence.activities[{index}]")
        day = activity.get("date")
        ticket = activity.get("ticket")
        if not isinstance(day, str) or not isinstance(ticket, str) or not ticket:
            raise ValueError(f"evidence.activities[{index}] is malformed")
        evidence_tickets[day].add(ticket)

    allocation_object = require_object(allocation, "allocation")
    for policy_field in ("increment", "daily_targets"):
        if policy_field in allocation_object:
            raise ValueError(
                f"allocation.{policy_field} is not allowed; pass policy to the validator"
            )

    active_days = {
        day for day, has_activity in activity_by_day.items() if has_activity
    }
    increment_decimal = decimal_value(increment_value, "--increment")
    increment = Fraction(increment_decimal)
    if increment <= 0:
        raise ValueError("--increment must be greater than zero")

    default_target_decimal = decimal_value(
        default_target_value, "--target-hours"
    )
    default_target = Fraction(default_target_decimal)
    if default_target <= 0 or default_target % increment:
        raise ValueError(
            "--target-hours must be positive and divisible by --increment"
        )
    daily_targets: dict[str, tuple[Decimal, Fraction]] = {
        day: (default_target_decimal, default_target) for day in active_days
    }
    overridden_days: set[str] = set()
    for raw_override in target_overrides:
        day, separator, raw_target = raw_override.partition("=")
        if not separator or not day or not raw_target:
            raise ValueError("--target must use DATE=HOURS format")
        if day not in active_days:
            raise ValueError(f"--target date {day} is not an active evidence date")
        if day in overridden_days:
            raise ValueError(f"--target repeats date {day}")
        target_decimal = decimal_value(raw_target, f"--target {day}")
        target = Fraction(target_decimal)
        if target <= 0 or target % increment:
            raise ValueError(
                f"--target {day} must be positive and divisible by --increment"
            )
        daily_targets[day] = (target_decimal, target)
        overridden_days.add(day)
    entries = allocation_object.get("entries")
    if not isinstance(entries, list):
        raise ValueError("allocation.entries must be an array")
    ticket_totals = allocation_object.get("ticket_totals")
    if not isinstance(ticket_totals, list):
        raise ValueError("allocation.ticket_totals must be an array")

    totals: dict[str, Fraction] = defaultdict(Fraction)
    entries_by_day: dict[str, list[tuple[str, Fraction]]] = defaultdict(list)
    expected_ticket_totals: dict[str, Fraction] = defaultdict(Fraction)
    for index, raw_entry in enumerate(entries):
        entry = require_object(raw_entry, f"allocation.entries[{index}]")
        day = entry.get("date")
        ticket = entry.get("ticket")
        if not isinstance(day, str):
            raise ValueError(f"allocation.entries[{index}].date must be a string")
        if not isinstance(ticket, str) or not ticket:
            raise ValueError(f"allocation.entries[{index}].ticket must be a string")
        hours = Fraction(
            decimal_value(
                entry.get("hours"), f"allocation.entries[{index}].hours"
            )
        )
        if hours % increment:
            raise ValueError(f"hours must use the {increment_decimal} increment")
        totals[day] += hours
        entries_by_day[day].append((ticket, hours))
        if ticket != "NO_ACTIVITY":
            expected_ticket_totals[ticket] += hours

    if not set(entries_by_day).issubset(activity_by_day):
        raise ValueError("entries must stay inside the evidence window")

    actual_ticket_totals: dict[str, Fraction] = {}
    for index, raw_total in enumerate(ticket_totals):
        total = require_object(raw_total, f"allocation.ticket_totals[{index}]")
        ticket = total.get("ticket")
        if not isinstance(ticket, str) or not ticket:
            raise ValueError(
                f"allocation.ticket_totals[{index}].ticket must be a string"
            )
        if ticket == "NO_ACTIVITY":
            raise ValueError("ticket_totals must exclude NO_ACTIVITY")
        if ticket in actual_ticket_totals:
            raise ValueError(f"ticket_totals contains duplicate ticket {ticket}")
        actual_ticket_totals[ticket] = Fraction(
            decimal_value(
                total.get("hours"), f"allocation.ticket_totals[{index}].hours"
            )
        )

    for day, has_activity in activity_by_day.items():
        if not has_activity:
            if entries_by_day[day] != [("NO_ACTIVITY", Fraction(0))]:
                raise ValueError(
                    f"{day} must contain only NO_ACTIVITY at 0 hours"
                )
            continue
        if any(hours <= 0 for _, hours in entries_by_day[day]):
            raise ValueError(f"{day} active entries must be greater than zero")
        allocated_tickets = [ticket for ticket, _ in entries_by_day[day]]
        if (
            len(allocated_tickets) != len(set(allocated_tickets))
            or set(allocated_tickets) != evidence_tickets[day]
        ):
            raise ValueError(f"{day} tickets must match evidence")

    for day, (target_decimal, target) in daily_targets.items():
        if totals[day] != target:
            raise ValueError(f"{day} hours must total {target_decimal}")

    if actual_ticket_totals != expected_ticket_totals:
        raise ValueError("ticket_totals must equal the sum of allocated entries")


def main(arguments: Sequence[str] | None = None) -> int:
    try:
        options = parse_args(arguments)
        evidence = load_json(options.evidence)
        allocation = load_json(options.allocation)
        validate_timesheet(
            evidence,
            allocation,
            options.increment,
            options.target_hours,
            options.target,
        )
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print("Timesheet allocation is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
