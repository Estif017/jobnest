from dataclasses import dataclass, field
from datetime import date


@dataclass
class Job:
    """
    Represents a single job application.
    Think of this as a blueprint — every job in the system will have these exact fields.
    Using a dataclass means Python writes __init__ and __repr__ for us automatically.
    """
    title: str                                          # Job title e.g. "Software Engineer"
    company: str                                        # Company name e.g. "Google"
    location: str = ""                                  # Optional — empty string if not provided
    url: str = ""                                       # Optional — link to the job posting
    status: str = "Saved"                               # Default status when first added
    notes: str = ""                                     # Optional — any personal notes
    date_added: str = field(default_factory=lambda: date.today().isoformat())  # Auto-fills today's date as "YYYY-MM-DD"
    id: int = 0                                         # 0 means not yet saved to the database; SQLite will assign a real id
