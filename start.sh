#!/bin/bash
python -m uvicorn api.main:app --reload --port 8000 &
cd frontend && npm run dev
