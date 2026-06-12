# Project: homenetwork-viewer Improvements

## Architecture
- **Backend**: FastAPI (Python 3.11+, uv), single `app/` package with main.py, models.py, storage.py
- **Frontend**: Vite + React + TypeScript SPA, components/ + views/ + lib/ structure
- **Infra**: Docker Compose with nginx reverse proxy → backend on port 8080
- **Data**: JSON file storage at /data/devices.json (seed data in backend/app/seed/)

## Code Layout
```
backend/
  app/
    __init__.py
    main.py          # FastAPI routes
    models.py        # Pydantic models (Device, DeviceCreate, DeviceUpdate, etc.)
    storage.py       # JSON file-based storage
    seed/            # Seed data
  tests/
    conftest.py
    test_api.py      # 18 existing tests
  pyproject.toml
  Dockerfile
frontend/
  src/
    App.tsx           # Root component, CatalogContext, routing, toast
    api.ts            # API client functions
    types.ts          # TypeScript interfaces
    main.tsx          # Entry point
    theme.css         # Global styles (dark NOC theme)
    components/
      DeviceList.tsx      # Sidebar device list
      RefreshControls.tsx # Refresh button/auto-refresh
      Shell.tsx           # Layout shell
      Sparkline.tsx       # Mini chart
      SummaryPanel.tsx    # Dashboard summary
      TopologyMap.tsx     # Network topology SVG
      ViewChrome.tsx      # View wrapper with breadcrumbs
    views/
      HomeView.tsx    # Home/dashboard view
      DetailView.tsx  # Device detail view
      EditView.tsx    # Add/edit device form
    lib/
      helpers.ts      # Utility functions
      topology.ts     # Topology layout computation
  Dockerfile
  nginx.conf
docker-compose.yml
```

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Backend Fixes & Quality | R1.1 (PUT detail merge), R1.5 (version align), R4.2 (logging), R4.3 (IP/MAC validation) | none | PLANNED |
| 2 | Frontend Bug Fixes & Core | R1.2 (refresh race), R1.3 (hardcoded NAS), R1.4 (toast timer), R3.1-R3.6 (all accessibility), R4.1 (error boundary), R4.4 (topology memo) | none | PLANNED |
| 3 | Frontend UX Enhancements | R2.1-R2.8 (all UX items) | M2 (shared component patterns) | PLANNED |
| 4 | Integration & Verification | Full build, all tests, docker verification, GitHub issues (R4.5) | M1, M2, M3 | PLANNED |

## Interface Contracts
### Backend API (unchanged endpoints, new PATCH added)
- GET /api/devices — list all devices
- GET /api/devices/{id} — get single device
- POST /api/devices — create device (IP/MAC uniqueness enforced)
- PUT /api/devices/{id} — update device (merges detail field)
- PATCH /api/devices/{id} — partial update (merges all fields)
- DELETE /api/devices/{id} — delete device
- GET /api/switches, /api/cables — topology data
- GET /api/meta — catalog summary
- GET /api/health — health check

## Verification
- `cd backend && uv run pytest` — all tests pass
- `cd frontend && npm run build` — clean build
- `docker compose up -d --build` — healthy services
