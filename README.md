# XE3AGLE

**Discipline over impulse**

Personal trading discipline + journal system. Not a broker, not a charting platform, not a signal service.

## Core loop

Home → Prepare → Analysis → Pre-Trade Check → Active Trade → **Post-Trade Review (mandatory)** → Journal

## Stack

- Frontend: static HTML/CSS/vanilla JS, PWA
- Backend: Node + Express + Postgres (Neon)
- Auth: JWT + bcrypt
- Deploy: Vercel (frontend) + Render (API) + Neon (DB)

## Quick start

```bash
# Tests
cd backend && npm install && npm test

# API (needs DATABASE_URL)
cp backend/.env.example backend/.env
# edit .env, then:
cd backend && npm start

# Frontend
cd frontend && npx serve -p 3000
# set window.XE3AGLE_API_BASE = 'http://localhost:3001' if API is separate
```

See **DEPLOY.md** for production setup and **CODEMAP.md** for where to edit code.

## Features

- Forced workflow with auto-advance
- Bias → direction lock (Bullish = LONG only)
- Live risk calculator
- Pre-trade gates (rules, RR, daily limits, consecutive losses…)
- Mandatory post-trade YES/NO review before journal
- Multi-account, Black/Blue themes, offline-first + cloud sync
- Mobile-first bottom nav + More sheet; desktop sidebar
