# XE3AGLE Deploy Guide

Path: **Neon (DB) → Render (API) → Vercel (frontend, root = `frontend`)**.

---

## 1. Database (Neon)

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the connection string (`postgresql://...`).
3. In Neon SQL Editor, paste and run the full contents of `backend/sql/schema.sql`.

---

## 2. API (Render)

1. Push this repo to GitHub.
2. On [render.com](https://render.com): **New → Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Environment variables (set in Render dashboard):

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET` | Long random string (32+ chars) |
| `FRONTEND_ORIGIN` | Your Vercel URL, e.g. `https://xe3agle.vercel.app` (comma-separate if multiple; include `http://localhost:3000` for local) |
| `NODE_ENV` | `production` |

5. Deploy. Copy the service URL, e.g. `https://xe3agle-api.onrender.com`.
6. Smoke test: open `https://YOUR-RENDER-HOST.onrender.com/api/health` — expect `{"ok":true,...}`.

Optional: deploy via Blueprint using root `render.yaml`.

---

## 3. Frontend (Vercel) — **Root Directory = `frontend`**

1. On [vercel.com](https://vercel.com): import the same GitHub repo.
2. **Root Directory:** `frontend` (important).
3. Framework Preset: Other (static files).
4. **Before first deploy**, edit **`frontend/vercel.json`** and replace the API host with your real Render URL:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-RENDER-HOST.onrender.com/api/:path*"
    }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    }
  ]
}
```

Example: if Render gives `https://xe3agle-api.onrender.com`, set destination to  
`https://xe3agle-api.onrender.com/api/:path*`.

5. Deploy. Open the Vercel URL → **Create free account** → use the full app flow.

> **Note:** With Vercel Root Directory = `frontend`, only `frontend/vercel.json` is used.  
> The root `vercel.json` is a copy for monorepo deploys; keep both in sync when you change the Render host.

6. After Vercel is live, set Render `FRONTEND_ORIGIN` to that Vercel URL and redeploy the API if needed (CORS).

---

## 4. Local development

```bash
# API
cd backend
cp .env.example .env
# Fill DATABASE_URL, JWT_SECRET, FRONTEND_ORIGIN=http://localhost:3000
npm install
npm start   # listens on :3001

# Frontend
cd frontend
# Point API at local backend (in browser console once, or edit app.html):
#   window.XE3AGLE_API_BASE = 'http://localhost:3001'
npx serve -p 3000
```

---

## 5. Tests

```bash
cd backend
npm install
npm test
npm run syntax
```

Both must exit 0 before you ship.

---

## 6. Live test checklist (run after deploy)

Do these on the **live** Vercel URL (phone or desktop):

1. **Auth** — Sign up with a new email → lands in app → refresh page → still logged in / data present.
2. **Prepare → Analysis** — Home → Prepare → pick mental state → **I Accept Today's Rules** → must open Analysis automatically.
3. **Analysis → Pre-Trade + bias lock** — Fill bias Bullish, try SHORT → blocked; set LONG + levels with RR ≥ 2 → Save → lands on Pre-Trade. Start Trade only when gates pass.
4. **Close → Review → Journal + balance** — Start trade → Close with WIN/LOSS + R → answer all 8 YES/NO → Complete Review → trade appears in Journal and Home balance updates.
5. **Account + mobile chrome** — Settings → create account with a typed name → switch works. On a phone: bottom nav only (no hamburger); **More** opens/closes the sheet; icons are large and tappable.

---

## Troubleshooting

- **CORS errors:** `FRONTEND_ORIGIN` on Render must include the exact Vercel origin (https, no trailing slash issues).
- **API 404 on Vercel:** `frontend/vercel.json` rewrite host is still the placeholder — replace it and redeploy.
- **Cold starts:** Free Render sleeps; first `/api` call after idle can take 30–60s.
- **Password reset:** Without SMTP, the reset link is printed in Render logs.
