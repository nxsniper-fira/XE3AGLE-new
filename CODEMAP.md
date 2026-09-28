# XE3AGLE CODEMAP

## Product flow
Home → Prepare → Analysis → Pre-Trade → Active → **mandatory Review** → Journal

## Frontend (`frontend/`)

| Concern | Path |
|--------|------|
| Landing / login / reset | `index.html`, `login.html`, `reset.html` |
| App shell + mobile nav / More sheet | `app.html`, `js/app.js` |
| CSS themes (black/blue) | `css/app.css` |
| Stages, risk defaults, account bag factory | `js/domain/constants.js` |
| Risk math + `canStartTrade` gates | `js/domain/risk.js` |
| State, multi-account isolation, migrate, privacy money | `js/domain/state.js` |
| KPIs, streaks, calendar, filters, clean/violations | `js/domain/stats.js` |
| API client | `js/services/api.js` |
| Cloud sync + conflict | `js/services/sync.js` |
| Workflow (accept → analysis → trade → **completeReview only journal write**) | `js/workflow/trade.js` |
| All page UIs (journal, analytics/calendar, settings accounts) | `js/ui/pages.js` |
| Money mask helper | `js/ui/money.js` |
| Toasts / icons | `js/ui/toast.js`, `js/ui/icons.js` |
| PWA | `manifest.json`, `sw.js` |

### Multi-account
- Bags live in `state.accounts[id]` (trades, equity, prep, analysis, activeTrade, pendingReview, risk)
- Helpers: `getActiveAccount`, `patchActive`, `createAccount`, `switchAccount`, `renameAccount`, `archiveAccount`
- Sync uses `activeAccountId` via `services/sync.js`

### Journal / calendar / stats
- Filters + detail + tags + export: `ui/pages.js` → `renderJournal`
- Month grid + day drill-in: `renderAnalytics` + `domain/stats.js` → `calendarMonth`
- KPIs / equity curve SVG: `domain/stats.js` → `computeKPIs`, `equityCurveSVG`

### Privacy
- `hideBalance` on root state; `formatMoney` / `ui/money.js` masks `$` amounts only (not R / %)

## Backend (`backend/`)

| Concern | Path |
|--------|------|
| Server | `src/server.js` |
| Auth | `src/routes/auth.js` |
| State GET/PUT | `src/routes/state.js` |
| JWT / bcrypt | `src/utils/auth.js` |
| PG pool | `src/utils/db.js` |
| Schema | `sql/schema.sql` |
| Tests | `tests/risk.test.js`, `tests/stats.test.js` |

## Deploy
- `DEPLOY.md` — Neon → Render → Vercel (root = `frontend`)
- `frontend/vercel.json` — set Render host before deploy
