"""
resume_parser.py — Extracts structured data from a PDF resume.

Give it a path to your resume PDF and it returns a ResumeProfile dataclass
containing your name, skills, work experience, and education. The parsed
profile is automatically saved to SQLite so the rest of the app can use it
without re-parsing the PDF every time.

Usage:
    python resume_parser.py path/to/resume.pdf
"""

import re
import pdfplumber
from typing import List, Tuple
from models import ResumeProfile, ExperienceEntry, EducationEntry
from db_operations import save_profile, load_profile

# ---------------------------------------------------------------------------
# Constants — all magic strings and lists live here, not buried in functions
# ---------------------------------------------------------------------------

SKILLS_KEYWORDS: List[str] = [
    # Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "r", "matlab",
    # Web
    "html", "css", "react", "vue", "angular", "next.js", "node.js", "django",
    "flask", "fastapi", "express", "tailwind",
    # Data / AI
    "sql", "postgresql", "mysql", "sqlite", "mongodb", "redis",
    "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "keras",
    "machine learning", "deep learning", "nlp", "data analysis",
    # DevOps / Cloud
    "git", "docker", "kubernetes", "aws", "azure", "gcp", "linux",
    "ci/cd", "terraform", "jenkins", "github actions",
    # Soft / Process
    "agile", "scrum", "rest api", "graphql", "microservices", "tdd",
]

DEGREE_KEYWORDS: Tuple[str, ...] = (
    "bachelor", "master", "phd", "doctorate", "associate",
    "b.s.", "m.s.", "b.a.", "m.a.", "mba", "b.eng", "m.eng",
)

# Regex that matches year ranges like "2020 - 2023", "Jan 2019 – Present", "2018–2022"
YEAR_PATTERN = re.compile(
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?\d{4}\s*[-–—]\s*(present|\d{4})",
    re.IGNORECASE,
)

MIN_NAME_WORDS = 2      # A name must be at least two words
MAX_NAME_WORDS = 5      # A name is unlikely to be more than five words
MAX_README_CHARS = 200  # Used by github_parser later — defined once here for consistency


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(file_path: str) -> str:
    """
    Opens a PDF file and extracts all text from every page as one string.
    pdfplumber handles the low-level PDF parsing — we just join the pages.
    Returns an empty string if the file can't be read.
    """
    try:
        with pdfplumber.open(file_path) as pdf:
            # Extract text from each page, filter out None (blank pages), join with newline
            pages = [page.extract_text() for page in pdf.pages]
            return "\n".join(p for p in pages if p)
    except Exception:
        return ""   # Return empty string rather than crashing — caller checks for this


# ---------------------------------------------------------------------------
# Field extractors — each pulls one type of data from the raw text
# ---------------------------------------------------------------------------

def _extract_name(text: str) -> str:
    """
    Guesses the person's name from the first few non-empty lines of the resume.
    Most resumes start with the applicant's name before contact info or sections.
    Returns 'Unknown' if no plausible name is found.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for line in lines[:5]:  # Only look at the first 5 lines — name is always near the top
        words = line.split()
        # A name-like line has 2-5 words, all capitalized, and no digits (not a phone number)
        if MIN_NAME_WORDS <= len(words) <= MAX_NAME_WORDS:
            if all(w[0].isupper() for w in words if w.isalpha()) and not any(c.isdigit() for c in line):
                return line

    return "Unknown"


def _extract_skills(text: str) -> List[str]:
    """
    Scans the full resume text for known skill keywords and returns those that appear.
    Matching is case-insensitive. Returns a deduplicated, sorted list.
    """
    text_lower = text.lower()
    return sorted({skill for skill in SKILLS_KEYWORDS if skill in text_lower})
    # Set comprehension {x for x in ...} deduplicates automatically; sorted() makes output consistent


def _extract_experience(text: str) -> List[ExperienceEntry]:
    """
    Finds blocks of text that look like job entries — lines near a year range pattern.
    For each year range found, it looks at the surrounding lines to guess the job title and company.
    Returns a list of ExperienceEntry objects. Imperfect — resume formats vary too much for perfection.
    """
    entries: List[ExperienceEntry] = []
    lines = text.splitlines()

    for i, line in enumerate(lines):
        if not YEAR_PATTERN.search(line):   # Skip lines that don't contain a year range
            continue

        years = YEAR_PATTERN.search(line).group()   # The matched year range string

        # Look at the line itself and the two lines above it for title/company info
        context_lines = [lines[j].strip() for j in range(max(0, i - 2), i + 1) if lines[j].strip()]
        context_lines = [l for l in context_lines if not YEAR_PATTERN.search(l)]  # Remove the year line itself

        title   = context_lines[0] if len(context_lines) > 0 else ""
        company = context_lines[1] if len(context_lines) > 1 else ""

        if title:   # Only add if we found at least a title
            entries.append(ExperienceEntry(title=title, company=company, years=years))

    return entries


def _extract_education(text: str) -> List[EducationEntry]:
    """
    Finds lines that contain degree keywords (bachelor, master, phd, etc.)
    and treats the surrounding lines as institution and year info.
    Returns a list of EducationEntry objects.
    """
    entries: List[EducationEntry] = []
    lines = text.splitlines()

    for i, line in enumerate(lines):
        line_lower = line.lower()
        if not any(kw in line_lower for kw in DEGREE_KEYWORDS):    # Skip if no degree keyword
            continue

        degree      = line.strip()
        institution = lines[i + 1].strip() if i + 1 < len(lines) else ""
        year_match  = YEAR_PATTERN.search(line) or (
            YEAR_PATTERN.search(institution) if institution else None
        )
        year = year_match.group() if year_match else ""

        entries.append(EducationEntry(degree=degree, institution=institution, year=year))

    return entries


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

def parse_resume(file_path: str) -> ResumeProfile:
    """
    Parses a PDF resume at the given file path and returns a ResumeProfile.
    Extracts name, skills, experience, and education from the raw text.
    Automatically saves the result to SQLite — future calls can use load_profile()
    instead of re-parsing the PDF.
    Raises FileNotFoundError if the path doesn't exist.
    """
    text = extract_text_from_pdf(file_path)

    if not text:
        raise ValueError(f"Could not extract text from: {file_path}. Is it a valid PDF?")

    profile = ResumeProfile(
        name=_extract_name(text),
        skills=_extract_skills(text),
        experience=_extract_experience(text),
        education=_extract_education(text),
        raw_text=text,
    )

    save_profile(profile)   # Persist to SQLite so we never need to re-parse
    return profile


# ---------------------------------------------------------------------------
# Run directly to parse and preview a resume
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python resume_parser.py path/to/resume.pdf")
        sys.exit(1)

    result = parse_resume(sys.argv[1])

    print(f"\nName       : {result.name}")
    print(f"Skills     : {', '.join(result.skills) or 'None found'}")
    print(f"Experience : {len(result.experience)} entries")
    for exp in result.experience:
        print(f"  - {exp.title} @ {exp.company} ({exp.years})")
    print(f"Education  : {len(result.education)} entries")
    for edu in result.education:
        print(f"  - {edu.degree} | {edu.institution} ({edu.year})")
