"""
ai_coach.py — AI-powered job fit analysis using Claude.

Give it a Job and the user's UserProfile and it returns a JobAnalysis: a fit
score from 1-10, a verdict (APPLY / SKIP / RED FLAG), a list of matched skills,
a list of skill gaps, bullet-point reasons, a confidence score, and a short
cover letter draft. Analysis results are saved to SQLite automatically so you
never have to re-call the API for the same job. The module also exposes
build_user_profile(), which loads and merges the stored resume and GitHub data
into the UserProfile the analysis needs as input.
"""

import json
import re
from typing import Optional

import anthropic
from dotenv import load_dotenv

from db_operations import load_profile, load_github_profile, save_analysis
from models import Job, GitHubProfile, UserProfile, JobAnalysis

load_dotenv()

# claude-haiku-4-5: fastest and most cost-efficient Claude model.
# Swap to claude-sonnet-4-6 for more nuanced analysis.
MODEL = "claude-haiku-4-5-20251001"

VERDICT_OPTIONS = ("APPLY", "SKIP", "RED FLAG")    # Constrained set for the prompt


# ---------------------------------------------------------------------------
# Profile builder
# ---------------------------------------------------------------------------

def build_user_profile() -> Optional[UserProfile]:
    """
    Loads the stored ResumeProfile and GitHubProfile from SQLite and merges
    them into a UserProfile. Returns None if no resume has been parsed yet.
    GitHub data is optional — an empty GitHubProfile is used if not present.
    """
    resume = load_profile()
    if resume is None:
        return None     # Can't build a profile without a resume

    github = load_github_profile()
    if github is None:
        # Use an empty placeholder so downstream code doesn't need to branch
        github = GitHubProfile(username="")

    # all_skills = union of resume skills + GitHub top skills (deduplicated)
    all_skills = sorted(set(resume.skills) | set(github.top_skills))

    return UserProfile(resume=resume, github=github, all_skills=all_skills)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_prompt(job: Job, profile: UserProfile) -> str:
    """
    Constructs the full prompt string sent to Gemini.
    Structured so the model always returns a JSON block wrapped in ```json ... ```
    for reliable parsing. All field names match the JobAnalysis dataclass.
    """
    skills_str     = ", ".join(profile.all_skills) or "None listed"
    experience_str = "\n".join(
        f"  - {e.title} at {e.company} ({e.years})"
        for e in profile.resume.experience
    ) or "  None listed"

    return f"""You are a job-fit coach analyzing whether a candidate is a good match for a job posting.

## Candidate Profile
Name: {profile.resume.name}
Skills: {skills_str}
Experience:
{experience_str}

## Job Posting
Title: {job.title}
Company: {job.company}
Location: {job.location or "Not specified"}
Notes/Description: {job.notes or "No description provided"}

## Your Task
Analyze how well this candidate fits the job. Respond ONLY with a JSON block in this exact format:

```json
{{
  "fit_score": <integer 1-10>,
  "verdict": "<APPLY|SKIP|RED FLAG>",
  "confidence": <float 0.0-1.0>,
  "fit_reasons": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "skills_matched": ["<skill>", "..."],
  "skill_gaps": ["<missing skill>", "..."],
  "cover_letter": "<2-3 sentence cover letter opening tailored to this role>"
}}
```

Rules:
- fit_score 8-10 = strong match, 5-7 = partial match, 1-4 = weak match
- verdict RED FLAG = job looks suspicious (e.g. unrealistic requirements, ghost job signs)
- confidence reflects how certain you are given the information available
- skill_gaps should only list skills that appear critical for this role
- cover_letter should reference the company name and at least one specific matched skill"""


# ---------------------------------------------------------------------------
# Response parser
# ---------------------------------------------------------------------------

def _parse_response(response_text: str, job_id: int) -> JobAnalysis:
    """
    Extracts the JSON block from Gemini's response and maps it to a JobAnalysis.
    Falls back to a zeroed-out analysis if JSON is missing or malformed,
    so a parse failure never crashes the calling code.
    """
    # Pull the content between ```json and ``` markers
    match = re.search(r"```json\s*(.*?)\s*```", response_text, re.DOTALL)
    if not match:
        print("Warning: could not find JSON block in Gemini response. Storing empty analysis.")
        return JobAnalysis(job_id=job_id)

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError as e:
        print(f"Warning: JSON parse error — {e}. Storing empty analysis.")
        return JobAnalysis(job_id=job_id)

    # Clamp verdict to the allowed set; default to SKIP if model goes off-script
    verdict = data.get("verdict", "SKIP")
    if verdict not in VERDICT_OPTIONS:
        verdict = "SKIP"

    return JobAnalysis(
        job_id=job_id,
        fit_score=int(data.get("fit_score", 0)),
        verdict=verdict,
        confidence=float(data.get("confidence", 0.0)),
        fit_reasons=data.get("fit_reasons", []),
        skills_matched=data.get("skills_matched", []),
        skill_gaps=data.get("skill_gaps", []),
        cover_letter=data.get("cover_letter", ""),
    )


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

def analyze_job(job: Job, profile: UserProfile) -> JobAnalysis:
    """
    Sends the job and user profile to Gemini and returns a JobAnalysis.
    Automatically saves the result to SQLite via save_analysis().
    Raises RuntimeError if GEMINI_API_KEY is not set.
    """
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env automatically
    prompt = _build_prompt(job, profile)

    response      = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    response_text = response.content[0].text
    analysis      = _parse_response(response_text, job.id)

    save_analysis(analysis)
    return analysis


# ---------------------------------------------------------------------------
# Run directly to analyze a saved job
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    from db_operations import get_job_by_id

    if len(sys.argv) < 2:
        print("Usage: python ai_coach.py <job_id>")
        sys.exit(1)

    job_id = int(sys.argv[1])
    job    = get_job_by_id(job_id)

    if job is None:
        print(f"No job found with id {job_id}.")
        sys.exit(1)

    profile = build_user_profile()
    if profile is None:
        print("No resume profile found. Run: python resume_parser.py <path/to/resume.pdf>")
        sys.exit(1)

    result = analyze_job(job, profile)

    print(f"\nJob      : {job.title} @ {job.company}")
    print(f"Score    : {result.fit_score}/10")
    print(f"Verdict  : {result.verdict}")
    print(f"Confidence: {result.confidence:.0%}")
    print(f"\nMatched  : {', '.join(result.skills_matched) or 'None'}")
    print(f"Gaps     : {', '.join(result.skill_gaps) or 'None'}")
    print(f"\nReasons:")
    for r in result.fit_reasons:
        print(f"  - {r}")
    print(f"\nCover Letter Opening:\n  {result.cover_letter}")
