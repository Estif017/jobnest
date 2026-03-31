"""
main.py — Entry point for JobNest.

This is the only file you need to run. It calls run_cli() from cli.py,
which handles database setup, argument parsing, and dispatching commands.
Run the app with: python main.py <command> [options]
Examples:
    python main.py add --title "Engineer" --company "Google"
    python main.py list
    python main.py update 1 --status "Applied"
    python main.py search --keyword "engineer"
    python main.py delete 1
"""

from cli import run_cli

if __name__ == "__main__":
    run_cli()   # __name__ == "__main__" ensures this only runs when the file is executed directly,
                # not when it's imported by another module
