# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

JobNest is an AI-powered job application tracker. It is a full-stack web app:
- **Backend**: FastAPI (Python) serving a REST API, backed by SQLite
- **Frontend**: Next.js 14 (App Router) with TypeScript and Tailwind CSS
- **AI**: Anthropic Claude for analysis, coaching, agentic tool use, and writing
- **Search**: Tavily API for agentic web search
- **Auth**: NextAuth v4 with Credentials + Google OAuth

## Running the app

### Backend (FastAPI)
```bash
# From project root
python -m uvicorn api.main:app --reload --port 8000
```
Starts on http://localhost:8000. Auto-reloads on file changes.

### Frontend (Next.js)
```bash
cd frontend
npm run dev
```
Starts on http://localhost:3000.

### Environment variables (.env in project root)
```
ANTHROPIC_API_KEY=...
TAVILY_API_KEY=...
EMAIL_SENDER=your_gmail@gmail.com
EMAIL_PASSWORD=your_app_password   # Gmail App Password
EMAIL_RECEIVER=your_email@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Architecture

```
frontend (Next.js)
    ↓ HTTP (fetch via frontend/lib/api.ts)
api/main.py (FastAPI)
    ↓
db_operations.py → database.py → jobnest.db (SQLite)
    ↓
ai_coach.py       → Anthropic Claude
smart_scraper.py  → RemoteOK API
github_parser.py  → GitHub API
api/scheduler.py  → APScheduler (background jobs)
```

## Key files

| File | Responsibility |
|------|---------------|
| `database.py` | Sole owner of `DB_NAME` and `get_connection()`. Creates all tables. |
| `models.py` | All dataclasses: `Job`, `ResumeProfile`, `UserProfile`, `ScoredJob`, `JobAnalysis` |
| `db_operations.py` | The only file that writes SQL. All CRUD, search, and persistence. |
| `api/main.py` | FastAPI app. Thin wrappers around db_operations / ai_coach. No SQL here. |
| `api/auth_routes.py` | Registration, login, Google OAuth upsert, password change. |
| `api/scheduler.py` | APScheduler background job — hunts RemoteOK every 24h, scores, emails + notifies. |
| `api/schemas.py` | Pydantic request/response models. Mirrors TypeScript interfaces 1-to-1. |
| `ai_coach.py` | `analyze_job()` and `build_user_profile()`. All Claude calls for scoring. |
| `smart_scraper.py` | Fetches RemoteOK, deduplicates, saves new jobs, scores with AI. |
| `resume_parser.py` | Extracts name/skills/experience/education from PDF via pdfplumber. |
| `github_parser.py` | Fetches public GitHub profile and saves to DB. |
| `frontend/lib/api.ts` | All frontend HTTP calls. Never inline fetch in components — add here. |
| `frontend/components/Sidebar.tsx` | Sidebar nav + notification bell (polls /notifications every 30s). |

## Database tables

| Table | Purpose |
|-------|---------|
| `jobs` | Core job tracker rows |
| `users` | Auth accounts (email + Google OAuth) |
| `user_profile` | Resume data + onboarding fields (target_role, location, etc.) |
| `github_profile` | Fetched GitHub profile |
| `ai_analyses` | Claude fit scores, verdicts, cover letters |
| `interview_preps` | Auto-generated prep packs (triggered on status → Interviewing) |
| `notifications` | In-app alerts from the background hunter |
| `chat_history` | AI Coach conversation history |
| `search_sessions` | Log of every RemoteOK scrape run |

`migrate_db()` in `database.py` adds new columns safely on every startup — never drops data.

## Agentic features

### Company Intelligence (`GET /jobs/{id}/company-news`)
Auto-fetches on job detail page load. Calls Tavily → Claude summarizes into 3 bullets.

### Agent Analyze (`POST /jobs/{id}/agent-analyze`)
Claude Tool Use loop. Claude receives `search_web` tool and decides when/what to search. Returns analysis + tool call log.

### Agent Produce (`POST /jobs/{id}/agent-produce`)
Claude receives `search_web` + `get_candidate_profile` tools. Decides on its own to read the resume and search the web, then writes a tailored resume summary + 3-paragraph cover letter.

### Interview Prep Pack (`POST /jobs/{id}/interview-prep`)
**Triggered automatically** when job status changes to "Interviewing" — no button. Claude generates 5 questions with tailored answers, 3 research topics, and 1 smart question to ask. Saved to DB so page reloads are instant.

### Background Hunter (`api/scheduler.py`)
APScheduler fires every 24 hours. For each user: reads `target_role` from onboarding → scrapes RemoteOK → scores with Claude → creates a notification + sends email for any job scoring ≥ 7/10.

Test without waiting 24h: `POST /scheduler/run-now`
Check status: `GET /scheduler/status`

## API endpoint map

```
GET  /health
GET  /dashboard/stats
GET  /jobs                          list all
POST /jobs                          create
GET  /jobs/{id}                     get one
PUT  /jobs/{id}                     update
DELETE /jobs/{id}                   delete
GET  /jobs/search?keyword=&status=

POST /jobs/{id}/analyze             AI fit analysis (Claude)
GET  /jobs/{id}/analysis            load saved analysis
GET  /jobs/{id}/company-news        Tavily → Claude bullets
POST /jobs/{id}/agent-analyze       Claude Tool Use — agentic analysis
POST /jobs/{id}/agent-produce       Claude Tool Use — resume summary + cover letter
POST /jobs/{id}/interview-prep      generate prep pack (auto-called on Interviewing)
GET  /jobs/{id}/interview-prep      load saved prep pack

POST /scrape                        RemoteOK live scrape + score

GET  /notifications                 list + unread count
POST /notifications/read-all        mark all read
POST /notifications/{id}/read       mark one read

GET  /scheduler/status              next run time
POST /scheduler/run-now             trigger hunt immediately

POST /auth/register
POST /auth/login
POST /auth/google
POST /auth/onboarding-complete
GET  /auth/me
POST /auth/change-password

POST /parse-resume                  upload PDF, extract profile
GET  /github                        load saved GitHub profile
POST /github/fetch                  fetch from GitHub API

GET  /coach/history
POST /coach/chat

GET  /onboarding/data
POST /onboarding/save
```

## Python compatibility

Runtime is **Python 3.9**. Use `Optional[str]` not `str | None`. Use `List[...]` from `typing` not `list[...]`.

## Key conventions

- All SQL lives in `db_operations.py`. No SQL in `api/main.py` or anywhere else.
- All HTTP calls from the frontend live in `frontend/lib/api.ts`. No inline `fetch` in components.
- New Pydantic schemas go in `api/schemas.py` and mirror the Python dataclasses exactly.
- `migrate_db()` handles new columns — never drop tables or columns.
- Use `claude-sonnet-4-6` for writing/production tasks, `claude-haiku-4-5-20251001` for fast/cheap tasks.
