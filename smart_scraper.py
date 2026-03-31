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

REMOTEOK_API_URL = "https://remoteok.com/api"
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

def _search_remoteok(query: str) -> List[dict]:
    """
    Fetches remote job listings from RemoteOK's public API (no key required).
    Pulls the full feed and filters client-side — RemoteOK's tag search is too
    narrow and returns zero results for common queries like "software engineer".
    Matches if any query keyword appears in the job title or tags.
    Raises RuntimeError if the request fails.
    """
    headers  = {"User-Agent": "JobNest/1.0 (job tracker application)"}
    response = requests.get(REMOTEOK_API_URL, headers=headers, timeout=REQUEST_TIMEOUT)

    if response.status_code != 200:
        raise RuntimeError(f"RemoteOK API returned HTTP {response.status_code}.")

    data = response.json()

    # First element is always API metadata, not a job — filter it out
    all_jobs = [item for item in data if isinstance(item, dict) and item.get("position")]

    # Filter: keep jobs where any query keyword matches title or tags (case-insensitive)
    keywords = [kw.lower() for kw in query.split()]
    matched  = []
    for job in all_jobs:
        searchable = (job.get("position", "") + " " + " ".join(job.get("tags", []))).lower()
        if any(kw in searchable for kw in keywords):
            matched.append(job)

    results = []
    for job in matched[:MAX_RESULTS]:
        results.append({
            "title":       job.get("position", ""),
            "company":     job.get("company", "Unknown"),
            "url":         job.get("url", ""),
            "description": " ".join(job.get("tags", [])),
        })

    return results


# ---------------------------------------------------------------------------
# Deduplication and save
# ---------------------------------------------------------------------------

def _save_new_jobs(results: List[dict]) -> List[Job]:
    """
    Converts each raw result dict into a Job and saves it — but only if a job
    with the same URL isn't already in the database. Returns the list of newly
    saved Job objects (existing duplicates are not included in the return value).
    """
    new_jobs: List[Job] = []

    for r in results:
        if not r["url"]:
            continue    # Skip listings with no URL — can't deduplicate them

        if get_job_by_url(r["url"]):
            continue    # Already in the tracker — skip

        job = Job(
            title=r["title"],
            company=r["company"],
            url=r["url"],
            notes=r["description"][:500],
        )

        if add_job(job):
            # Fetch back the saved row so we have the real database id
            saved = get_job_by_url(r["url"])
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

def run_smart_search(query: str, location: str, score: bool = True) -> List[ScoredJob]:
    """
    Full pipeline: fetch from RemoteOK → deduplicate and save → optionally score with AI
    → print table → log the session. Returns scored jobs (empty list if score=False).
    Pass score=False to skip AI entirely and just fetch + save jobs.
    """
    console.print(f"\n[bold]Searching RemoteOK:[/bold] {query!r} ...")

    try:
        results = _search_remoteok(query)
    except RuntimeError as e:
        console.print(f"[red]Search failed:[/red] {e}")
        return []

    if not results:
        console.print("No jobs returned from RemoteOK for this query.")
        return []

    console.print(f"Found {len(results)} listing(s). Saving new ones ...")
    new_jobs = _save_new_jobs(results)

    if not new_jobs:
        console.print("All results already exist in your tracker.")
        existing = [get_job_by_url(r["url"]) for r in results if r["url"]]
        _print_jobs([j for j in existing if j])
        return []

    if not score:
        # No-AI mode: just display and log what was saved
        _print_jobs(new_jobs)
        save_search_session(f"{query} in {location}", len(new_jobs))
        console.print(f"\n[dim]Saved {len(new_jobs)} job(s). Run 'analyze <id>' when AI is available.[/dim]")
        return []

    profile = build_user_profile()
    if profile is None:
        console.print("[yellow]No profile found — skipping AI scoring.[/yellow]")
        console.print("[dim]Run: python main.py parse-resume <path/to/resume.pdf>[/dim]")
        _print_jobs(new_jobs)
        save_search_session(f"{query} in {location}", len(new_jobs))
        return []

    console.print(f"Scoring {len(new_jobs)} new job(s) with Gemini ...")
    scored = _score_jobs(new_jobs, profile)

    _print_ranked(scored)

    save_search_session(f"{query} in {location}", len(new_jobs))

    return scored


# ---------------------------------------------------------------------------
# Run directly to search and score live jobs
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print('Usage: python smart_scraper.py "job title" "location"')
        sys.exit(1)

    run_smart_search(query=sys.argv[1], location=sys.argv[2])
