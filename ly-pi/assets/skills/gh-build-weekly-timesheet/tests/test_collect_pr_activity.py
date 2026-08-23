"""Tests for the weekly PR activity collector."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
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


def make_config(**overrides: object) -> collector.CollectorConfig:
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
    return collector.CollectorConfig.from_args(Namespace(**values))


def run_cli(arguments: list[str]) -> tuple[int, str, str]:
    stdout = StringIO()
    stderr = StringIO()
    with (
        patch.object(sys, "argv", [str(SCRIPT_PATH), *arguments]),
        redirect_stdout(stdout),
        redirect_stderr(stderr),
    ):
        exit_code = collector.main()
    return exit_code, stdout.getvalue(), stderr.getvalue()


class CliFailureTests(unittest.TestCase):
    def test_reports_missing_command_without_traceback(self) -> None:
        stderr = StringIO()
        arguments = [
            str(SCRIPT_PATH),
            "--repo",
            "owner/repo",
            "--author",
            "alice",
            "--start-date",
            "2024-01-01",
            "--end-date",
            "2024-01-01",
            "--timezone",
            "UTC",
        ]

        with patch.object(sys, "argv", arguments):
            with patch.object(
                collector.subprocess,
                "run",
                side_effect=FileNotFoundError("gh"),
            ):
                with redirect_stderr(stderr):
                    self.assertEqual(collector.main(), 1)

        self.assertIn("cannot start gh", stderr.getvalue())

    def test_rejects_a_malformed_repo_before_fetching(self) -> None:
        for repo in ("ownerrepo", "/repo", "owner/"):
            with self.subTest(repo=repo):
                with patch.object(collector, "fetch_prs") as fetch:
                    exit_code, stdout, stderr = run_cli(
                        [
                            "--repo",
                            repo,
                            "--author",
                            "alice",
                            "--start-date",
                            "2024-01-01",
                            "--end-date",
                            "2024-01-01",
                            "--timezone",
                            "UTC",
                        ]
                    )

                self.assertEqual(exit_code, 1)
                self.assertEqual(stdout, "")
                self.assertIn("--repo must use OWNER/REPO format", stderr)
                fetch.assert_not_called()


class CliContractTests(unittest.TestCase):
    def collect_json(
        self, pull_requests: list[dict[str, object]], timezone_name: str = "UTC"
    ) -> dict[str, object]:
        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=pull_requests),
        ):
            exit_code, stdout, stderr = run_cli(
                [
                    "--repo",
                    "owner/repo",
                    "--author",
                    "alice",
                    "--start-date",
                    "2024-01-01",
                    "--end-date",
                    "2024-12-31",
                    "--timezone",
                    timezone_name,
                ]
            )

        self.assertEqual(exit_code, 0, stderr)
        return json.loads(stdout)

    def test_rejects_empty_explicit_cli_values(self) -> None:
        base_arguments = [
            "--repo",
            "owner/repo",
            "--author",
            "alice",
            "--start-date",
            "2024-01-01",
            "--end-date",
            "2024-01-01",
            "--timezone",
            "UTC",
        ]

        for option in ("--repo", "--author", "--timezone"):
            arguments = base_arguments.copy()
            arguments[arguments.index(option) + 1] = ""
            with (
                self.subTest(option=option),
                patch.object(collector, "detect_repo", return_value="owner/repo"),
                patch.object(
                    collector,
                    "resolve_system_timezone",
                    return_value=(collector.ZoneInfo("UTC"), "UTC"),
                ),
                patch.object(collector, "fetch_prs", return_value=[]),
            ):
                exit_code, stdout, stderr = run_cli(arguments)

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout, "")
            self.assertIn(f"{option} must not be empty", stderr)

    def test_discovers_ssh_alias_repo_through_gh(self) -> None:
        with (
            patch.object(
                collector,
                "run",
                side_effect=[
                    "git@jan24th:owner/repo.git",
                    "owner/repo",
                ],
            ) as run,
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=[]),
        ):
            exit_code, stdout, stderr = run_cli(
                [
                    "--author",
                    "alice",
                    "--start-date",
                    "2024-01-01",
                    "--end-date",
                    "2024-01-01",
                    "--timezone",
                    "UTC",
                ]
            )

        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(json.loads(stdout)["repository"], "owner/repo")
        self.assertEqual(
            run.call_args_list,
            [
                call(["git", "remote", "get-url", "origin"]),
                call(
                    [
                        "gh",
                        "repo",
                        "view",
                        "--json",
                        "nameWithOwner",
                        "--jq",
                        ".nameWithOwner",
                    ]
                ),
            ],
        )

    def test_rejects_graphql_error_in_later_page(self) -> None:
        pull_requests = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "head": {"ref": "ABC-123-report"},
                "created_at": "2024-01-01T00:00:00Z",
                "merged_at": None,
                "html_url": "https://github.com/owner/repo/pull/7",
                "user": {"login": "alice"},
            }
        ]
        first_page = {
            "data": {
                "repository": {
                    "pullRequest": {
                        "commits": {
                            "nodes": [],
                            "pageInfo": {"hasNextPage": True, "endCursor": "cursor-1"},
                        }
                    }
                }
            }
        }
        partial_page = {
            "data": {
                "repository": {
                    "pullRequest": {
                        "commits": {
                            "nodes": [],
                            "pageInfo": {"hasNextPage": False, "endCursor": None},
                        }
                    }
                }
            },
            "errors": [{"message": "partial failure"}],
        }

        def mocked_run(command: list[str], context: str | None = None) -> str:
            if "graphql" in command:
                return json.dumps([first_page, partial_page])
            return json.dumps([pull_requests])

        with patch.object(collector, "run", side_effect=mocked_run):
            exit_code, stdout, stderr = run_cli(
                [
                    "--repo",
                    "owner/repo",
                    "--author",
                    "alice",
                    "--start-date",
                    "2024-01-01",
                    "--end-date",
                    "2024-01-01",
                    "--timezone",
                    "UTC",
                ]
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("pull request #7", stderr)
        self.assertIn("GitHub GraphQL error: partial failure", stderr)

    def test_assigns_conflicting_duplicate_oid_to_unassigned_stably(self) -> None:
        pull_requests = [
            {
                "number": 8,
                "title": "DEF-456 add report",
                "headRefName": "DEF-456-report",
                "url": "https://github.com/owner/repo/pull/8",
                "commits": [
                    {
                        "oid": "shared",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "implement report output",
                        "authors": [{"login": "alice"}],
                    }
                ],
            },
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "shared",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "implement report output",
                        "authors": [{"login": "alice"}],
                    }
                ],
            },
        ]

        first = self.collect_json(pull_requests)
        second = self.collect_json(list(reversed(pull_requests)))

        self.assertEqual(first["activities"], second["activities"])
        self.assertEqual(first["activities"][0]["ticket"], "UNASSIGNED")
        self.assertEqual(first["duplicates_removed"], 1)

    def test_assigns_partially_ambiguous_duplicate_oid_to_unassigned(self) -> None:
        pull_requests = [
            {
                "number": 8,
                "title": "ABC-123 DEF-456 combined work",
                "headRefName": "combined-work",
                "url": "https://github.com/owner/repo/pull/8",
                "commits": [
                    {
                        "oid": "shared",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "implement report output",
                        "authors": [{"login": "alice"}],
                    }
                ],
            },
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "shared",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "implement report output",
                        "authors": [{"login": "alice"}],
                    }
                ],
            },
        ]

        result = self.collect_json(pull_requests)

        self.assertEqual(result["activities"][0]["ticket"], "UNASSIGNED")
        self.assertEqual(result["duplicates_removed"], 1)

    def test_assigns_a_shared_commit_to_the_consensus_pull_request_ticket(self) -> None:
        pull_requests = [
            {
                "number": 8,
                "title": "ABC-123 follow-up",
                "headRefName": "ABC-123-follow-up",
                "url": "https://github.com/owner/repo/pull/8",
                "commits": [
                    {
                        "oid": "shared",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "implement report output",
                        "authors": [{"login": "alice"}],
                    }
                ],
            },
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "shared",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "implement report output",
                        "authors": [{"login": "alice"}],
                    }
                ],
            },
        ]

        first = self.collect_json(pull_requests)
        second = self.collect_json(list(reversed(pull_requests)))

        self.assertEqual(first["activities"], second["activities"])
        self.assertEqual(first["activities"][0]["ticket"], "ABC-123")
        self.assertEqual(first["activities"][0]["pr_number"], 7)
        self.assertEqual(first["duplicates_removed"], 1)

    def test_preserves_dst_fold_order_and_offset_in_json(self) -> None:
        pull_requests = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "before-fold",
                        "committedDate": "2024-11-03T05:50:00Z",
                        "messageHeadline": "ABC-123 before fallback",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "after-fold",
                        "committedDate": "2024-11-03T06:10:00Z",
                        "messageHeadline": "ABC-123 after fallback",
                        "authors": [{"login": "alice"}],
                    },
                ],
            }
        ]

        result = self.collect_json(pull_requests, "America/New_York")
        activity = result["activities"][0]

        self.assertEqual(
            activity["headlines"],
            ["ABC-123 before fallback", "ABC-123 after fallback"],
        )
        self.assertEqual(activity["first_time"], "2024-11-03T01:50-04:00")
        self.assertEqual(activity["last_time"], "2024-11-03T01:10-05:00")

    def test_orders_dst_fold_activities_by_instant(self) -> None:
        pull_requests = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "before-fold",
                        "committedDate": "2024-11-03T05:50:00Z",
                        "messageHeadline": "ABC-123 before fallback",
                        "authors": [{"login": "alice"}],
                    }
                ],
            },
            {
                "number": 8,
                "title": "DEF-456 add report",
                "headRefName": "DEF-456-report",
                "url": "https://github.com/owner/repo/pull/8",
                "commits": [
                    {
                        "oid": "after-fold",
                        "committedDate": "2024-11-03T06:10:00Z",
                        "messageHeadline": "DEF-456 after fallback",
                        "authors": [{"login": "alice"}],
                    }
                ],
            },
        ]

        result = self.collect_json(pull_requests, "America/New_York")

        self.assertEqual(
            [activity["ticket"] for activity in result["activities"]],
            ["ABC-123", "DEF-456"],
        )
        self.assertEqual(
            [activity["first_time"] for activity in result["activities"]],
            ["2024-11-03T01:50-04:00", "2024-11-03T01:10-05:00"],
        )


class ResolveDateWindowTests(unittest.TestCase):
    def test_defaults_to_current_local_week_through_today(self) -> None:
        start, end = collector.resolve_date_window(
            make_config(), date(2024, 1, 10)
        )

        self.assertEqual((start, end), (date(2024, 1, 8), date(2024, 1, 10)))

    def test_accepts_an_inclusive_explicit_range(self) -> None:
        start, end = collector.resolve_date_window(
            make_config(start_date=date(2024, 1, 2), end_date=date(2024, 1, 5)),
            date(2024, 1, 10),
        )

        self.assertEqual((start, end), (date(2024, 1, 2), date(2024, 1, 5)))

    def test_rejects_a_partial_explicit_range(self) -> None:
        with self.assertRaisesRegex(ValueError, "both"):
            make_config(start_date=date(2024, 1, 2))

    def test_rejects_reversed_or_future_ranges(self) -> None:
        with self.assertRaisesRegex(ValueError, "before"):
            collector.resolve_date_window(
                make_config(
                    start_date=date(2024, 1, 5), end_date=date(2024, 1, 2)
                ),
                date(2024, 1, 10),
            )

        with self.assertRaisesRegex(ValueError, "future"):
            collector.resolve_date_window(
                make_config(
                    start_date=date(2024, 1, 2), end_date=date(2024, 1, 11)
                ),
                date(2024, 1, 10),
            )

    def test_week_start_is_capped_at_today(self) -> None:
        start, end = collector.resolve_date_window(
            make_config(week_start=date(2024, 1, 8)), date(2024, 1, 10)
        )

        self.assertEqual((start, end), (date(2024, 1, 8), date(2024, 1, 10)))

    def test_counts_a_historical_full_week(self) -> None:
        start, end = collector.resolve_date_window(
            make_config(week_start=date(2024, 1, 1)), date(2024, 1, 10)
        )

        self.assertEqual((start, end), (date(2024, 1, 1), date(2024, 1, 7)))

    def test_rejects_mixing_week_start_and_explicit_range(self) -> None:
        with self.assertRaisesRegex(ValueError, "cannot be combined"):
            make_config(
                start_date=date(2024, 1, 2),
                end_date=date(2024, 1, 5),
                week_start=date(2024, 1, 1),
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

    def test_reports_unknown_timezone_for_an_explicit_name(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown timezone: Not/AZone"):
            collector.resolve_timezone("Not/AZone")


class ResolveSystemTimezoneTests(unittest.TestCase):
    def test_reports_unknown_system_timezone_for_an_invalid_tz(self) -> None:
        with patch.dict(os.environ, {"TZ": "Not/AZone"}, clear=True):
            with self.assertRaisesRegex(ValueError, "unknown system timezone"):
                collector.resolve_system_timezone()

    def test_reports_unknown_system_timezone_for_an_absolute_tz_path(self) -> None:
        with patch.dict(os.environ, {"TZ": ":/etc/localtime"}, clear=True):
            with self.assertRaisesRegex(ValueError, "unknown system timezone"):
                collector.resolve_system_timezone()

    def test_resolves_iana_name_from_the_localtime_symlink(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(
                collector.Path,
                "resolve",
                return_value=Path("/var/db/timezone/zoneinfo/America/New_York"),
            ),
        ):
            local_tz, timezone_name = collector.resolve_system_timezone()

        self.assertEqual(timezone_name, "America/New_York")
        self.assertEqual(str(local_tz), "America/New_York")

    def test_falls_back_to_the_system_key_without_a_zoneinfo_symlink(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(
                collector.Path, "resolve", return_value=Path("/etc/localtime")
            ),
            patch.object(
                collector,
                "load_localtime_zoneinfo",
                return_value=collector.ZoneInfo("UTC"),
            ) as load_localtime,
        ):
            local_tz, timezone_name = collector.resolve_system_timezone()

        self.assertEqual(str(local_tz), "UTC")
        self.assertEqual(timezone_name, "system")
        load_localtime.assert_called_once_with(Path("/etc/localtime"))

    def test_requires_an_explicit_timezone_when_localtime_is_unreadable(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(
                collector.Path, "resolve", return_value=Path("/etc/localtime")
            ),
            patch.object(
                collector,
                "load_localtime_zoneinfo",
                side_effect=OSError("denied"),
            ),
        ):
            with self.assertRaisesRegex(ValueError, "pass --timezone"):
                collector.resolve_system_timezone()


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


class RunTests(unittest.TestCase):
    def test_includes_endpoint_context_and_stderr_on_failure(self) -> None:
        completed = subprocess.CompletedProcess(
            args=[], returncode=1, stdout="", stderr="fatal: authentication failed"
        )

        with patch.object(collector.subprocess, "run", return_value=completed):
            with self.assertRaises(RuntimeError) as raised:
                collector.fetch_paginated_items(
                    "repos/owner/repo/pulls?state=all&per_page=100"
                )

        message = str(raised.exception)
        self.assertIn("fatal: authentication failed", message)
        self.assertIn("repos/owner/repo/pulls", message)

    def test_falls_back_to_stdout_when_stderr_is_empty(self) -> None:
        completed = subprocess.CompletedProcess(
            args=[], returncode=1, stdout="stdout detail", stderr=""
        )

        with patch.object(collector.subprocess, "run", return_value=completed):
            with self.assertRaises(RuntimeError) as raised:
                collector.run(["gh", "api", "user"])

        self.assertIn("gh api user: stdout detail", str(raised.exception))


class DetectRepoTests(unittest.TestCase):
    def test_parses_an_https_origin_remote(self) -> None:
        with patch.object(
            collector, "run", return_value="https://github.com/owner/repo.git"
        ) as run:
            self.assertEqual(collector.detect_repo(), "owner/repo")

        run.assert_called_once_with(["git", "remote", "get-url", "origin"])

    def test_parses_an_ssh_origin_remote(self) -> None:
        with patch.object(
            collector, "run", return_value="git@github.com:owner/repo.git"
        ):
            self.assertEqual(collector.detect_repo(), "owner/repo")

    def test_falls_back_to_gh_repo_view_for_a_non_github_remote(self) -> None:
        with patch.object(
            collector,
            "run",
            side_effect=["https://gitlab.com/owner/repo.git", "other/repo"],
        ) as run:
            self.assertEqual(collector.detect_repo(), "other/repo")

        self.assertEqual(run.call_count, 2)

    def test_chains_detection_failures_into_the_final_error(self) -> None:
        with patch.object(
            collector,
            "run",
            side_effect=[
                RuntimeError("git remote get-url: fatal: no such remote"),
                RuntimeError("gh repo view: not logged in"),
            ],
        ):
            with self.assertRaises(RuntimeError) as raised:
                collector.detect_repo()

        message = str(raised.exception)
        self.assertIn("no such remote", message)
        self.assertIn("not logged in", message)
        self.assertIn("pass --repo", message)


class ResolveAuthorTests(unittest.TestCase):
    def test_resolves_me_through_the_github_api(self) -> None:
        with patch.object(collector, "run", return_value="alice") as run:
            self.assertEqual(collector.resolve_author("@me"), "alice")

        run.assert_called_once_with(["gh", "api", "user", "--jq", ".login"])

    def test_passes_through_an_explicit_login(self) -> None:
        with patch.object(collector, "run") as run:
            self.assertEqual(collector.resolve_author("bob"), "bob")

        run.assert_not_called()


class FetchPaginatedItemsTests(unittest.TestCase):
    def test_flattens_every_rest_page(self) -> None:
        pages = [[{"number": 7}], [{"number": 8}]]

        with patch.object(collector, "run", return_value=json.dumps(pages)) as run:
            result = collector.fetch_paginated_items(
                "repos/owner/repo/pulls?state=all&per_page=100"
            )

        self.assertEqual(result, [{"number": 7}, {"number": 8}])
        run.assert_called_once_with(
            [
                "gh",
                "api",
                "--paginate",
                "--slurp",
                "--method",
                "GET",
                "repos/owner/repo/pulls?state=all&per_page=100",
            ],
            context="gh api GET repos/owner/repo/pulls?state=all&per_page=100",
        )


class FetchGraphqlPagesTests(unittest.TestCase):
    def test_assembles_a_paginated_graphql_command(self) -> None:
        query = collector.PULL_REQUEST_COMMITS_QUERY
        pages = [{"data": {"viewer": {"login": "alice"}}}]

        with patch.object(collector, "run", return_value=json.dumps(pages)) as run:
            result = collector.fetch_graphql_pages(
                query, {"owner": "owner", "number": 7}
            )

        self.assertEqual(result, pages)
        self.assertIn("after: $endCursor", query)
        self.assertIn("pageInfo", query)
        run.assert_called_once_with(
            [
                "gh",
                "api",
                "graphql",
                "--paginate",
                "--slurp",
                "-f",
                f"query={query}",
                "-f",
                "owner=owner",
                "-F",
                "number=7",
            ]
        )

    def test_passes_numeric_looking_names_as_raw_strings(self) -> None:
        pages = [{"data": {"viewer": {"login": "alice"}}}]

        with patch.object(collector, "run", return_value=json.dumps(pages)) as run:
            collector.fetch_graphql_pages(
                "query", {"owner": "2024", "name": "365", "number": 7}
            )

        command = run.call_args.args[0]
        self.assertEqual(command[command.index("owner=2024") - 1], "-f")
        self.assertEqual(command[command.index("name=365") - 1], "-f")
        self.assertEqual(command[command.index("number=7") - 1], "-F")


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

    def test_includes_the_pr_number_in_unexpected_response_errors(self) -> None:
        with patch.object(
            collector, "fetch_graphql_pages", return_value=[{"data": None}]
        ):
            with self.assertRaises(RuntimeError) as raised:
                collector.fetch_pull_request_commits("owner/repo", 7)

        self.assertIn("pull request #7", str(raised.exception))


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
            {
                "number": 9,
                "title": "DEF-456 add report",
                "head": {"ref": "DEF-456-report"},
                "created_at": "2024-01-02T00:00:00Z",
                "merged_at": None,
                "html_url": "https://github.com/owner/repo/pull/9",
                "user": {"login": "ALICE"},
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
                    "url": "https://github.com/owner/repo/pull/7",
                    "commits": commits,
                },
                {
                    "number": 9,
                    "title": "DEF-456 add report",
                    "headRefName": "DEF-456-report",
                    "url": "https://github.com/owner/repo/pull/9",
                    "commits": commits,
                },
            ],
        )
        self.assertEqual(
            fetch.call_args_list,
            [call("repos/owner/repo/pulls?state=all&per_page=100")],
        )
        self.assertEqual(
            fetch_commits.call_args_list,
            [call("owner/repo", 7), call("owner/repo", 9)],
        )

    def test_skips_pull_requests_without_a_verifiable_author_login(self) -> None:
        pull_requests = [
            {"number": 7, "user": None},
            {"number": 8, "user": {"login": None}},
            {
                "number": 9,
                "title": "ABC-123 add report",
                "head": {"ref": "ABC-123-report"},
                "html_url": "https://github.com/owner/repo/pull/9",
                "user": {"login": "alice"},
            },
        ]

        with (
            patch.object(
                collector, "fetch_paginated_items", return_value=pull_requests
            ),
            patch.object(collector, "fetch_pull_request_commits", return_value=[]),
        ):
            result = collector.fetch_prs("owner/repo", "alice")

        self.assertEqual([pr["number"] for pr in result], [9])


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
                make_config(
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

    def test_excludes_unverified_authors_by_default(self) -> None:
        prs = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "alice",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "ABC-123 own work",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "bob",
                        "committedDate": "2024-01-02T10:00:00Z",
                        "messageHeadline": "ABC-123 collaborator work",
                        "authors": [{"login": "bob"}],
                    },
                    {
                        "oid": "unknown",
                        "committedDate": "2024-01-02T11:00:00Z",
                        "messageHeadline": "ABC-123 unverified work",
                        "authors": [],
                    },
                ],
            }
        ]

        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=prs),
        ):
            result = collector.collect(
                make_config(
                    start_date=date(2024, 1, 2),
                    end_date=date(2024, 1, 2),
                )
            )

        self.assertEqual(result["activities"][0]["headlines"], ["ABC-123 own work"])
        self.assertEqual(result["commits_by_other_authors"], 1)
        self.assertEqual(result["commits_by_unknown_authors"], 1)

    def test_includes_all_authors_when_requested(self) -> None:
        prs = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "alice",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "ABC-123 own work",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "bob",
                        "committedDate": "2024-01-02T10:00:00Z",
                        "messageHeadline": "ABC-123 collaborator work",
                        "authors": [{"login": "bob"}],
                    },
                    {
                        "oid": "unknown",
                        "committedDate": "2024-01-02T11:00:00Z",
                        "messageHeadline": "ABC-123 unverified work",
                        "authors": [],
                    },
                ],
            }
        ]

        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=prs),
        ):
            result = collector.collect(
                make_config(
                    start_date=date(2024, 1, 2),
                    end_date=date(2024, 1, 2),
                    include_all_commit_authors=True,
                )
            )

        self.assertEqual(result["activities"][0]["commit_count"], 3)
        self.assertEqual(result["commits_by_other_authors"], 0)
        self.assertEqual(result["commits_by_unknown_authors"], 0)

    def test_uses_local_date_boundaries_for_evidence_window(self) -> None:
        prs = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "before",
                        "committedDate": "2024-01-02T07:59:00Z",
                        "messageHeadline": "ABC-123 before window",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "start",
                        "committedDate": "2024-01-02T08:00:00Z",
                        "messageHeadline": "ABC-123 at start",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "end",
                        "committedDate": "2024-01-03T07:59:00Z",
                        "messageHeadline": "ABC-123 before end",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "after",
                        "committedDate": "2024-01-03T08:00:00Z",
                        "messageHeadline": "ABC-123 after window",
                        "authors": [{"login": "alice"}],
                    },
                ],
            }
        ]

        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=prs),
        ):
            result = collector.collect(
                make_config(
                    start_date=date(2024, 1, 2),
                    end_date=date(2024, 1, 2),
                    timezone="America/Los_Angeles",
                )
            )

        self.assertEqual(
            result["activities"][0]["headlines"],
            ["ABC-123 at start", "ABC-123 before end"],
        )
        self.assertEqual(result["commits_outside_range"], 2)
        self.assertEqual(
            result["calendar_days"],
            [{"date": "2024-01-02", "has_activity": True}],
        )

    def test_marks_ambiguous_ticket_evidence_as_unassigned(self) -> None:
        prs = [
            {
                "number": 7,
                "title": "ABC-123 DEF-456 combined work",
                "headRefName": "combined-work",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "single",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "ABC-123 direct work",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "ambiguous",
                        "committedDate": "2024-01-02T10:00:00Z",
                        "messageHeadline": "ABC-123 DEF-456 combined work",
                        "authors": [{"login": "alice"}],
                    },
                ],
            }
        ]

        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=prs),
        ):
            result = collector.collect(
                make_config(
                    start_date=date(2024, 1, 2),
                    end_date=date(2024, 1, 2),
                )
            )

        self.assertEqual(
            [(activity["ticket"], activity["headlines"]) for activity in result["activities"]],
            [
                ("ABC-123", ["ABC-123 direct work"]),
                ("UNASSIGNED", ["ABC-123 DEF-456 combined work"]),
            ],
        )

    def test_uses_single_pull_request_ticket_as_a_fallback(self) -> None:
        prs = [
            {
                "number": 7,
                "title": "GHI-789 add report",
                "headRefName": "report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "fallback",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "implement report output",
                        "authors": [{"login": "alice"}],
                    }
                ],
            }
        ]

        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=prs),
        ):
            result = collector.collect(
                make_config(
                    start_date=date(2024, 1, 2),
                    end_date=date(2024, 1, 2),
                )
            )

        self.assertEqual(result["activities"][0]["ticket"], "GHI-789")

    def test_deduplicates_shared_commits_and_excludes_merge_work_counts(self) -> None:
        prs = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "shared",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "ABC-123 shared work",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "merge",
                        "committedDate": "2024-01-02T10:00:00Z",
                        "messageHeadline": "Merge main into ABC-123-report",
                        "authors": [{"login": "alice"}],
                    },
                ],
            },
            {
                "number": 8,
                "title": "DEF-456 add report",
                "headRefName": "DEF-456-report",
                "url": "https://github.com/owner/repo/pull/8",
                "commits": [
                    {
                        "oid": "shared",
                        "committedDate": "2024-01-02T11:00:00Z",
                        "messageHeadline": "DEF-456 duplicate work",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "unique",
                        "committedDate": "2024-01-02T12:00:00Z",
                        "messageHeadline": "DEF-456 own work",
                        "authors": [{"login": "alice"}],
                    },
                ],
            },
        ]

        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=prs),
        ):
            result = collector.collect(
                make_config(
                    start_date=date(2024, 1, 2),
                    end_date=date(2024, 1, 2),
                )
            )

        by_ticket = {
            entry["ticket"]: (entry["commit_count"], entry["work_commit_count"])
            for entry in result["daily_ticket_totals"]
        }
        self.assertEqual(result["duplicates_removed"], 1)
        self.assertEqual(by_ticket, {"ABC-123": (2, 1), "DEF-456": (1, 1)})

    def test_aggregates_ticket_totals_sorted_by_work_commits(self) -> None:
        prs = [
            {
                "number": 7,
                "title": "ABC-123 add report",
                "headRefName": "ABC-123-report",
                "url": "https://github.com/owner/repo/pull/7",
                "commits": [
                    {
                        "oid": "a1",
                        "committedDate": "2024-01-02T09:00:00Z",
                        "messageHeadline": "ABC-123 first",
                        "authors": [{"login": "alice"}],
                    },
                    {
                        "oid": "a2",
                        "committedDate": "2024-01-03T09:00:00Z",
                        "messageHeadline": "ABC-123 second",
                        "authors": [{"login": "alice"}],
                    },
                ],
            },
            {
                "number": 8,
                "title": "DEF-456 add metrics",
                "headRefName": "DEF-456-metrics",
                "url": "https://github.com/owner/repo/pull/8",
                "commits": [
                    {
                        "oid": "d1",
                        "committedDate": "2024-01-02T10:00:00Z",
                        "messageHeadline": "DEF-456 first",
                        "authors": [{"login": "alice"}],
                    },
                ],
            },
        ]

        with (
            patch.object(collector, "resolve_author", return_value="alice"),
            patch.object(collector, "fetch_prs", return_value=prs),
        ):
            result = collector.collect(
                make_config(
                    start_date=date(2024, 1, 2),
                    end_date=date(2024, 1, 3),
                )
            )

        self.assertEqual(
            result["ticket_totals"],
            [
                {
                    "ticket": "ABC-123",
                    "commit_count": 2,
                    "work_commit_count": 2,
                    "dates": ["2024-01-02", "2024-01-03"],
                },
                {
                    "ticket": "DEF-456",
                    "commit_count": 1,
                    "work_commit_count": 1,
                    "dates": ["2024-01-02"],
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
