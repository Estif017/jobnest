"""
cli.py — Command-line interface for JobNest.

This is the only file the user directly interacts with. It defines nine commands
via argparse: the original five (add, list, update, delete, search) plus four
new AI-powered ones (parse-resume, fetch-github, analyze, search-live). Each
command parses terminal input and dispatches to the appropriate module — either
db_operations for basic CRUD, resume_parser or github_parser for profile loading,
ai_coach for job scoring, or smart_scraper for live search. This file never writes
SQL itself; it only orchestrates calls into the other modules.
"""

import argparse
from database import init_db
from models import Job
from db_operations import (
    add_job,
    get_all_jobs,
    get_job_by_id,
    update_job,
    delete_job,
    search_jobs,
    load_analysis,
    VALID_STATUSES,
)

DATE_FORMAT = "YYYY-MM-DD"      # Used in help text so the user knows how to format dates


def _print_job(job: Job) -> None:
    """
    Prints a single Job object to the terminal in a readable format.
    Prefixed with _ to signal this is an internal helper — not called from outside this file.
    """
    print(f"[{job.id}] {job.title} @ {job.company}")
    print(f"    Status   : {job.status}")
    print(f"    Location : {job.location or 'N/A'}")
    print(f"    URL      : {job.url or 'N/A'}")
    print(f"    Added    : {job.date_added}")
    print(f"    Notes    : {job.notes or 'None'}")
    print()


def handle_add(args: argparse.Namespace) -> None:
    """
    Handles the 'add' command.
    Builds a Job object from the CLI arguments and saves it to the database.
    Prints a confirmation message with the job details on success.
    """
    job = Job(
        title=args.title,
        company=args.company,
        location=args.location or "",
        url=args.url or "",
        status=args.status or "Saved",
        notes=args.notes or "",
    )

    if add_job(job):
        print(f"Added: {job.title} at {job.company}")
    else:
        print("Error: could not save job. Check your input and try again.")


def handle_list(args: argparse.Namespace) -> None:
    """
    Handles the 'list' command.
    Fetches all jobs from the database and prints them.
    Shows a friendly message if no jobs have been added yet.
    """
    jobs = get_all_jobs()

    if not jobs:
        print("No jobs saved yet. Use 'add' to add your first job.")
        return

    print(f"\n{len(jobs)} job(s) found:\n")
    for job in jobs:
        _print_job(job)


def handle_update(args: argparse.Namespace) -> None:
    """
    Handles the 'update' command.
    Collects only the fields the user provided and updates that job by id.
    Ignores fields that were not passed — leaves them unchanged in the database.
    """
    fields = {}     # Build a dict of only the fields the user actually provided

    if args.title:
        fields["title"] = args.title
    if args.company:
        fields["company"] = args.company
    if args.status:
        fields["status"] = args.status
    if args.notes:
        fields["notes"] = args.notes
    if args.location:
        fields["location"] = args.location
    if args.url:
        fields["url"] = args.url

    if not fields:
        print("Nothing to update. Pass at least one field to change.")
        return

    if update_job(args.id, **fields):   # ** unpacks the dict into keyword arguments
        print(f"Updated job {args.id}.")
    else:
        print(f"Error: no job found with id {args.id}.")


def handle_delete(args: argparse.Namespace) -> None:
    """
    Handles the 'delete' command.
    Asks for confirmation before permanently removing a job by id.
    """
    job = get_job_by_id(args.id)

    if job is None:
        print(f"Error: no job found with id {args.id}.")
        return

    confirm = input(f"Delete '{job.title}' at {job.company}? (y/n): ").strip().lower()

    if confirm == "y":
        delete_job(args.id)
        print("Deleted.")
    else:
        print("Cancelled.")


def handle_search(args: argparse.Namespace) -> None:
    """
    Handles the 'search' command.
    Searches by keyword and/or status, then prints matching jobs.
    """
    results = search_jobs(keyword=args.keyword or "", status=args.status or "")

    if not results:
        print("No jobs matched your search.")
        return

    print(f"\n{len(results)} job(s) found:\n")
    for job in results:
        _print_job(job)


def handle_parse_resume(args: argparse.Namespace) -> None:
    """
    Handles the 'parse-resume' command.
    Parses the PDF at the given path and saves the profile to SQLite.
    Prints a summary of what was extracted.
    """
    # Import here to avoid loading pdfplumber until it's actually needed
    from resume_parser import parse_resume

    try:
        profile = parse_resume(args.path)
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}")
        return

    print(f"\nProfile saved for: {profile.name}")
    print(f"Skills     : {', '.join(profile.skills) or 'None found'}")
    print(f"Experience : {len(profile.experience)} entries")
    print(f"Education  : {len(profile.education)} entries")


def handle_fetch_github(args: argparse.Namespace) -> None:
    """
    Handles the 'fetch-github' command.
    Fetches the given GitHub username's public profile and saves it to SQLite.
    Prints a summary of what was fetched.
    """
    from github_parser import fetch_github_profile

    try:
        profile = fetch_github_profile(args.username)
    except (ValueError, RuntimeError) as e:
        print(f"Error: {e}")
        return

    print(f"\nGitHub profile saved for: {profile.username}")
    print(f"Repos      : {len(profile.repos)}")
    print(f"Languages  : {', '.join(profile.languages) or 'None found'}")
    print(f"Top Skills : {', '.join(profile.top_skills) or 'None found'}")


def handle_analyze(args: argparse.Namespace) -> None:
    """
    Handles the 'analyze' command.
    Scores an existing job against the stored user profile using Claude.
    If a saved analysis already exists for this job, shows it without re-calling the API.
    """
    from rich.console import Console
    from ai_coach import analyze_job, build_user_profile

    console = Console()

    job = get_job_by_id(args.id)
    if job is None:
        print(f"Error: no job found with id {args.id}.")
        return

    profile = build_user_profile()
    if profile is None:
        print("No profile found. Run: python main.py parse-resume <path/to/resume.pdf>")
        return

    # Use cached result if available, to avoid burning API credits unnecessarily
    if not args.refresh:
        cached = load_analysis(args.id)
        if cached:
            console.print(f"\n[dim](Showing cached analysis — use --refresh to re-run)[/dim]")
            _print_analysis(cached, job, console)
            return

    result = analyze_job(job, profile)
    _print_analysis(result, job, console)


def _print_analysis(analysis, job, console) -> None:
    """
    Prints a JobAnalysis to the terminal using Rich formatting.
    Separated from handle_analyze so it can be called for both cached and fresh results.
    """
    from rich.panel import Panel

    verdict_color = {"APPLY": "green", "SKIP": "yellow", "RED FLAG": "red"}.get(
        analysis.verdict, "white"
    )

    console.print(f"\n[bold]{job.title}[/bold] @ {job.company}")
    console.print(f"Score   : [bold]{analysis.fit_score}/10[/bold]  |  "
                  f"Verdict : [{verdict_color}]{analysis.verdict}[/{verdict_color}]  |  "
                  f"Confidence: {analysis.confidence:.0%}")

    if analysis.skills_matched:
        console.print(f"\n[green]Matched :[/green] {', '.join(analysis.skills_matched)}")
    if analysis.skill_gaps:
        console.print(f"[red]Gaps    :[/red] {', '.join(analysis.skill_gaps)}")

    if analysis.fit_reasons:
        console.print("\n[bold]Reasons:[/bold]")
        for r in analysis.fit_reasons:
            console.print(f"  • {r}")

    if analysis.cover_letter:
        console.print(Panel(analysis.cover_letter, title="Cover Letter Opening", expand=False))


def handle_search_live(args: argparse.Namespace) -> None:
    """
    Handles the 'search-live' command.
    Runs a live Indeed search, saves new jobs, and scores them with Claude.
    """
    from smart_scraper import run_smart_search

    run_smart_search(query=args.query, location=args.location, score=not args.no_ai)


def build_parser() -> argparse.ArgumentParser:
    """
    Builds and returns the full argument parser with all subcommands.
    Keeping this in its own function makes it easy to test the parser separately from running it.
    """
    parser = argparse.ArgumentParser(
        prog="jobnest",
        description="Track your job applications from the command line."
    )

    subparsers = parser.add_subparsers(dest="command")  # dest="command" stores which subcommand was used

    # --- add ---
    add_parser = subparsers.add_parser("add", help="Add a new job")
    add_parser.add_argument("--title",    required=True,  help="Job title")
    add_parser.add_argument("--company",  required=True,  help="Company name")
    add_parser.add_argument("--location", help="Job location")
    add_parser.add_argument("--url",      help="Link to the job posting")
    add_parser.add_argument("--status",   choices=VALID_STATUSES, help="Application status")
    add_parser.add_argument("--notes",    help="Any personal notes")

    # --- list ---
    subparsers.add_parser("list", help="List all saved jobs")

    # --- update ---
    update_parser = subparsers.add_parser("update", help="Update a job by id")
    update_parser.add_argument("id",        type=int, help="The id of the job to update")
    update_parser.add_argument("--title",   help="New title")
    update_parser.add_argument("--company", help="New company")
    update_parser.add_argument("--status",  choices=VALID_STATUSES, help="New status")
    update_parser.add_argument("--notes",   help="New notes")
    update_parser.add_argument("--location",help="New location")
    update_parser.add_argument("--url",     help="New URL")

    # --- delete ---
    delete_parser = subparsers.add_parser("delete", help="Delete a job by id")
    delete_parser.add_argument("id", type=int, help="The id of the job to delete")

    # --- search ---
    search_parser = subparsers.add_parser("search", help="Search jobs by keyword or status")
    search_parser.add_argument("--keyword", help="Search in title, company, or notes")
    search_parser.add_argument("--status",  choices=VALID_STATUSES, help="Filter by status")

    # --- parse-resume ---
    pr_parser = subparsers.add_parser("parse-resume", help="Parse a PDF resume and save your profile")
    pr_parser.add_argument("path", help="Path to your resume PDF")

    # --- fetch-github ---
    fg_parser = subparsers.add_parser("fetch-github", help="Fetch and save your GitHub profile")
    fg_parser.add_argument("username", help="Your GitHub username")

    # --- analyze ---
    an_parser = subparsers.add_parser("analyze", help="Score a saved job with AI")
    an_parser.add_argument("id", type=int, help="The id of the job to analyze")
    an_parser.add_argument(
        "--refresh", action="store_true",
        help="Re-run the analysis even if a cached result exists"
    )

    # --- search-live ---
    sl_parser = subparsers.add_parser("search-live", help="Search Indeed and score results with AI")
    sl_parser.add_argument("--query",    required=True, help="Job title or keywords to search for")
    sl_parser.add_argument("--location", required=True, help='Location or "remote"')
    sl_parser.add_argument("--no-ai",    action="store_true", dest="no_ai",
                           help="Fetch and save jobs without AI scoring")

    return parser


def run_cli() -> None:
    """
    Entry point for the CLI. Builds the parser, reads the user's command, and
    dispatches to the right handler function. Prints help if no command is given.
    """
    init_db()   # Always ensure the database and tables exist before any command runs

    parser = build_parser()
    args = parser.parse_args()

    # Map each command string to its handler function
    command_map = {
        "add":          handle_add,
        "list":         handle_list,
        "update":       handle_update,
        "delete":       handle_delete,
        "search":       handle_search,
        "parse-resume": handle_parse_resume,
        "fetch-github": handle_fetch_github,
        "analyze":      handle_analyze,
        "search-live":  handle_search_live,
    }

    if args.command in command_map:
        command_map[args.command](args)     # Call the right handler with the parsed args
    else:
        parser.print_help()                 # No command given — show help text
