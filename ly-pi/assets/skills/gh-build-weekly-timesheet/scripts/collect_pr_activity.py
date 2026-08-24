#!/usr/bin/env python3
"""Collect ticket activity from every authored pull request in a date window."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Final, TypedDict
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


UNASSIGNED_TICKET: Final = "UNASSIGNED"
TICKET_PATTERN = re.compile(r"(?i)\b([a-z][a-z0-9]+-\d+)\b")
SSH_REMOTE_PATTERN = re.compile(
    r"^(?P<user>[^@\s/:]+)@(?P<host>[^:\s/]+):(?P<path>[^?#\s]+)$"
)
REPOSITORY_COMPONENT_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
PULL_REQUEST_COMMITS_QUERY = """
query PullRequestCommits(
  $owner: String!
  $name: String!
  $number: Int!
  $endCursor: String
) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      commits(first: 100, after: $endCursor) {
        nodes {
          commit {
            oid
            committedDate
            messageHeadline
            authors(first: 100) {
              nodes {
                user {
                  login
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
"""


class CommitAuthor(TypedDict):
    login: str


class Commit(TypedDict):
    oid: str
    committedDate: str
    messageHeadline: str
    authors: list[CommitAuthor]


class PullRequest(TypedDict):
    number: int
    title: str
    headRefName: str
    url: str
    commits: list[Commit]


class CommitEntry(TypedDict):
    oid: str
    instant: datetime
    time: str
    headline: str
    is_merge: bool


class Activity(TypedDict):
    date: str
    ticket: str
    pr_number: int
    pr_title: str
    pr_url: str
    commit_count: int
    work_commit_count: int
    first_time: str
    last_time: str
    headlines: list[str]


class CalendarDay(TypedDict):
    date: str
    has_activity: bool


class DateRange(TypedDict):
    start: str
    end: str


class DailyTicketTotal(TypedDict):
    date: str
    ticket: str
    commit_count: int
    work_commit_count: int
    prs: list[int]


class TicketTotalAccumulator(TypedDict):
    ticket: str
    commit_count: int
    work_commit_count: int
    dates: set[str]


class TicketTotal(TypedDict):
    ticket: str
    commit_count: int
    work_commit_count: int
    dates: list[str]


class CollectResult(TypedDict):
    repository: str
    author: str
    timezone: str
    date_range: DateRange
    calendar_days: list[CalendarDay]
    pull_requests_scanned: int
    duplicates_removed: int
    commits_outside_range: int
    commits_by_other_authors: int
    commits_by_unknown_authors: int
    activities: list[Activity]
    daily_ticket_totals: list[DailyTicketTotal]
    ticket_totals: list[TicketTotal]


@dataclass(frozen=True)
class CollectorConfig:
    repo: str | None
    author: str
    timezone: str | None
    start_date: date | None
    end_date: date | None
    week_start: date | None
    include_all_commit_authors: bool

    def __post_init__(self) -> None:
        has_explicit_range = self.start_date is not None or self.end_date is not None
        if has_explicit_range and (self.start_date is None or self.end_date is None):
            raise ValueError("--start-date and --end-date must both be provided")
        if self.week_start is not None and has_explicit_range:
            raise ValueError(
                "--week-start cannot be combined with --start-date or --end-date"
            )

    @classmethod
    def from_args(cls, args: argparse.Namespace) -> CollectorConfig:
        author = args.author.strip()
        for flag, value in (
            ("--repo", args.repo),
            ("--author", author),
            ("--timezone", args.timezone),
        ):
            if value is not None and not value.strip():
                raise ValueError(f"{flag} must not be empty")
        if args.repo is not None:
            split_repo(args.repo)
        return cls(
            repo=args.repo,
            author=author,
            timezone=args.timezone,
            start_date=args.start_date,
            end_date=args.end_date,
            week_start=args.week_start,
            include_all_commit_authors=args.include_all_commit_authors,
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect and group authored pull-request commits in a date window."
    )
    parser.add_argument(
        "--repo",
        help="GitHub repository as OWNER/REPO; defaults to the GitHub origin "
        "remote, falling back to the repository resolved by gh repo view",
    )
    parser.add_argument("--author", default="@me", help="PR author login; defaults to @me")
    parser.add_argument(
        "--start-date",
        type=date.fromisoformat,
        help="Inclusive local start date as YYYY-MM-DD; requires --end-date",
    )
    parser.add_argument(
        "--end-date",
        type=date.fromisoformat,
        help="Inclusive local end date as YYYY-MM-DD; requires --start-date",
    )
    parser.add_argument(
        "--week-start",
        type=date.fromisoformat,
        help="Legacy shortcut: start date through 6 days later or today",
    )
    parser.add_argument(
        "--timezone",
        help="IANA timezone such as Asia/Shanghai; defaults to system local timezone",
    )
    parser.add_argument(
        "--include-all-commit-authors",
        action="store_true",
        help="Include commits by other authors or without a verified GitHub author",
    )
    return parser.parse_args()


def split_repo(repo: str) -> tuple[str, str]:
    parts = repo.split("/")
    if len(parts) != 2 or not all(
        part not in {".", ".."}
        and REPOSITORY_COMPONENT_PATTERN.fullmatch(part)
        for part in parts
    ):
        raise ValueError("--repo must use OWNER/REPO format")
    return parts[0], parts[1]


def parse_remote_repository(path: str) -> str | None:
    if path.startswith("/"):
        path = path[1:]
    if path.endswith("/"):
        path = path[:-1]
    parts = path.split("/")
    if len(parts) != 2 or not all(parts) or any(
        any(character.isspace() for character in part) for part in parts
    ):
        return None

    owner, name = parts
    if name.endswith(".git"):
        name = name[:-4]
    if not name:
        return None
    return f"{owner}/{name}"


def remote_details(remote: str) -> tuple[str | None, str | None, bool]:
    value = remote.strip()
    scp_match = SSH_REMOTE_PATTERN.fullmatch(value)
    if scp_match:
        return (
            scp_match.group("host"),
            parse_remote_repository(scp_match.group("path")),
            True,
        )

    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        _ = parsed.port
    except ValueError:
        return None, None, False
    if host is None:
        return None, None, False
    return host, parse_remote_repository(parsed.path), (
        parsed.scheme.casefold() in {"https", "ssh"}
        and not parsed.query
        and not parsed.fragment
    )


def github_repository_from_remote(remote: str) -> str | None:
    host, repository, supported_scheme = remote_details(remote)
    if host is None or host.casefold() != "github.com" or not supported_scheme:
        return None
    return repository


def describe_remote(remote: str) -> str:
    host, repository, _ = remote_details(remote)
    return (
        f"host={host or '<unknown>'}, "
        f"repository={repository or '<unknown>'}"
    )


def run(command: list[str], context: str | None = None) -> str:
    label = context if context is not None else " ".join(command[:3])
    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True)
    except OSError as error:
        raise RuntimeError(f"cannot start {' '.join(command[:2])}: {error}") from error
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "command failed"
        raise RuntimeError(f"{label}: {detail}")
    return result.stdout.strip()


def detect_repo() -> str:
    failures: list[str] = []
    try:
        remote = run(["git", "remote", "get-url", "origin"])
    except RuntimeError as error:
        failures.append(str(error))
    else:
        repository = github_repository_from_remote(remote)
        if repository is not None:
            return repository
        failures.append(
            f"origin remote {describe_remote(remote)} is not a GitHub URL"
        )

    try:
        return run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]
        )
    except RuntimeError as error:
        failures.append(str(error))
    raise RuntimeError(
        f"cannot determine GitHub repository ({'; '.join(failures)}); pass --repo"
    )


def timezone_name_from_localtime(target: Path) -> str | None:
    parts = target.parts
    if "zoneinfo" not in parts:
        return None
    name = "/".join(parts[parts.index("zoneinfo") + 1 :])
    return name or None


def load_localtime_zoneinfo(localtime: Path) -> ZoneInfo:
    with localtime.open("rb") as localtime_file:
        return ZoneInfo.from_file(localtime_file, key="system")


def resolve_system_timezone() -> tuple[ZoneInfo, str]:
    configured_timezone = os.environ.get("TZ")
    if configured_timezone is not None:
        timezone_name = configured_timezone.removeprefix(":")
        if not timezone_name:
            return ZoneInfo("UTC"), "UTC"
        try:
            return ZoneInfo(timezone_name), timezone_name
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError(f"unknown system timezone: {configured_timezone}") from error

    localtime = Path("/etc/localtime")
    try:
        target = localtime.resolve()
    except OSError:
        target = localtime
    timezone_name = timezone_name_from_localtime(target)
    if timezone_name is not None:
        try:
            return ZoneInfo(timezone_name), timezone_name
        except (ZoneInfoNotFoundError, ValueError):
            pass

    try:
        return load_localtime_zoneinfo(localtime), "system"
    except (OSError, ValueError) as error:
        raise ValueError(
            "cannot determine system local timezone; pass --timezone"
        ) from error


def resolve_timezone(name: str | None) -> tuple[ZoneInfo, str]:
    if not name:
        return resolve_system_timezone()
    try:
        return ZoneInfo(name), name
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"unknown timezone: {name}") from error


def resolve_date_window(config: CollectorConfig, today: date) -> tuple[date, date]:
    if config.start_date is not None and config.end_date is not None:
        start, end = config.start_date, config.end_date
    elif config.week_start is not None:
        start = config.week_start
        end = min(start + timedelta(days=6), today)
    else:
        start = today - timedelta(days=today.weekday())
        end = today

    if start > today or end > today:
        raise ValueError("date range cannot include future dates")
    if start > end:
        raise ValueError("--end-date must not be before --start-date")
    return start, end


def resolve_author(author: str) -> str:
    if author != "@me":
        return author
    login = run(["gh", "api", "user", "--jq", ".login"])
    if not login or login.casefold() == "null":
        raise RuntimeError("gh api user returned an empty login or null")
    return login


def find_tickets(*values: str) -> list[str]:
    found: list[str] = []
    for value in values:
        for match in TICKET_PATTERN.findall(value or ""):
            ticket = match.upper()
            if ticket not in found:
                found.append(ticket)
    return found


def parse_github_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("timestamp must include a timezone offset")
    return parsed


def is_merge_commit(headline: str) -> bool:
    return headline.lower().startswith("merge ")


def select_ticket(pr: PullRequest, headline: str) -> str:
    commit_tickets = find_tickets(headline)
    if len(commit_tickets) == 1:
        return commit_tickets[0]
    pr_tickets = find_tickets(pr["title"], pr["headRefName"])
    if len(pr_tickets) == 1:
        return pr_tickets[0]
    return UNASSIGNED_TICKET


def resolve_commit_candidate(
    candidates: list[tuple[PullRequest, Commit]],
) -> tuple[PullRequest, Commit, str]:
    ordered = sorted(candidates, key=lambda candidate: candidate[0]["number"])
    pr, commit = ordered[0]
    if len(ordered) == 1:
        return pr, commit, select_ticket(pr, commit["messageHeadline"])

    commit_tickets = find_tickets(commit["messageHeadline"])
    if len(commit_tickets) == 1:
        ticket = commit_tickets[0]
        matching_candidates = [
            candidate
            for candidate in ordered
            if ticket
            in find_tickets(candidate[0]["title"], candidate[0]["headRefName"])
        ]
        if matching_candidates:
            pr, commit = matching_candidates[0]
        return pr, commit, ticket

    fallback_tickets = {
        ticket
        for candidate_pr, _ in ordered
        for ticket in find_tickets(candidate_pr["title"], candidate_pr["headRefName"])
    }
    ticket = fallback_tickets.pop() if len(fallback_tickets) == 1 else UNASSIGNED_TICKET
    if ticket != UNASSIGNED_TICKET:
        matching_candidates = [
            candidate
            for candidate in ordered
            if ticket
            in find_tickets(candidate[0]["title"], candidate[0]["headRefName"])
        ]
        if matching_candidates:
            pr, commit = matching_candidates[0]
        else:
            ticket = UNASSIGNED_TICKET
    return pr, commit, ticket


def fetch_paginated_items(endpoint: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(
            run(
                [
                    "gh",
                    "api",
                    "--paginate",
                    "--slurp",
                    "--method",
                    "GET",
                    endpoint,
                ],
                context=f"gh api GET {endpoint}",
            )
        )
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"gh api GET {endpoint}: invalid JSON response: {error.msg}"
        ) from error
    if not isinstance(payload, list):
        raise RuntimeError("unexpected paginated GitHub API response")

    items: list[dict[str, Any]] = []
    for page in payload:
        if not isinstance(page, list) or not all(
            isinstance(item, dict) for item in page
        ):
            raise RuntimeError("unexpected paginated GitHub API page")
        items.extend(page)
    return items


def fetch_graphql_pages(
    query: str, variables: dict[str, str | int]
) -> list[dict[str, Any]]:
    command = [
        "gh",
        "api",
        "graphql",
        "--paginate",
        "--slurp",
        "-f",
        f"query={query}",
    ]
    for name, value in variables.items():
        flag = "-F" if isinstance(value, int) else "-f"
        command.extend([flag, f"{name}={value}"])

    try:
        payload = json.loads(run(command))
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"gh api graphql: invalid JSON response: {error.msg}"
        ) from error
    if not payload or not isinstance(payload, list) or not all(
        isinstance(page, dict) for page in payload
    ):
        raise RuntimeError("unexpected paginated GitHub GraphQL response")
    for page in payload:
        errors = page.get("errors", [])
        if not isinstance(errors, list):
            raise RuntimeError("unexpected GitHub GraphQL errors")
        if errors:
            messages = [
                error["message"]
                for error in errors
                if isinstance(error, dict) and isinstance(error.get("message"), str)
            ]
            detail = "; ".join(messages) or "unknown error"
            raise RuntimeError(f"GitHub GraphQL error: {detail}")
    return payload


def normalize_graphql_commit(node: dict[str, Any]) -> Commit:
    commit = node.get("commit")
    if not isinstance(commit, dict):
        raise RuntimeError("pull request commit is missing details")

    authors_connection = commit.get("authors")
    if not isinstance(authors_connection, dict):
        raise RuntimeError("pull request commit is missing authors")
    author_nodes = authors_connection.get("nodes")
    if not isinstance(author_nodes, list):
        raise RuntimeError("pull request commit authors are malformed")

    authors: list[CommitAuthor] = []
    for author_node in author_nodes:
        if not isinstance(author_node, dict):
            continue
        user = author_node.get("user")
        login = user.get("login") if isinstance(user, dict) else None
        if isinstance(login, str) and login.strip():
            authors.append({"login": login})

    oid = commit.get("oid")
    committed_date = commit.get("committedDate")
    headline = commit.get("messageHeadline")
    if not isinstance(oid, str) or not oid.strip() or not isinstance(
        committed_date, str
    ):
        raise RuntimeError(
            "pull request commit is missing a non-empty identifier or date"
        )
    if not isinstance(headline, str):
        raise RuntimeError("pull request commit is missing a headline")

    return {
        "oid": oid,
        "committedDate": committed_date,
        "messageHeadline": headline,
        "authors": authors,
    }


def fetch_pull_request_commits(repo: str, number: int) -> list[Commit]:
    owner, name = split_repo(repo)
    try:
        pages = fetch_graphql_pages(
            PULL_REQUEST_COMMITS_QUERY,
            {"owner": owner, "name": name, "number": number},
        )
    except RuntimeError as error:
        raise RuntimeError(f"pull request #{number}: {error}") from error

    commits: list[Commit] = []
    for page in pages:
        try:
            connection = page["data"]["repository"]["pullRequest"]["commits"]
        except (KeyError, TypeError) as error:
            raise RuntimeError(
                f"unexpected commits response for pull request #{number}"
            ) from error
        if not isinstance(connection, dict):
            raise RuntimeError(
                f"unexpected commits connection for pull request #{number}"
            )
        page_info = connection.get("pageInfo")
        if not isinstance(page_info, dict):
            raise RuntimeError(
                f"unexpected commits pageInfo for pull request #{number}"
            )
        has_next_page = page_info.get("hasNextPage")
        end_cursor = page_info.get("endCursor")
        if (
            not isinstance(has_next_page, bool)
            or (end_cursor is not None and not isinstance(end_cursor, str))
            or (
                has_next_page
                and (
                    not isinstance(end_cursor, str) or not end_cursor.strip()
                )
            )
        ):
            raise RuntimeError(
                f"unexpected commits pageInfo for pull request #{number}"
            )
        nodes = connection.get("nodes")
        if not isinstance(nodes, list) or not all(
            isinstance(node, dict) for node in nodes
        ):
            raise RuntimeError(f"unexpected commit nodes for pull request #{number}")
        for node in nodes:
            try:
                commits.append(normalize_graphql_commit(node))
            except RuntimeError as error:
                raise RuntimeError(
                    f"pull request #{number}: {error}"
                ) from error
    return commits


def required_pull_request_string(
    number: int, value: object, field: str
) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"pull request #{number} is missing a valid {field}")
    return value


def normalize_pull_request(
    pull_request: dict[str, Any], commits: list[Commit]
) -> PullRequest:
    number = pull_request.get("number")
    if not isinstance(number, int) or isinstance(number, bool):
        raise RuntimeError("pull request is missing a number")

    head = pull_request.get("head")
    if not isinstance(head, dict):
        raise RuntimeError(f"pull request #{number} is missing a head branch")

    return {
        "number": number,
        "title": required_pull_request_string(
            number, pull_request.get("title"), "title"
        ),
        "headRefName": required_pull_request_string(
            number, head.get("ref"), "head branch name"
        ),
        "url": required_pull_request_string(
            number, pull_request.get("html_url"), "URL"
        ),
        "commits": commits,
    }


def pull_request_author_login(pull_request: dict[str, Any]) -> str | None:
    user = pull_request.get("user")
    if not isinstance(user, dict):
        return None
    login = user.get("login")
    return login if isinstance(login, str) and login.strip() else None


def fetch_prs(repo: str, author: str) -> list[PullRequest]:
    owner, name = split_repo(repo)
    repository = f"{owner}/{name}"
    pull_requests = fetch_paginated_items(
        f"repos/{repository}/pulls?state=all&per_page=100"
    )
    author_key = author.casefold()
    authored_pull_requests: list[dict[str, Any]] = []
    for pull_request in pull_requests:
        login = pull_request_author_login(pull_request)
        if login is None:
            number = pull_request.get("number")
            if isinstance(number, int) and not isinstance(number, bool):
                raise RuntimeError(
                    f"pull request #{number} is missing a verifiable author login"
                )
            raise RuntimeError(
                "pull request list contains an item without a verifiable author login"
            )
        if login.casefold() == author_key:
            authored_pull_requests.append(pull_request)

    prs: list[PullRequest] = []
    for pull_request in authored_pull_requests:
        normalized = normalize_pull_request(pull_request, [])
        normalized["commits"] = fetch_pull_request_commits(
            repository, normalized["number"]
        )
        prs.append(normalized)
    return prs


def build_calendar_days(
    start: date, end: date, activities: list[Activity]
) -> list[CalendarDay]:
    activity_dates = {activity["date"] for activity in activities}
    calendar_days: list[CalendarDay] = []
    current = start
    while current <= end:
        day = current.isoformat()
        calendar_days.append({"date": day, "has_activity": day in activity_dates})
        current += timedelta(days=1)
    return calendar_days


def collect(config: CollectorConfig) -> CollectResult:
    local_tz, timezone_name = resolve_timezone(config.timezone)
    today = datetime.now(local_tz).date()
    window_start, window_end = resolve_date_window(config, today)
    range_start = datetime.combine(window_start, time.min, local_tz)
    range_end = datetime.combine(window_end + timedelta(days=1), time.min, local_tz)

    repo = config.repo or detect_repo()
    resolved_author = resolve_author(config.author)
    resolved_author_key = resolved_author.casefold()
    prs = fetch_prs(repo, resolved_author)

    grouped: dict[tuple[str, str, int], list[CommitEntry]] = defaultdict(list)
    commits_by_oid: dict[str, list[tuple[PullRequest, Commit]]] = defaultdict(list)
    duplicates_removed = 0
    commits_outside_range = 0
    commits_by_other_authors = 0
    commits_by_unknown_authors = 0

    for pr in prs:
        for commit in pr["commits"]:
            commits_by_oid[commit["oid"]].append((pr, commit))

    for candidates in commits_by_oid.values():
        duplicates_removed += len(candidates) - 1
        pr, commit, ticket = resolve_commit_candidate(candidates)

        author_logins = {
            commit_author["login"].casefold()
            for commit_author in commit["authors"]
            if commit_author["login"].strip()
        }
        if not config.include_all_commit_authors:
            if not author_logins:
                commits_by_unknown_authors += 1
                continue
            if resolved_author_key not in author_logins:
                commits_by_other_authors += 1
                continue

        try:
            committed_at = parse_github_time(commit["committedDate"])
        except ValueError as error:
            raise RuntimeError(
                f"commit {commit['oid']} in pull request #{pr['number']} "
                f"has an invalid committedDate: {error}"
            ) from error
        local_time = committed_at.astimezone(local_tz)
        if not range_start <= local_time < range_end:
            commits_outside_range += 1
            continue

        headline = commit["messageHeadline"]
        key = (local_time.date().isoformat(), ticket, pr["number"])
        grouped[key].append(
            {
                "oid": commit["oid"],
                "instant": committed_at,
                "time": local_time.isoformat(timespec="minutes"),
                "headline": headline,
                "is_merge": is_merge_commit(headline),
            }
        )

    activity_rows: list[tuple[datetime, Activity]] = []
    pr_by_number = {pr["number"]: pr for pr in prs}
    for (day, ticket, pr_number), commits in grouped.items():
        commits.sort(key=lambda commit: commit["instant"])
        pr = pr_by_number[pr_number]
        activity_rows.append(
            (
                commits[0]["instant"],
                {
                    "date": day,
                    "ticket": ticket,
                    "pr_number": pr_number,
                    "pr_title": pr["title"],
                    "pr_url": pr["url"],
                    "commit_count": len(commits),
                    "work_commit_count": sum(
                        not commit["is_merge"] for commit in commits
                    ),
                    "first_time": commits[0]["time"],
                    "last_time": commits[-1]["time"],
                    "headlines": [commit["headline"] for commit in commits],
                },
            )
        )
    activity_rows.sort(
        key=lambda row: (row[1]["date"], row[0], row[1]["ticket"], row[1]["pr_number"])
    )
    activities = [activity for _, activity in activity_rows]

    daily: dict[tuple[str, str], DailyTicketTotal] = {}
    ticket_accumulators: dict[str, TicketTotalAccumulator] = {}
    for activity in activities:
        daily_key = (activity["date"], activity["ticket"])
        daily_entry = daily.setdefault(
            daily_key,
            {
                "date": activity["date"],
                "ticket": activity["ticket"],
                "commit_count": 0,
                "work_commit_count": 0,
                "prs": [],
            },
        )
        daily_entry["commit_count"] += activity["commit_count"]
        daily_entry["work_commit_count"] += activity["work_commit_count"]
        daily_entry["prs"].append(activity["pr_number"])

        ticket_entry = ticket_accumulators.setdefault(
            activity["ticket"],
            {
                "ticket": activity["ticket"],
                "commit_count": 0,
                "work_commit_count": 0,
                "dates": set(),
            },
        )
        ticket_entry["commit_count"] += activity["commit_count"]
        ticket_entry["work_commit_count"] += activity["work_commit_count"]
        ticket_entry["dates"].add(activity["date"])

    ticket_totals: list[TicketTotal] = [
        {
            "ticket": entry["ticket"],
            "commit_count": entry["commit_count"],
            "work_commit_count": entry["work_commit_count"],
            "dates": sorted(entry["dates"]),
        }
        for entry in ticket_accumulators.values()
    ]
    ticket_totals.sort(key=lambda entry: (-entry["work_commit_count"], entry["ticket"]))

    return {
        "repository": repo,
        "author": resolved_author,
        "timezone": timezone_name,
        "date_range": {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
        },
        "calendar_days": build_calendar_days(window_start, window_end, activities),
        "pull_requests_scanned": len(prs),
        "duplicates_removed": duplicates_removed,
        "commits_outside_range": commits_outside_range,
        "commits_by_other_authors": commits_by_other_authors,
        "commits_by_unknown_authors": commits_by_unknown_authors,
        "activities": activities,
        "daily_ticket_totals": sorted(
            daily.values(), key=lambda entry: (entry["date"], entry["ticket"])
        ),
        "ticket_totals": ticket_totals,
    }


def main() -> int:
    try:
        output = collect(CollectorConfig.from_args(parse_args()))
    except (RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
