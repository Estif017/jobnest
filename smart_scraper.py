"""
smart_scraper.py — Live job search, auto-save, and AI scoring in one pipeline.

Give it a job title and location and it fetches real remote job listings from
RemoteOK's public API (no key required), saves any new ones to SQLite (skipping
duplicates by URL), and optionally scores each one against the user's stored
profile using ai_coach.py. Results are printed as a color-coded rich table and
the search run is logged to the search_sessions table. Pass score=False (or
--no-ai from the CLI) to skip AI entirely and just fetch and save jobs.
"""

import sys
from typing import List
from urllib.parse import quote_plus

import requests
from rich.console import Console
from rich.table import Table

from ai_coach import analyze_job, build_user_profile
from db_operations import add_job, search_jobs, get_job_by_url, save_search_session
from models import Job, ScoredJob, UserProfile

console = Console()     # Shared Rich console for all output in this file

REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs"
MAX_RESULTS      = 25       # Cap results per search to keep output manageable
REQUEST_TIMEOUT  = 15       # Seconds before giving up on the HTTP request

# Verdict → terminal color mapping for the rich table
VERDICT_COLORS = {
    "APPLY":    "green",
    "SKIP":     "yellow",
    "RED FLAG": "red",
}


# ---------------------------------------------------------------------------
# Search and parse
# ---------------------------------------------------------------------------

def _search_remotive(query: str) -> List[dict]:
    """
    Fetches remote job listings from Remotive's public API (no key required).
    Passes the query as a server-side search parameter so results are pre-filtered.
    Raises RuntimeError if the request fails.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }
    params = {"search": query, "limit": MAX_RESULTS}
    response = requests.get(REMOTIVE_API_URL, headers=headers, params=params, timeout=REQUEST_TIMEOUT)

    if response.status_code != 200:
        raise RuntimeError(f"Remotive API returned HTTP {response.status_code}.")

    data = response.json()
    jobs = data.get("jobs", [])

    results = []
    for job in jobs[:MAX_RESULTS]:
        import re
        description = re.sub(r"<[^>]+>", " ", job.get("description", "")).strip()[:500]
        results.append({
            "title":       job.get("title", ""),
            "company":     job.get("company_name", "Unknown"),
            "url":         job.get("url", ""),
            "description": description,
        })

    return results


# ---------------------------------------------------------------------------
# Deduplication and save
# ---------------------------------------------------------------------------

def _save_new_jobs(results: List[dict], user_id: int = 1) -> List[Job]:
    """
    Converts each raw result dict into a Job and saves it — but only if a job
    with the same URL isn't already in the database. Returns the list of newly
    saved Job objects (existing duplicates are not included in the return value).
    """
    new_jobs: List[Job] = []

    for r in results:
        if not r["url"]:
            continue    # Skip listings with no URL — can't deduplicate them

        if get_job_by_url(r["url"], user_id):
            continue    # Already in the tracker — skip

        job = Job(
            title=r["title"],
            company=r["company"],
            url=r["url"],
            notes=r["description"][:500],
        )

        if add_job(job, user_id):
            # Fetch back the saved row so we have the real database id
            saved = get_job_by_url(r["url"], user_id)
            if saved:
                new_jobs.append(saved)

    return new_jobs


# ---------------------------------------------------------------------------
# Scoring and ranking
# ---------------------------------------------------------------------------

def _score_jobs(jobs: List[Job], profile: UserProfile) -> List[ScoredJob]:
    """
    Runs AI analysis on each job and wraps the result in a ScoredJob.
    Jobs that fail to analyze are skipped with a warning rather than crashing.
    Returns the list sorted by fit_score descending (best match first).
    """
    scored: List[ScoredJob] = []

    for job in jobs:
        try:
            analysis = analyze_job(job, profile)
            scored.append(ScoredJob(
                job=job,
                fit_score=analysis.fit_score,
                reasons=analysis.fit_reasons,
                verdict=analysis.verdict,
            ))
        except Exception as e:
            console.print(f"[yellow]Warning: could not analyze '{job.title}' — {e}[/yellow]")

    return sorted(scored, key=lambda s: s.fit_score, reverse=True)


# ---------------------------------------------------------------------------
# Ranked output
# ---------------------------------------------------------------------------

def _print_ranked(scored: List[ScoredJob]) -> None:
    """
    Prints the scored job list as a color-coded rich table.
    Verdict column is colored: green for APPLY, yellow for SKIP, red for RED FLAG.
    """
    table = Table(title="JobNest — Ranked Results", show_lines=True)

    table.add_column("#",        style="dim",  width=4)
    table.add_column("Score",    justify="center", width=7)
    table.add_column("Verdict",  justify="center", width=10)
    table.add_column("Title",    style="bold", min_width=25)
    table.add_column("Company",  min_width=15)

    for rank, s in enumerate(scored, start=1):
        color   = VERDICT_COLORS.get(s.verdict, "white")
        verdict = f"[{color}]{s.verdict}[/{color}]"
        table.add_row(
            str(rank),
            f"{s.fit_score}/10",
            verdict,
            s.job.title,
            s.job.company,
        )

    console.print(table)


def _print_jobs(jobs: List[Job]) -> None:
    """
    Prints a plain job list as a rich table without AI scoring columns.
    Used when --no-ai is passed or when scoring is unavailable.
    """
    table = Table(title="JobNest — Search Results (unsorted)", show_lines=True)

    table.add_column("#",       style="dim", width=4)
    table.add_column("ID",      justify="center", width=5)
    table.add_column("Title",   style="bold", min_width=25)
    table.add_column("Company", min_width=15)
    table.add_column("Added",   width=12)

    for i, job in enumerate(jobs, start=1):
        table.add_row(str(i), str(job.id), job.title, job.company, job.date_added)

    console.print(table)


# ---------------------------------------------------------------------------
# Main orchestration function
# ---------------------------------------------------------------------------

def run_smart_search(query: str, location: str, score: bool = True, user_id: int = 1) -> List[ScoredJob]:
    """
    Full pipeline: fetch from RemoteOK → deduplicate and save → optionally score with AI
    → print table → log the session. Returns scored jobs (empty list if score=False).
    Pass score=False to skip AI entirely and just fetch + save jobs.
    """
    console.print(f"\n[bold]Searching Remotive:[/bold] {query!r} ...")

    try:
        results = _search_remotive(query)
    except RuntimeError as e:
        console.print(f"[red]Search failed:[/red] {e}")
        return []

    if not results:
        console.print("No jobs returned from Remotive for this query.")
        return []

    console.print(f"Found {len(results)} listing(s). Saving new ones ...")
    new_jobs = _save_new_jobs(results, user_id=user_id)

    if not new_jobs:
        console.print("All results already exist in your tracker.")
        existing = [get_job_by_url(r["url"], user_id) for r in results if r["url"]]
        _print_jobs([j for j in existing if j])
        return []

    if not score:
        # No-AI mode: just display and log what was saved
        _print_jobs(new_jobs)
        save_search_session(f"{query} in {location}", len(new_jobs), user_id=user_id)
        console.print(f"\n[dim]Saved {len(new_jobs)} job(s). Run 'analyze <id>' when AI is available.[/dim]")
        return []

    profile = build_user_profile(user_id=user_id)
    if profile is None:
        console.print("[yellow]No profile found — skipping AI scoring.[/yellow]")
        console.print("[dim]Run: python main.py parse-resume <path/to/resume.pdf>[/dim]")
        _print_jobs(new_jobs)
        save_search_session(f"{query} in {location}", len(new_jobs), user_id=user_id)
        return []

    console.print(f"Scoring {len(new_jobs)} new job(s) with AI ...")
    scored = _score_jobs(new_jobs, profile)

    _print_ranked(scored)

    save_search_session(f"{query} in {location}", len(new_jobs), user_id=user_id)

    return scored


# ---------------------------------------------------------------------------
# Run directly to search and score live jobs
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print('Usage: python smart_scraper.py "job title" "location"')
        sys.exit(1)

    run_smart_search(query=sys.argv[1], location=sys.argv[2])
