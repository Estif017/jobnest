# JobNest — Dev Setup

## Running the backend

```bash
uvicorn api.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

## Running the frontend

```bash
cd frontend && npm run dev
```

App: http://localhost:3000

## Running both at once

```bash
bash start.sh
```

## Required environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `GEMINI_API_KEY` | `.env` (project root) | AI analysis |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | Points frontend at backend |

## `.env` (project root)

```
GEMINI_API_KEY=your_key_here
```

## `frontend/.env.local`

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
