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
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


TICKET_PATTERN = re.compile(r"(?i)\b([a-z][a-z0-9]+-\d+)\b")
GITHUB_REMOTE_PATTERN = re.compile(
    r"github\.com(?::|/)(?P<repo>[^/\s]+/[^/\s]+?)(?:\.git)?$"
)
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect and group authored pull-request commits in a date window."
    )
    parser.add_argument("--repo", help="GitHub repository as OWNER/REPO; defaults to origin")
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
        help="Legacy shortcut: start date through that week’s end or today",
    )
    parser.add_argument(
        "--timezone",
        help="IANA timezone such as Asia/Shanghai; defaults to system local timezone",
    )
    parser.add_argument(
        "--include-all-commit-authors",
        action="store_true",
        help="Include commits whose author does not match the PR author",
    )
    return parser.parse_args()


def validate_explicit_values(args: argparse.Namespace) -> None:
    for name in ("repo", "author", "timezone"):
        value = getattr(args, name)
        if value is not None and not value.strip():
            raise ValueError(f"--{name.replace('_', '-')} must not be empty")


def run(command: list[str]) -> str:
    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True)
    except OSError as error:
        raise RuntimeError(f"cannot start {' '.join(command[:2])}: {error}") from error
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "command failed"
        raise RuntimeError(f"{' '.join(command[:3])}: {detail}")
    return result.stdout.strip()


def detect_repo() -> str | None:
    try:
        remote = run(["git", "remote", "get-url", "origin"])
    except RuntimeError:
        return None
    match = GITHUB_REMOTE_PATTERN.search(remote)
    if match:
        return match.group("repo")
    try:
        return run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]
        )
    except RuntimeError:
        return None


def resolve_system_timezone() -> tuple[ZoneInfo, str]:
    configured_timezone = os.environ.get("TZ")
    if configured_timezone:
        timezone_name = configured_timezone.removeprefix(":")
        try:
            return ZoneInfo(timezone_name), timezone_name
        except ZoneInfoNotFoundError as error:
            raise ValueError(f"unknown system timezone: {configured_timezone}") from error

    try:
        with Path("/etc/localtime").open("rb") as localtime:
            return ZoneInfo.from_file(localtime, key="system"), "system"
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


def resolve_date_window(args: argparse.Namespace, today: date) -> tuple[date, date]:
    has_explicit_range = args.start_date is not None or args.end_date is not None
    if args.week_start is not None and has_explicit_range:
        raise ValueError("--week-start cannot be combined with --start-date or --end-date")

    if has_explicit_range:
        if args.start_date is None or args.end_date is None:
            raise ValueError("--start-date and --end-date must both be provided")
        start, end = args.start_date, args.end_date
    elif args.week_start is not None:
        start = args.week_start
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
    return run(["gh", "api", "user", "--jq", ".login"])


def find_tickets(*values: str) -> list[str]:
    found: list[str] = []
    for value in values:
        for match in TICKET_PATTERN.findall(value or ""):
            ticket = match.upper()
            if ticket not in found:
                found.append(ticket)
    return found


def parse_github_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def is_merge_commit(headline: str) -> bool:
    return headline.lower().startswith("merge ")


def select_ticket(pr: dict[str, Any], headline: str) -> str:
    commit_tickets = find_tickets(headline)
    if len(commit_tickets) == 1:
        return commit_tickets[0]
    pr_tickets = find_tickets(pr.get("title", ""), pr.get("headRefName", ""))
    if len(pr_tickets) == 1:
        return pr_tickets[0]
    return "UNASSIGNED"


def resolve_commit_candidate(
    candidates: list[tuple[dict[str, Any], dict[str, Any]]],
) -> tuple[dict[str, Any], dict[str, Any], str]:
    ordered = sorted(candidates, key=lambda candidate: int(candidate[0]["number"]))
    pr, commit = ordered[0]
    if len(ordered) == 1:
        return pr, commit, select_ticket(pr, commit.get("messageHeadline", ""))

    commit_tickets = find_tickets(commit.get("messageHeadline", ""))
    if len(commit_tickets) == 1:
        return pr, commit, commit_tickets[0]

    fallback_tickets = {
        ticket
        for candidate_pr, _ in ordered
        for ticket in find_tickets(
            candidate_pr.get("title", ""), candidate_pr.get("headRefName", "")
        )
    }
    ticket = fallback_tickets.pop() if len(fallback_tickets) == 1 else "UNASSIGNED"
    if ticket != "UNASSIGNED":
        pr, commit = next(
            candidate
            for candidate in ordered
            if ticket
            in find_tickets(
                candidate[0].get("title", ""), candidate[0].get("headRefName", "")
            )
        )
    return pr, commit, ticket


def fetch_paginated_items(endpoint: str) -> list[dict[str, Any]]:
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
            ]
        )
    )
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
        command.extend(["-F", f"{name}={value}"])

    payload = json.loads(run(command))
    if not isinstance(payload, list) or not all(
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


def normalize_graphql_commit(node: dict[str, Any]) -> dict[str, Any]:
    commit = node.get("commit")
    if not isinstance(commit, dict):
        raise RuntimeError("pull request commit is missing details")

    authors_connection = commit.get("authors")
    if not isinstance(authors_connection, dict):
        raise RuntimeError("pull request commit is missing authors")
    author_nodes = authors_connection.get("nodes")
    if not isinstance(author_nodes, list):
        raise RuntimeError("pull request commit authors are malformed")

    authors = []
    for author_node in author_nodes:
        if not isinstance(author_node, dict):
            continue
        user = author_node.get("user")
        if isinstance(user, dict) and isinstance(user.get("login"), str):
            authors.append({"login": user["login"]})

    oid = commit.get("oid")
    committed_date = commit.get("committedDate")
    headline = commit.get("messageHeadline")
    if not isinstance(oid, str) or not isinstance(committed_date, str):
        raise RuntimeError("pull request commit is missing an identifier or date")
    if not isinstance(headline, str):
        raise RuntimeError("pull request commit is missing a headline")

    return {
        "oid": oid,
        "committedDate": committed_date,
        "messageHeadline": headline,
        "authors": authors,
    }


def fetch_pull_request_commits(repo: str, number: int) -> list[dict[str, Any]]:
    try:
        owner, name = repo.split("/", maxsplit=1)
    except ValueError as error:
        raise ValueError("--repo must use OWNER/REPO format") from error
    if not owner or not name:
        raise ValueError("--repo must use OWNER/REPO format")

    pages = fetch_graphql_pages(
        PULL_REQUEST_COMMITS_QUERY,
        {"owner": owner, "name": name, "number": number},
    )
    commits: list[dict[str, Any]] = []
    for page in pages:
        try:
            connection = page["data"]["repository"]["pullRequest"]["commits"]
        except (KeyError, TypeError) as error:
            raise RuntimeError("unexpected pull request commits response") from error
        if not isinstance(connection, dict):
            raise RuntimeError("unexpected pull request commits connection")
        nodes = connection.get("nodes")
        if not isinstance(nodes, list) or not all(
            isinstance(node, dict) for node in nodes
        ):
            raise RuntimeError("unexpected pull request commit nodes")
        commits.extend(normalize_graphql_commit(node) for node in nodes)
    return commits


def normalize_pull_request(
    pull_request: dict[str, Any], commits: list[dict[str, Any]]
) -> dict[str, Any]:
    head = pull_request.get("head")
    if not isinstance(head, dict):
        raise RuntimeError("pull request is missing a head branch")

    number = pull_request.get("number")
    if not isinstance(number, int):
        raise RuntimeError("pull request is missing a number")

    return {
        "number": number,
        "title": pull_request.get("title", ""),
        "headRefName": head.get("ref", ""),
        "createdAt": pull_request.get("created_at"),
        "mergedAt": pull_request.get("merged_at"),
        "url": pull_request.get("html_url", ""),
        "commits": commits,
    }


def fetch_prs(repo: str, author: str) -> list[dict[str, Any]]:
    pull_requests = fetch_paginated_items(
        f"repos/{repo}/pulls?state=all&per_page=100"
    )
    authored_pull_requests = [
        pull_request
        for pull_request in pull_requests
        if isinstance(pull_request.get("user"), dict)
        and pull_request["user"].get("login", "").casefold() == author.casefold()
    ]

    prs: list[dict[str, Any]] = []
    for pull_request in authored_pull_requests:
        number = pull_request.get("number")
        if not isinstance(number, int):
            raise RuntimeError("pull request is missing a number")
        commits = fetch_pull_request_commits(repo, number)
        prs.append(normalize_pull_request(pull_request, commits))
    return prs


def build_calendar_days(
    start: date, end: date, activities: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    activity_dates = {activity["date"] for activity in activities}
    calendar_days: list[dict[str, Any]] = []
    current = start
    while current <= end:
        day = current.isoformat()
        calendar_days.append({"date": day, "has_activity": day in activity_dates})
        current += timedelta(days=1)
    return calendar_days


def collect(args: argparse.Namespace) -> dict[str, Any]:
    validate_explicit_values(args)
    local_tz, timezone_name = resolve_timezone(args.timezone)
    today = datetime.now(local_tz).date()
    window_start, window_end = resolve_date_window(args, today)
    range_start = datetime.combine(window_start, time.min, local_tz)
    range_end = datetime.combine(window_end + timedelta(days=1), time.min, local_tz)

    repo = args.repo or detect_repo()
    if repo is None:
        raise ValueError("cannot determine GitHub repository; pass --repo")
    resolved_author = resolve_author(args.author)
    resolved_author_key = resolved_author.casefold()
    prs = fetch_prs(repo, resolved_author)

    grouped: dict[tuple[str, str, int], list[dict[str, Any]]] = defaultdict(list)
    commits_by_oid: dict[
        str, list[tuple[dict[str, Any], dict[str, Any]]]
    ] = defaultdict(list)
    commits_without_oid: list[tuple[dict[str, Any], dict[str, Any]]] = []
    duplicates_removed = 0
    commits_outside_range = 0
    commits_by_other_authors = 0
    commits_by_unknown_authors = 0

    for pr in prs:
        for commit in pr.get("commits", []):
            oid = commit.get("oid", "")
            if oid:
                commits_by_oid[oid].append((pr, commit))
            else:
                commits_without_oid.append((pr, commit))

    candidate_groups = list(commits_by_oid.values())
    candidate_groups.extend([[candidate] for candidate in commits_without_oid])
    for candidates in candidate_groups:
        duplicates_removed += len(candidates) - 1
        pr, commit, ticket = resolve_commit_candidate(candidates)

        author_logins = {
            commit_author["login"].casefold()
            for commit_author in commit.get("authors", [])
            if isinstance(commit_author, dict)
            and isinstance(commit_author.get("login"), str)
        }
        if not args.include_all_commit_authors:
            if not author_logins:
                commits_by_unknown_authors += 1
                continue
            if resolved_author_key not in author_logins:
                commits_by_other_authors += 1
                continue

        committed_at = parse_github_time(commit["committedDate"])
        local_time = committed_at.astimezone(local_tz)
        if not range_start <= local_time < range_end:
            commits_outside_range += 1
            continue

        headline = commit.get("messageHeadline", "")
        key = (local_time.date().isoformat(), ticket, int(pr["number"]))
        grouped[key].append(
            {
                "oid": commit.get("oid", ""),
                "instant": committed_at,
                "time": local_time.isoformat(timespec="minutes"),
                "headline": headline,
                "is_merge": is_merge_commit(headline),
            }
        )

    activities: list[dict[str, Any]] = []
    pr_by_number = {int(pr["number"]): pr for pr in prs}
    for (day, ticket, pr_number), commits in grouped.items():
        commits.sort(key=lambda commit: commit["instant"])
        pr = pr_by_number[pr_number]
        activities.append(
            {
                "date": day,
                "ticket": ticket,
                "pr_number": pr_number,
                "pr_title": pr.get("title", ""),
                "pr_url": pr.get("url", ""),
                "commit_count": len(commits),
                "work_commit_count": sum(not commit["is_merge"] for commit in commits),
                "_first_instant": commits[0]["instant"],
                "first_time": commits[0]["time"],
                "last_time": commits[-1]["time"],
                "headlines": [commit["headline"] for commit in commits],
            }
        )
    activities.sort(
        key=lambda activity: (
            activity["date"],
            activity["_first_instant"],
            activity["ticket"],
            activity["pr_number"],
        )
    )
    for activity in activities:
        activity.pop("_first_instant")

    daily: dict[tuple[str, str], dict[str, Any]] = {}
    ticket_totals: dict[str, dict[str, Any]] = {}
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

        ticket_entry = ticket_totals.setdefault(
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

    totals = []
    for entry in ticket_totals.values():
        entry["dates"] = sorted(entry["dates"])
        totals.append(entry)
    totals.sort(key=lambda entry: (-entry["work_commit_count"], entry["ticket"]))

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
        "ticket_totals": totals,
    }


def main() -> int:
    try:
        output = collect(parse_args())
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
