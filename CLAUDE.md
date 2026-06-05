# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

**Development (local):**
```bash
# Backend — from backend/ directory, with venv activated
python -m uvicorn main:app --host 0.0.0.0 --port 8002

# Frontend — serve statically (e.g. via Live Server or any HTTP server on port 8080)
```

**Docker (development, exposes ports directly):**
```bash
docker-compose -f docker-compose-d.yml up -d --build
```

**Docker (production, uses external nginx-proxy network `red_produccion`):**
```bash
docker-compose up -d --build
```

The production compose file assumes an external Docker network `red_produccion` (managed by an nginx-proxy + letsencrypt container). The dev compose file uses `base_red_pme` and exposes `FRONTEND_PORT` and `BACKEND_PORT` from `.env`.

## Architecture Overview

### Backend (FastAPI + SQLAlchemy + MariaDB)

Entry point: `backend/main.py`. On startup it:
1. Runs inline auto-migration functions (adds columns if missing, generates UUIDs, etc.) — new schema changes follow this same pattern rather than using a migration framework.
2. Creates all tables via `Base.metadata.create_all`.
3. Starts APScheduler for two cron jobs: SQL backup (Fridays 18:00 Chile) and weekly report email (Mondays 16:00 Chile).

Routers live in `backend/routers/` and are prefixed as: `/auth`, `/colegios`, `/niveles`, `/cursos`, `/asignaturas`, `/docentes`, `/dimensiones`, `/evaluaciones`, `/config`, `/totp`, `/eval_plantillas`.

Auth is JWT (HS256, 8h expiry). Role IDs: **1 = Admin**, **2 = Auditor/Observer**, **3 = Usuario**. Use `require_admin` or `require_admin_or_auditor` dependencies from `backend/auth.py`.

Database table naming convention by prefix:
- `auth_*` — users, roles
- `cat_*` — catalogs (colegios, docentes, cursos, niveles, asignaturas)
- `eval_*` — evaluations, dimensions, responses, plantillas
- `cfg_*` — configuration (email recipients)
- `log_*` — history/audit logs
- `form_*` — soft-deleted evaluation records

### Frontend (Vanilla JS SPA)

`frontend/dashboard.html` is the shell. Pages are HTML partials (`page-*.html`) loaded dynamically via `loadModularPages` in `utils.js`. Navigation is event-driven: `navigateTo(page)` dispatches a `page-navigation` CustomEvent that module listeners catch in `main.js`.

All API calls go through `frontend/js/api.js` which exports an `api` object with namespaced methods (`api.evaluaciones.*`, `api.docentes.*`, etc.).

**API URL detection** (in `api.js`): points to `http://localhost:8002` when running locally outside Docker; switches to `/api` path prefix when accessed on port 8080 or from non-localhost — this is how the frontend auto-detects Docker vs local dev.

Global state lives in `frontend/js/state.js` (`state` object, `setState` helper).

Modules in `frontend/js/modules/` map 1-to-1 to feature areas and export functions that are wired into `window.app` in `main.js` for HTML `onclick` handlers.

### Two Platform Contexts

The system supports two evaluation modes toggled via `state.currentContext` (persisted in `localStorage`):
- **liderazgo** — classroom observation pauta (5 dimensions, 21 indicators)
- **visita** — UTP audit visit pauta

The `Usuario.acceso` field (`liderazgo`, `visita`, or `todos`) controls which context a user can access. Navigation menus (`#liderazgoMenu` / `#visitasMenu`) show/hide based on context.

### Evaluation Lifecycle

States are an enum in `models.py`: `BORRADOR → LISTO_PARA_FIRMA → FIRMADA_DOCENTE → CERRADA`

Digital signature uses TOTP (Google Authenticator). The docente scans a QR once to enroll (`/totp/setup/{id}`). At signing time, the observador clicks "Preparar Firma" → state moves to `LISTO_PARA_FIRMA` → a QR with a one-time token URL appears → docente scans and submits their 6-digit TOTP code → backend validates and broadcasts the state change over WebSocket (`/ws/evaluacion/{eval_id}`) → observador's screen auto-updates.

### Key Environment Variables

| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | `backend/.env` | Local dev DB connection |
| `DOCKER_DATABASE_URL` | `.env` | DB URL inside Docker |
| `SECRET_KEY` | `.env` / `backend/.env` | JWT signing key |
| `BASE_URL` | `.env` | Public URL used in email links |
| `FRONTEND_PORT` / `BACKEND_PORT` | `.env` | Only used by `docker-compose-d.yml` |
