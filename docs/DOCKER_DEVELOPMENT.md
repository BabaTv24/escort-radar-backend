# Docker development

## Architecture and requirements

Docker Desktop with the Linux engine and WSL2 on Windows 10; Docker Compose v2+; free local ports 4000 and 5173. One Node 22 image built from the root lockfile runs two development services. Source directories are bind mounted for hot reload; dependencies remain in image layers and are cached by Docker. The existing remote Supabase architecture is retained: there is no database container or automatic migration. Only an **isolated development Supabase project** may be configured. Never put production credentials or production data in `.env.docker`.

## Start and stop (PowerShell, repository root)

```powershell
Copy-Item .env.docker.example .env.docker
Copy-Item .env.docker.frontend.example .env.docker.frontend
# Set SUPABASE_* and VITE_SUPABASE_* to the same isolated development project.
# Keep payment flags disabled. Do not run seed scripts against production.
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail=80 backend frontend
```

```powershell
docker compose down
```

`down` does not remove the development Supabase project. Rebuild after changes to `package-lock.json` or package manifests. Edit source normally; Vite polls for Windows bind mount changes and `tsx watch` reloads the backend. If backend file changes are missed under a particular WSL2 mount, restart `backend` with `docker compose restart backend`.

## Local URLs and networking

- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- Backend health: http://localhost:4000/api/health
- Frontend to backend: browser uses `/api`; Vite proxies to `http://backend:4000` on the private Compose network.

Both published ports bind only to `127.0.0.1`. Browser Supabase SDK connects directly to the configured isolated project; the backend uses its service role key. Docker images contain no environment file or secrets. Both local env files are gitignored; the frontend process receives only public browser configuration. The example values are inert placeholders: health checks work, but auth, profiles, and persistence require a real isolated project with the repository migrations applied through the authorized SQL migration workflow. Health checks prove HTTP availability only, not Supabase connectivity.

## Environment variables

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.docker`; set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env.docker.frontend` for local feature testing. Use separate local `JWT_SECRET` and `SESSION_SECRET` values before authentication tests. `compose.yaml` pins `NODE_ENV=development`, local origins, and payment/BCU/test seed flags to disabled. Do not set `VITE_*` values to secrets: Vite exposes them to browsers. Never use the production Supabase project for local tests.

## Verify and troubleshoot

```powershell
docker compose config --quiet
docker compose ps
Invoke-WebRequest http://localhost:4000/api/health
Invoke-WebRequest http://localhost:5173/
Invoke-WebRequest http://localhost:5173/api/health
docker compose logs --tail=80 backend frontend
```

The last HTTP request verifies Vite-to-backend communication. If `docker info` fails with `dockerDesktopLinuxEngine` pipe missing, start Docker Desktop and enable its WSL2 Linux engine; then repeat once. A successful `docker compose config` alone does not prove container startup. If ports are occupied, stop the conflicting local service or change only the host side of the port mapping. `Missing required environment variable` means `.env.docker` was not copied or populated. Supabase errors with green health checks mean the isolated project URL, keys, schema, or auth redirects need checking.
