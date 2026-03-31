"""
github_parser.py — Fetches and parses a user's public GitHub profile.

Give it a GitHub username and it returns a GitHubProfile dataclass containing
the user's public repos, programming languages, repository topics, and a
derived top-skills list (the five most-used languages). The result is saved
to SQLite automatically so the rest of the app — especially ai_coach.py — can
use it without hitting the GitHub API again. No authentication is required for
public repos, but an optional GITHUB_TOKEN in .env raises the rate limit from
60 to 5,000 requests per hour.
"""

import os
from collections import Counter
from typing import List

import requests
from dotenv import load_dotenv

from db_operations import save_github_profile
from models import GitHubProfile

load_dotenv()   # Read GITHUB_TOKEN from .env if present

GITHUB_API_BASE  = "https://api.github.com"
RATE_LIMIT_WARN  = 5       # Warn when fewer than this many requests remain
MAX_REPOS        = 100     # GitHub's per_page cap; fetch up to this many at once
TOP_SKILLS_COUNT = 5       # How many top languages to surface in top_skills


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    """
    Builds the request headers for GitHub API calls.
    Adds Authorization only if GITHUB_TOKEN is present in the environment.
    Using a token raises the rate limit from 60 to 5,000 req/hour.
    """
    headers = {"Accept": "application/vnd.github+json"}
    token = os.getenv("GITHUB_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _check_rate_limit(response: requests.Response) -> None:
    """
    Reads the X-RateLimit-Remaining header from any GitHub API response
    and prints a warning if the call budget is nearly exhausted.
    """
    remaining = response.headers.get("X-RateLimit-Remaining", "")
    if remaining and int(remaining) < RATE_LIMIT_WARN:
        print(f"Warning: GitHub API rate limit almost reached ({remaining} requests left).")


def _get_repos(username: str) -> List[dict]:
    """
    Calls the GitHub REST API to fetch up to MAX_REPOS public repositories
    for the given username. Returns the raw list of repo dicts on success,
    or an empty list if the user doesn't exist or the request fails.
    """
    url = f"{GITHUB_API_BASE}/users/{username}/repos"
    params = {"per_page": MAX_REPOS, "type": "public"}   # Only public repos

    response = requests.get(url, headers=_headers(), params=params, timeout=10)
    _check_rate_limit(response)

    if response.status_code == 404:
        raise ValueError(f"GitHub user '{username}' not found.")
    if response.status_code != 200:
        raise RuntimeError(f"GitHub API error {response.status_code}: {response.text[:200]}")

    return response.json()


def _extract_languages(repos: List[dict]) -> List[str]:
    """
    Collects the primary language from each repo (the 'language' field on
    the repo object). Returns a deduplicated, sorted list of language strings.
    Using repo['language'] avoids N+1 API calls to the /languages endpoint.
    """
    seen = {repo["language"] for repo in repos if repo.get("language")}
    return sorted(seen)


def _extract_topics(repos: List[dict]) -> List[str]:
    """
    Flattens the 'topics' list from every repo into one deduplicated,
    sorted list. Topics are GitHub tags the repo owner applied manually.
    """
    all_topics: set = set()
    for repo in repos:
        all_topics.update(repo.get("topics", []))
    return sorted(all_topics)


def _top_skills(repos: List[dict]) -> List[str]:
    """
    Counts how many repos use each language, then returns the top
    TOP_SKILLS_COUNT most-used languages. Repos with no language are skipped.
    This is more meaningful than a flat unique list because it reflects depth.
    """
    counts = Counter(
        repo["language"] for repo in repos if repo.get("language")
    )
    return [lang for lang, _ in counts.most_common(TOP_SKILLS_COUNT)]


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def fetch_github_profile(username: str) -> GitHubProfile:
    """
    Fetches a user's public GitHub data and returns a populated GitHubProfile.
    Raises ValueError if the username doesn't exist, RuntimeError on API errors.
    Automatically saves the profile to SQLite via save_github_profile().
    """
    repos = _get_repos(username)

    profile = GitHubProfile(
        username=username,
        repos=[repo["name"] for repo in repos],
        languages=_extract_languages(repos),
        topics=_extract_topics(repos),
        top_skills=_top_skills(repos),
    )

    save_github_profile(profile)
    return profile


# ---------------------------------------------------------------------------
# Run directly to fetch and preview a GitHub profile
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python github_parser.py <github_username>")
        sys.exit(1)

    result = fetch_github_profile(sys.argv[1])

    print(f"\nUsername   : {result.username}")
    print(f"Repos      : {len(result.repos)}")
    print(f"Languages  : {', '.join(result.languages) or 'None found'}")
    print(f"Topics     : {', '.join(result.topics) or 'None found'}")
    print(f"Top Skills : {', '.join(result.top_skills) or 'None found'}")
