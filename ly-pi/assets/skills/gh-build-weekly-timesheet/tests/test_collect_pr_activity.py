"""Tests for the weekly PR activity collector."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import unittest
from argparse import Namespace
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import call, patch


SCRIPT_PATH = (
    Path(__file__).parent.parent / "scripts" / "collect_pr_activity.py"
)
SPEC = importlib.util.spec_from_file_location("collect_pr_activity", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load collector from {SCRIPT_PATH}")
collector = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = collector
SPEC.loader.exec_module(collector)


def make_args(**overrides: object) -> Namespace:
    values: dict[str, object] = {
        "repo": "owner/repo",
        "author": "@me",
        "start_date": None,
        "end_date": None,
        "week_start": None,
        "timezone": "UTC",
        "include_all_commit_authors": False,
    }
    values.update(overrides)
    return Namespace(**values)


class ResolveDateWindowTests(unittest.TestCase):
    def test_defaults_to_current_local_week_through_today(self) -> None:
        start, end = collector.resolve_date_window(
            make_args(), date(2024, 1, 10)
        )

        self.assertEqual((start, end), (date(2024, 1, 8), date(2024, 1, 10)))

    def test_accepts_an_inclusive_explicit_range(self) -> None:
        start, end = collector.resolve_date_window(
            make_args(start_date=date(2024, 1, 2), end_date=date(2024, 1, 5)),
            date(2024, 1, 10),
        )

        self.assertEqual((start, end), (date(2024, 1, 2), date(2024, 1, 5)))

    def test_rejects_a_partial_explicit_range(self) -> None:
        with self.assertRaisesRegex(ValueError, "both"):
            collector.resolve_date_window(
                make_args(start_date=date(2024, 1, 2)), date(2024, 1, 10)
            )

    def test_rejects_reversed_or_future_ranges(self) -> None:
        with self.assertRaisesRegex(ValueError, "before"):
            collector.resolve_date_window(
                make_args(
                    start_date=date(2024, 1, 5), end_date=date(2024, 1, 2)
                ),
                date(2024, 1, 10),
            )

        with self.assertRaisesRegex(ValueError, "future"):
            collector.resolve_date_window(
                make_args(
                    start_date=date(2024, 1, 2), end_date=date(2024, 1, 11)
                ),
                date(2024, 1, 10),
            )

    def test_week_start_is_capped_at_today(self) -> None:
        start, end = collector.resolve_date_window(
            make_args(week_start=date(2024, 1, 8)), date(2024, 1, 10)
        )

        self.assertEqual((start, end), (date(2024, 1, 8), date(2024, 1, 10)))

    def test_rejects_mixing_week_start_and_explicit_range(self) -> None:
        with self.assertRaisesRegex(ValueError, "cannot be combined"):
            collector.resolve_date_window(
                make_args(
                    start_date=date(2024, 1, 2),
                    end_date=date(2024, 1, 5),
                    week_start=date(2024, 1, 1),
                ),
                date(2024, 1, 10),
            )


class ResolveTimezoneTests(unittest.TestCase):
    def test_uses_timezone_database_for_default_timezone(self) -> None:
        with patch.dict(os.environ, {"TZ": "America/New_York"}, clear=False):
            local_tz, timezone_name = collector.resolve_timezone(None)

        before_dst = datetime(2024, 3, 10, 6, tzinfo=timezone.utc).astimezone(
            local_tz
        )
        after_dst = datetime(2024, 3, 10, 7, tzinfo=timezone.utc).astimezone(
            local_tz
        )
        self.assertEqual(timezone_name, "America/New_York")
        self.assertNotEqual(before_dst.utcoffset(), after_dst.utcoffset())


class CalendarDaysTests(unittest.TestCase):
    def test_includes_every_date_and_marks_evidence_days(self) -> None:
        result = collector.build_calendar_days(
            date(2024, 1, 1),
            date(2024, 1, 3),
            [{"date": "2024-01-02"}],
        )

        self.assertEqual(
            result,
            [
                {"date": "2024-01-01", "has_activity": False},
                {"date": "2024-01-02", "has_activity": True},
                {"date": "2024-01-03", "has_activity": False},
            ],
        )


class FetchGraphqlPagesTests(unittest.TestCase):
    def test_assembles_a_paginated_graphql_command(self) -> None:
        query = "query Test($endCursor: String) { viewer { login } }"
        pages = [{"data": {"viewer": {"login": "alice"}}}]

        with patch.object(collector, "run", return_value=json.dumps(pages)) as run:
            result = collector.fetch_graphql_pages(
                query, {"owner": "owner", "number": 7}
            )

        self.assertEqual(result, pages)
        run.assert_called_once_with(
            [
                "gh",
                "api",
                "graphql",
                "--paginate",
                "--slurp",
                "-f",
                f"query={query}",
                "-F",
                "owner=owner",
                "-F",
                "number=7",
            ]
        )


class FetchPullRequestCommitsTests(unittest.TestCase):
    def test_extracts_every_graphql_commit_page(self) -> None:
        pages = [
            {
                "data": {
                    "repository": {
                        "pullRequest": {
                            "commits": {
                                "nodes": [
                                    {
                                        "commit": {
                                            "oid": "abc",
                                            "committedDate": "2024-01-02T10:00:00Z",
                                            "messageHeadline": "ABC-123 add report",
                                            "authors": {
                                                "nodes": [
                                                    {"user": {"login": "Alice"}},
                                                    {"user": None},
                                                ]
                                            },
                                        }
                                    }
                                ],
                                "pageInfo": {
                                    "hasNextPage": True,
                                    "endCursor": "cursor-1",
                                },
                            }
                        }
                    }
                }
            },
            {
                "data": {
                    "repository": {
                        "pullRequest": {
                            "commits": {
                                "nodes": [
                                    {
                                        "commit": {
                                            "oid": "def",
                                            "committedDate": "2024-01-03T10:00:00Z",
                                            "messageHeadline": "ABC-123 test report",
                                            "authors": {"nodes": []},
                                        }
                                    }
                                ],
                                "pageInfo": {
                                    "hasNextPage": False,
                                    "endCursor": None,
                                },
                            }
                        }
                    }
                }
            },
        ]

        with patch.object(
            collector, "fetch_graphql_pages", return_value=pages
        ) as fetch:
            result = collector.fetch_pull_request_commits("owner/repo", 7)

        self.assertEqual(
            result,
            [
                {
                    "oid": "abc",
                    "committedDate": "2024-01-02T10:00:00Z",
                    "messageHeadline": "ABC-123 add report",
                    "authors": [{"login": "Alice"}],
                },
                {
                    "oid": "def",
                    "committedDate": "2024-01-03T10:00:00Z",
                    "messageHeadline": "ABC-123 test report",
                    "authors": [],
                },
            ],
        )
        query, variables = fetch.call_args.args
        self.assertIn("$endCursor", query)
        self.assertEqual(variables, {"owner": "owner", "name": "repo", "number": 7})


class FetchPullRequestsTests(unittest.TestCase):
    def test_fetches_every_authored_pr_and_its_paginated_commits(self) -> None:
        pull_requests = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "head": {"ref": "ABC-123-report"},
                "created_at": "2024-01-01T00:00:00Z",
                "merged_at": None,
                "html_url": "https://github.com/owner/repo/pull/7",
                "user": {"login": "Alice"},
            },
            {
                "number": 8,
                "title": "other work",
                "head": {"ref": "other-work"},
                "created_at": "2024-01-01T00:00:00Z",
                "merged_at": None,
                "html_url": "https://github.com/owner/repo/pull/8",
                "user": {"login": "bob"},
            },
        ]
        commits = [
            {
                "oid": "abc",
                "committedDate": "2024-01-02T10:00:00Z",
                "messageHeadline": "ABC-123 add report",
                "authors": [{"login": "alice"}],
            }
        ]

        with (
            patch.object(
                collector,
                "fetch_paginated_items",
                return_value=pull_requests,
            ) as fetch,
            patch.object(
                collector,
                "fetch_pull_request_commits",
                return_value=commits,
            ) as fetch_commits,
        ):
            result = collector.fetch_prs("owner/repo", "alice")

        self.assertEqual(
            result,
            [
                {
                    "number": 7,
                    "title": "ABC-123 add report",
                    "headRefName": "ABC-123-report",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "mergedAt": None,
                    "url": "https://github.com/owner/repo/pull/7",
                    "commits": commits,
                }
            ],
        )
        self.assertEqual(
            fetch.call_args_list,
            [call("repos/owner/repo/pulls?state=all&per_page=100")],
        )
        fetch_commits.assert_called_once_with("owner/repo", 7)


class CollectTests(unittest.TestCase):
    def test_emits_date_window_and_calendar_days_without_no_activity_ticket(self) -> None:
        prs = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "abc",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "ABC-123 add report",
                        "authors": [{"login": "Alice"}],
                    }
                ],
            }
        ]

        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=prs),
        ):
            result = collector.collect(
                make_args(
                    start_date=date(2024, 1, 1),
                    end_date=date(2024, 1, 3),
                )
            )

        self.assertEqual(
            result["date_range"],
            {"start": "2024-01-01", "end": "2024-01-03"},
        )
        self.assertEqual(
            result["calendar_days"],
            [
                {"date": "2024-01-01", "has_activity": False},
                {"date": "2024-01-02", "has_activity": True},
                {"date": "2024-01-03", "has_activity": False},
            ],
        )
        self.assertEqual(
            [entry["ticket"] for entry in result["daily_ticket_totals"]],
            ["ABC-123"],
        )


if __name__ == "__main__":
    unittest.main()
