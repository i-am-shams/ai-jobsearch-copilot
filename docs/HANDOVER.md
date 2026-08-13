# AI Job-Search Copilot — Project Handover / State Doc

> **Placeholders in this document.** This repository is public. Anything that
> identifies the specific server or the unrelated production app that shares it
> has been replaced with a placeholder, while every architectural decision and
> lesson is kept verbatim — the reasoning is the point, the hostnames are not.
>
> | Placeholder | Means |
> |---|---|
> | `<vps-host>` | The VPS's address |
> | `<deploy-user>` | The unprivileged SSH user used for deployment |
> | `<other-app>` | A separate, unrelated production app co-hosted on the same VPS |
>
> No secret was ever committed to this repository: production values live only in
> `/opt/jobcopilot/.env` on the server and in local `user-secrets`.



> **Purpose:** this file is the single source of truth for project state across chat sessions. Any new Claude session should read this file first before continuing the build. Update it after every completed step.

**Last updated:** Steps 34–36 complete — health checks, **automated deploy on push to `master`** (verified green end-to-end), and the final README + architecture diagram + tradeoffs writeup. **Project 1's roadmap steps are done.** Now in a deliberate polish-and-publish interlude before Project 2: finish the frontend modernisation, audit for more bugs of the `gapAnalysis` class, sanitize docs and make the repo public, and refresh the portfolio site. See **"Next Step — an interlude before Project 2"** below.

> ⚠️ **Uncommitted-to-remote work exists.** Commit `1dc0dad` (frontend gap-analysis rendering + live status) is committed locally but **deliberately not pushed** — pushing auto-deploys to production and the UI hasn't been confirmed in a browser yet. Verify, then push.

## 🚀 LIVE DEPLOYMENT

**https://jobcopilot.dentflowbd.com** — running on the user's own VPS (`<vps-host>`), alongside their other production project (name withheld), sharing its nginx via a Docker external network, zero disruption to it. Full pipeline live-verified: auth, async matching (Postgres/RabbitMQ/worker/Gemini all containerized on the VPS), and live SignalR push confirmed in a real browser through two layers of nginx.

- VPS deployment files live at `/opt/jobcopilot/docker-compose.yml` and `/opt/jobcopilot/.env` **on the VPS itself, not in this git repo** (environment-specific, contains real secrets)
- New nginx site config: `/opt/<other-app>/nginx/conf.d/jobcopilot.conf` (new file, existing config for the other project untouched)
- **Deployment is automated (Step 35): pushing to `master` builds the three images and deploys them.** The manual fallback is still `ssh <deploy-user>@<vps-host> "cd /opt/jobcopilot && docker compose pull && docker compose up -d"`, but prefer re-running the CD workflow (`gh run rerun <id> --failed`) so the health gating and smoke test actually run.
- **`/opt/jobcopilot/deploy.sh` on the VPS is the deployment entry point** and is the *only* thing the CD key may execute (forced command). Its source of truth lives in this repo at `deploy/deploy.sh` — **if you edit it there, it does not update on the VPS automatically**; re-upload it: `ssh <deploy-user>@<vps-host> 'cat > /opt/jobcopilot/deploy.sh && chmod 750 /opt/jobcopilot/deploy.sh' < deploy/deploy.sh` (run from Git Bash — PowerShell has no `<` redirection).

## VPS Reference — full detail (so this isn't only reconstructable by SSHing in)

**Access:** `<deploy-user>@<vps-host>`, Ubuntu 24.04, SSH key already configured on this machine. `<deploy-user>` is in the `docker` group (no sudo for docker commands); sudo needs an interactive password (use `ssh -t` if ever needed).

**Directory layout:** `/opt/<project>` convention, matching the co-hosted production app. Ours: `/opt/jobcopilot/` (owned by `<deploy-user>`, created via one-time `sudo mkdir` + `chown`).

**Docker network:** the co-hosted project's nginx runs *inside Docker*, on a named bridge network `<other-app>_<other-app>-private` (confirmed via `docker network ls` — not a guessable default name). Our `frontend` service joins this as an `external: true` network so the co-hosted nginx can reach it by container name — **zero changes to the co-hosted project's own files**.

**DNS + TLS:** `*.dentflowbd.com` wildcard DNS and wildcard Let's Encrypt cert (via Cloudflare DNS-01) already existed for the co-hosted project — covers our subdomain too, confirmed via `openssl x509 ... | grep 'Subject Alternative Name'` before relying on it. **Dependency worth knowing**: our subdomain's TLS relies on the co-hosted project's existing certbot renewal automation continuing to run — we didn't set up our own renewal, we're riding on theirs.

**Image registry:** `ghcr.io/i-am-shams/ai-jobsearch-copilot-{api,worker,frontend}:latest`. VPS authenticates via `docker login ghcr.io` using a PAT scoped to `read:packages` only (with an expiration set) — already run once, credential is cached in the VPS's Docker config, shouldn't need repeating unless the token expires or is revoked.

**`/opt/jobcopilot/docker-compose.yml`** (real content, verified live on the VPS — secrets referenced via `${VAR}`, actual values only in `.env`, never in this file or in git):
```yaml
services:
  postgres:
    image: postgres:16
    container_name: jobcopilot-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: jobcopilot
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: jobcopilot
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jobcopilot"]
      interval: 5s
      timeout: 5s
      retries: 5
  rabbitmq:
    image: rabbitmq:3-management
    container_name: jobcopilot-rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: jobcopilot
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
  api:
    image: ghcr.io/i-am-shams/ai-jobsearch-copilot-api:latest
    container_name: jobcopilot-api
    restart: unless-stopped
    environment:
      ConnectionStrings__Default: "Host=postgres;Port=5432;Database=jobcopilot;Username=jobcopilot;Password=${POSTGRES_PASSWORD}"
      RabbitMq__Host: rabbitmq
      RabbitMq__Port: "5672"
      RabbitMq__Username: jobcopilot
      RabbitMq__Password: ${RABBITMQ_PASSWORD}
      Jwt__Key: ${JWT_KEY}
      Jwt__Issuer: "JobCopilotApi"
      Jwt__Audience: "JobCopilotClient"
      Jwt__ExpiryMinutes: "60"
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
  worker:
    image: ghcr.io/i-am-shams/ai-jobsearch-copilot-worker:latest
    container_name: jobcopilot-worker
    restart: unless-stopped
    environment:
      ConnectionStrings__Default: "Host=postgres;Port=5432;Database=jobcopilot;Username=jobcopilot;Password=${POSTGRES_PASSWORD}"
      RabbitMq__Host: rabbitmq
      RabbitMq__Port: "5672"
      RabbitMq__Username: jobcopilot
      RabbitMq__Password: ${RABBITMQ_PASSWORD}
      Gemini__ApiKey: ${GEMINI_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
  frontend:
    image: ghcr.io/i-am-shams/ai-jobsearch-copilot-frontend:latest
    container_name: jobcopilot-frontend
    restart: unless-stopped
    depends_on:
      - api
    networks:
      - default
      - <other-app>-private
networks:
  default:
    name: jobcopilot-internal
  <other-app>-private:
    external: true
    name: <other-app>_<other-app>-private
volumes:
  pgdata:
```

**`/opt/jobcopilot/.env`** (real values NOT documented here deliberately — never put real secrets in this git repo. Keys present: `POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`, `JWT_KEY`, `GEMINI_API_KEY`. **Note**: this is entered manually and is NOT synced with the local dev `user-secrets` Gemini key — if the Gemini key is ever rotated locally, it must be updated on the VPS separately too, nothing automates this yet.)

**`/opt/<other-app>/nginx/conf.d/jobcopilot.conf`** (new file we created; the co-hosted project's own `<other-app>.conf` is untouched):
```nginx
server {
    listen 80;
    server_name jobcopilot.dentflowbd.com;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location ~ /\. {
        return 404;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
server {
    listen 443 ssl;
    http2 on;
    server_name jobcopilot.dentflowbd.com;
    ssl_certificate /etc/letsencrypt/live/dentflowbd.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dentflowbd.com/privkey.pem;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location ~ /\. {
        return 404;
    }
    location / {
        proxy_pass http://jobcopilot-frontend:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Common operational commands:**
```bash
# redeploy after a new image push
ssh <deploy-user>@<vps-host> "cd /opt/jobcopilot && docker compose pull && docker compose up -d"

# check status
ssh <deploy-user>@<vps-host> "cd /opt/jobcopilot && docker compose ps"

# view logs
ssh <deploy-user>@<vps-host> "cd /opt/jobcopilot && docker compose logs -f worker"  # or api/frontend/postgres/rabbitmq

# validate + reload nginx after any config change (ALWAYS in this order)
ssh <deploy-user>@<vps-host> "docker exec <other-app>-nginx nginx -t"
ssh <deploy-user>@<vps-host> "docker exec <other-app>-nginx nginx -s reload"
```

> **Working preferences, tooling gotchas, and standing rules for shared-infrastructure work now live in `AGENTS.md` at the repo root** (auto-read by Claude Code and similar tools). This file covers project state only — what's done, what's next, and the deployed facts.

## Week 4 Plan Pivot (important — read before continuing)

Original plan was Terraform + Azure. **Changed**: AWS/Azure/GCP all require a credit card at signup even for free-tier-only usage (confirmed via research) — the user has no card available, full stop. **New plan: deploy to the user's own existing VPS** (already running a separate SaaS project, Docker installed, SSH key access already set up, nginx reverse proxy already in front of the existing project, 4GB+ free RAM, user has a spare domain ready).
- Postgres/RabbitMQ now run as containers directly on the VPS (reusing the exact `docker-compose.yml` already built and tested) — no need for Aiven/CloudAMQP/any third-party managed service.
- Terraform's role shifts from "provision cloud resources" to "manage deployment onto an existing server" via `file`/`remote-exec` provisioners over SSH — a legitimate, real IaC pattern, worth naming honestly as a known tradeoff (HashiCorp itself describes provisioners as "a last resort" vs. purpose-built config management tools like Ansible) in the final README.
- **Deviation from plan, worth being honest about**: Terraform was never actually implemented. Claude's SSH tooling in this environment failed silently (see Gotchas) — output simply wasn't captured through any invocation method tried, with no clear root cause found. The deployment ended up being **guided manual execution**: Claude wrote exact commands/file contents, the user ran them via their own working terminal, pasted results back for verification at each step. This worked and is fully, genuinely verified — but it means there's no IaC layer actually managing this deployment right now, just documented manual steps. Worth revisiting Terraform (or Ansible, arguably the more idiomatic tool for this exact scenario) as a **Future Addition** if time allows, framed honestly in the final writeup as "here's what I'd automate next," not glossed over as already done.
- **Real risk to manage carefully**: the VPS's nginx also serves the user's other live project. Step 33 will add a *new* site config, never touch the existing one, and always run `nginx -t` before any reload.

## Tech Stack (updated for VPS deployment)

| Layer | Choice | Notes |
|---|---|---|
| Hosting | User's own VPS | Docker + docker-compose.yml (already built/tested), nginx reverse proxy (shared with another project — new site config only, never modify the existing one) |
| Postgres | Containerized on the VPS | Same `docker-compose.yml`, no host port published — internal only |
| Message queue | Containerized on the VPS (RabbitMQ) | Same as above, no host port published |
| TLS | Let's Encrypt, via the co-hosted project's existing wildcard cert (`*.dentflowbd.com`) | Free, no card. **No new cert issuance needed** — confirmed via `openssl x509` before relying on it |
| IaC | **Not implemented** — SSH tooling failure led to guided manual deployment instead (see Week 4 Plan Pivot) | Real gap, honestly documented, candidate Future Addition |
**Reference doc:** `Full_Stack_Developer_Transition_Roadmap.md` (roadmap), `ARCHITECTURE_CONCEPTS.md` (per-step architectural reasoning + concept definitions — read this for *why*, this file for *what/status*)

---

## Project Summary

Small full-stack app: paste a resume + job description → AI extracts skills from both → computes a match score + gap analysis → tracked over time on a dashboard. Built deliberately "over-engineered" (event-driven, async worker, real-time updates) to demonstrate senior/architect-level patterns, not just CRUD.

## Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript (Vite) | Running on `localhost:5173` or `5174` |
| API | ASP.NET Core 8 Web API | Controllers, not minimal APIs. Runs on `localhost:5220` |
| Worker | C# `BackgroundService` | RabbitMQ consumer + Gemini API call. Node.js polyglot piece deferred (see Future Additions) |
| DB | PostgreSQL 16 (Docker) | Host port **5433** (5432 was taken by local install) |
| ORM | EF Core 8 | Npgsql provider. Shared via `JobCopilot.Contracts` between API and worker |
| Auth | JWT + BCrypt | Custom, not Identity framework. `MapInboundClaims = false` set explicitly (see Gotchas) |
| Queue | RabbitMQ, containerized on the VPS (plan pivoted from managed cloud queue — see Week 4 Plan Pivot above) | Manual ack, QoS=1. Working end-to-end |
| AI matching | Google Gemini API (`gemini-3.5-flash`, free tier) | **Not** `gemini-1.5-flash` — that's fully shut down, 404s (caught in verification). **Prompt-injection hardened** (Step 30, live-tested against a real injection attempt) |
| Real-time | SignalR | **Working, live-verified.** `/hubs/match`, per-user groups, second queue (`match-completed`) bridges worker → API → browser |
| Vector search | Postgres `pgvector` extension | For embeddings-based match scoring, later phase |
| Containerization | Docker Compose | **Full stack containerized and working, production-hardened (Step 32)**: `docker-compose.yml` at repo root — Postgres/RabbitMQ have NO published ports (internal only), API/frontend bound to `127.0.0.1` only. Frontend's own nginx proxies `/api`+`/hubs` internally by Docker service name. `infra/docker-compose.dev.yml` still used for lightweight local dev (Postgres+RabbitMQ only, app runs natively) |
| CI/CD | GitHub Actions | **Working, confirmed on real runs.** `ci.yml` (build+test, all branches/PRs), `cd.yml` (build+push to ghcr.io, master only) |
| Cloud IaC | Terraform | Week 4 |

## Key Architecture Decisions & Why

(Full reasoning for each of these lives in `ARCHITECTURE_CONCEPTS.md` — this is just the summary index.)

- **Guid primary keys, app-generated** — needed in C# before DB save (queue-publishing, Week 2), avoids guessable/enumerable IDs.
- **`MatchResult` separate entity from `Application`**, 1:1 — needs independent async status lifecycle, decoupling now avoids later migration.
- **Custom JWT + BCrypt auth**, not ASP.NET Core Identity — full control, easier to explain in interviews.
- **Postgres on host port 5433**, not default 5432 — local install already used 5432.
- **CORS explicitly configured** for `localhost:5173`/`5174`, `UseHttpsRedirection()` removed for local dev — browsers block cross-origin requests by default; the API and frontend run on different ports (= different origins).
- **JWT `MapInboundClaims = false`** — ASP.NET Core silently remaps claim names like `sub` by default; this preserves original JWT claim names so claims lookups behave as written, without needing manual workarounds.
- **Frontend auth token stored in React state only, not `localStorage`** — avoids XSS-readable token storage; tradeoff is losing session on refresh, acceptable for this project's scope.

## Repo Structure

```
ai-jobsearch-copilot/
├── .github/workflows/
│   ├── ci.yml                     → build + test, runs on push/PR
│   └── cd.yml                     → build + push images to ghcr.io, master only
├── docker-compose.yml             → FULL containerized stack (postgres, rabbitmq, api, worker, frontend) — this is the "real" deployable stack
├── .dockerignore                  → repo-root, applies to all 3 custom images
├── api/
│   ├── JobCopilot.Api.Tests/      → xUnit, AuthService tests (first tests in the project)
│   ├── JobCopilot.Api/Dockerfile
│   ├── JobCopilot.Contracts/      → shared library, referenced by both API and worker
│   │   ├── Models/                → User.cs, Application.cs, MatchResult.cs
│   │   ├── Data/AppDbContext.cs
│   │   └── Messaging/             → MatchRequestedEvent.cs, MatchCompletedEvent.cs
│   └── JobCopilot.Api/
│       ├── Controllers/           → AuthController.cs, ApplicationsController.cs (now includes GapAnalysis)
│       ├── Services/              → AuthService.cs
│       ├── Messaging/             → IMessagePublisher.cs, RabbitMqPublisher.cs, MatchCompletedConsumer.cs
│       ├── Hubs/MatchHub.cs       → SignalR hub, per-user groups
│       ├── Migrations/            → InitialCreate (regenerated in Steps 23-26 — see gotchas, MigrationsAssembly fix)
│       ├── Program.cs             → DbContext (+ MigrationsAssembly config), JWT auth, CORS (+ AllowCredentials), SignalR, all middleware registered
│       └── appsettings.Development.json  → connection string + JWT config
├── worker/JobCopilot.Worker/
│   ├── Dockerfile
│   ├── Worker.cs                  → BackgroundService, RabbitMQ consumer
│   ├── Services/GeminiMatchingService.cs
│   ├── Program.cs
│   └── appsettings.Development.json
├── scripts/
│   └── start-services.ps1         → launches API + worker, logs to logs/
├── frontend/
│   ├── Dockerfile                 → multi-stage: node build → nginx serve
│   ├── nginx.conf                 → SPA fallback routing (try_files → index.html)
│   └── src/
│   ├── api/client.ts             → shared axios instance, setAuthToken()
│   ├── context/AuthContext.tsx   → in-memory token/email state, login()/logout()
│   ├── types/application.ts      → ApplicationResponse (+ gapAnalysis), CreateApplicationRequest
│   ├── signalr.ts                → SignalR connection factory (JWT via accessTokenFactory)
│   ├── components/
│   │   ├── LoginForm.tsx         → login+register toggle form
│   │   ├── ApplicationForm.tsx   → submit new resume+JD pairing
│   │   └── ApplicationList.tsx   → table of tracked applications
│   ├── App.tsx                   → owns applications state, coordinates form+list, auth-gated render
│   └── main.tsx                  → wraps <App/> in <AuthProvider>
├── docs/
│   ├── HANDOVER.md               → this file
│   └── ARCHITECTURE_CONCEPTS.md  → per-step architectural reasoning + concept glossary
└── infra/
    └── docker-compose.dev.yml    → Postgres + RabbitMQ
```

## Completed Steps (1–22)

1. ✅ Environment setup (.NET 8, Node 20, Docker, Git)
2. ✅ Monorepo structure (`api/ worker/ frontend/ infra/`)
3. ✅ Backend scaffolded (`dotnet new webapi`), EF Core + Npgsql + JWT packages pinned to `8.0.10`
4. ✅ Frontend scaffolded (Vite + React + TS)
5. ✅ Postgres running in Docker, host port **5433**
6. ✅ Initial commit, `.gitignore` in place
7. ✅ EF Core models created: `User`, `Application`, `MatchResult`
8. ✅ `AppDbContext` created — 1:1 relationship configured explicitly, unique index on `User.Email`
9. ✅ Connection string wired, DbContext registered
10. ✅ Migration created and applied — confirmed via `psql \dt`
11. ✅ Auth infrastructure: `AuthService`, JWT middleware registered
12. ✅ `AuthController` — `/api/auth/register`, `/api/auth/login` — tested via curl, working
13. ✅ `ApplicationsController` — POST/GET/GET-by-id, scoped via `[Authorize]` + JWT `sub` claim — tested via curl (create, list, get-by-id), user-scoping confirmed working
14. ✅ Frontend wiring: `api/client.ts` (axios instance), `AuthContext.tsx` (in-memory token state), `main.tsx` wrapped in `AuthProvider`
15. ✅ `LoginForm.tsx` — combined login/register form
16. ✅ `App.tsx` wired to `AuthContext` — conditional render based on auth state. Built via Copilot directly in the repo (not chat-pasted) from this step onward.
17. ✅ **Bug found & fixed:** register/login failing in browser with generic error — root cause was missing CORS configuration (API and frontend are different origins/ports) plus `UseHttpsRedirection()` breaking plain-http calls from the frontend. Fixed: added explicit CORS policy for `localhost:5173`/`5174`, removed `UseHttpsRedirection()` for local dev (noted as a dev-only choice — production will terminate TLS at the load balancer, covered in Week 4). Confirmed working after fix.
18. ✅ **Full verification pass, Steps 1–16:** read every file directly rather than trusting prior chat summaries (Copilot had been writing code independently since Step 14). Found `ApplicationsController` had drifted — a defensive `GetCurrentUserId()` fallback (manually re-parsing the JWT from the raw header) had been added on top of an `OnTokenValidated` event handler in `Program.cs`, both patching the same root cause redundantly: ASP.NET Core's default JWT claim-name remapping silently broke the original clean `sub` claim lookup. **Fixed properly** with `options.MapInboundClaims = false` (one line, addresses root cause), reverted the controller back to its clean spec form, removed the redundant event handler. Also deleted leftover `WeatherForecastController.cs`/`WeatherForecast.cs` scaffold junk. Rebuild: 0 warnings, 0 errors. Confirmed login/register still working after the fix.
19. ✅ **Create Application form + list view built** — `types/application.ts`, `ApplicationForm.tsx`, `ApplicationList.tsx`, `App.tsx` updated to own applications state and coordinate both. Verified all four files matched spec exactly (no drift this time). Two follow-up bugs found and fixed post-build:
    - **Orphaned dev server processes** on ports 5173/5174 (never cleanly stopped across sessions) were serving stale code. Killed via `netstat`-identified PIDs, restarted clean on 5173.
    - **Type-only import bug**: `CreateApplicationRequest`/`ApplicationResponse` (interfaces, not runtime values) were imported with plain `import { }` syntax, causing `Uncaught SyntaxError` in the browser — esbuild's per-file transform didn't elide them. Fixed with explicit `import type { }` syntax in all three affected files. Confirmed working after both fixes.
20. ✅ **RabbitMQ integration — API publishes `MatchRequested` events.** Added RabbitMQ (`3-management` image) to `docker-compose.dev.yml`. Created `Messaging/` folder: `MatchRequestedEvent` (message contract), `IMessagePublisher` (interface, enables swapping to SQS/Azure Service Bus later without touching calling code), `RabbitMqPublisher` (implementation — durable queue, persistent messages, registered as `AddSingleton`). `ApplicationsController.Create` now publishes after `SaveChangesAsync()` succeeds. Verified: all files matched spec exactly, zero drift. Build clean. End-to-end confirmed via RabbitMQ management dashboard — submitted application, saw the message land in `match-requests` queue (`Ready: 1`, durable flag set), correctly waiting since no consumer exists yet.
21. ✅ **Worker service built — full pipeline working end-to-end, live-verified.** Extracted `JobCopilot.Contracts` shared library (models, `AppDbContext`, event types) referenced by both API and worker. Built `Worker.cs` (`BackgroundService`, RabbitMQ consumer, manual ack, QoS=1) and `GeminiMatchingService.cs` (Gemini API call via `AddHttpClient`). Three real bugs found and fixed during verification:
    - **Duplicate `Models/` folder** left orphaned in API project after Contracts extraction (copied, not moved) — dead code in a different namespace, compiled silently without error. Deleted, rebuild confirmed clean.
    - **Dead Gemini model**: code used `gemini-1.5-flash`, which is fully shut down (404 on every call, confirmed via live search). Fixed to `gemini-3.5-flash`.
    - **`start-services.ps1` script bug**: `-NoNewWindow` silently fails when launched headlessly (no attached console), leaving `$apiProcess` null and crashing on `.WaitForExit()`. Rewritten to redirect output to `logs/*.log` files and not block on exit.
    - Also caught and named: a self-generated `STEP_21_VERIFICATION.md` claimed "VERIFICATION COMPLETE" while its own "how to verify" section was an unperformed to-do list — build/startup success ≠ working feature.
    - **Live end-to-end test actually performed** (not just claimed): registered a user, submitted a real application via the API, polled it after a few seconds — confirmed `matchStatus: Completed`, `matchScore: 35` (plausible given the test resume genuinely lacked several skills the test JD asked for).
22. ✅ **SignalR real-time updates — full pipeline, browser-verified live.** Worker publishes `MatchCompletedEvent` (now carries `UserId`) to a second queue (`match-completed`) on success only. New `MatchCompletedConsumer` (API-side `BackgroundService`) bridges that queue to a new `MatchHub`, which groups connections per-user by JWT `sub` claim. Frontend connects via `@microsoft/signalr`, refetches the list on `MatchCompleted`. Also closed a deferred item from Step 21: `GapAnalysis` now exposed in `ApplicationResponse`. **First step with zero drift found** — every file matched spec exactly on verification. Full chain live-tested: RabbitMQ confirmed message published+acked on the new queue, API confirmed final DB state (`Completed`, score 95, real gap-analysis text), and **the user confirmed the actual browser behavior** (table updates live, no manual refresh) — the one piece Claude structurally couldn't verify itself (no browser tool connected this session).
23–26. ✅ **Full containerization — all 5 services in one `docker-compose.yml`, genuinely live-verified (success AND failure paths).** Batched into a single Copilot CLI invocation (efficiency request from user) rather than 4 separate ones. Dockerfiles for API, worker, frontend (multi-stage Node→nginx build), plus `nginx.conf` for SPA routing, plus the compose file with healthchecks gating startup order. **Four real, unrelated bugs found and fixed during verification:**
    - Frontend production build (`npm run build`, never run before this point) failed on 3 files still missing `import type` from Step 19's fix — dev server never caught it since esbuild's dev transform is more lenient than the real `tsc -b` build.
    - **Serious undocumented drift**: `RabbitMqPublisher.cs` had been silently rewritten (outside any explicit step) to swallow all exceptions — a RabbitMQ outage would let applications submit successfully while silently never processing, forever. Confirmed via `git status` this was never committed (no permanent damage). Fixed back to fail-visible behavior.
    - Migrations silently broke after Step 21's Contracts refactor: `dotnet ef` found zero migrations against a genuinely fresh database, because EF defaults to expecting migrations in the same assembly as the `DbContext` (`JobCopilot.Contracts`), not the startup project (`JobCopilot.Api`) where they actually live. Fixed with explicit `.MigrationsAssembly("JobCopilot.Api")`, migration regenerated clean.
    - **Copilot CLI corrupted a file it wrote**: silently replaced `Password=devpassword` with `******` in `docker-compose.yml` during the write itself (not just terminal echo) — its own secret-redaction heuristic pattern-matched a harmless placeholder. Caused a real connection-string parse error, fixed by direct edit + byte-for-byte verification.
    - Also caught: a Docker Compose startup race — `depends_on: condition: service_healthy` wasn't sufficient on cold start; RabbitMQ's healthcheck passed slightly before its AMQP listener was truly ready, crashing API/worker on first boot. Flagged as an open item (retry-with-backoff needed in `Worker.cs`/`MatchCompletedConsumer.cs`, not yet implemented — see Future Additions).
    - **Full stack verified genuinely working**: all 5 containers up, both a failure case (no Gemini key → `Failed` status, clean, no crash) and a success case (real key → `Completed`, score 98, real analysis) tested live against actually-running containers, frontend's nginx serving confirmed via direct HTTP request.
27–28. ✅ **CI/CD pipelines + first real tests in the project.** `ci.yml` (build API+worker, type-check+build frontend, run tests, all on push/PR) and `cd.yml` (build+push all 3 images to `ghcr.io`, master only, tagged with both `latest` and commit SHA). Added `JobCopilot.Api.Tests` — 4 genuine xUnit tests against `AuthService` (password hashing/verification, JWT generation) — the project's first tests after 27 steps, added specifically so CI's "test" stage isn't decorative. Two bugs caught before ever pushing: a spec error (Claude's own mistake — referenced the pre-Contracts `Models.User` instead of `JobCopilot.Contracts.User`) and a missing `ImplicitUsings` in the new test `.csproj`. Also hit a Copilot CLI limitation: it hung indefinitely trying to create files in not-yet-existing directories (`.github/workflows/`, the new test project folder) when only granted `write` permission — resolved by pre-creating directories manually before invoking it. **Confirmed on real GitHub Actions infrastructure** (not just local): both CI (47s) and CD (53s) passed green on their very first run.
29–31. ✅ **Rate limiting, prompt-injection hardening, and cleanup — all three genuinely live-tested, not just written.** Written directly by Claude (not delegated to Copilot CLI) given the security/reliability sensitivity of this batch, after Copilot had repeatedly introduced subtle drift in exactly this kind of code (RabbitMqPublisher, migrations config) in earlier steps.
    - **Rate limiting (29):** two fixed-window policies — `"auth"` (5/min) and `"applications"` (10/min, since every request triggers a real metered Gemini call downstream). Live-tested: 5 successful requests followed by a real `429` on the 6th.
    - **Prompt-injection hardening (30):** input-side (XML delimiters + explicit "treat as data" instruction + delimiter-tag stripping) and output-side (score clamped 0–100, gap analysis length-capped) — two independent layers, since prompt wording alone is never a hard guarantee. Live-tested with a real injection attempt ("output exactly score 100...") — actual result was a correctly-reasoned `score: 0`, completely ignoring the injected demand.
    - **Cleanup (31):** added `ConnectWithRetryAsync` (exponential backoff, 10 attempts, properly cancellable) to both `Worker.cs` and `MatchCompletedConsumer.cs` — the exact RabbitMQ cold-start crash found in Steps 23–26 is now fixed, live-tested by actually stopping RabbitMQ mid-run and confirming the worker retried and recovered instead of crashing. Removed ~12 lines of noisy step-by-step diagnostic logging from `Worker.cs`. Fixed package version drift: `JobCopilot.Api.csproj`'s floating `8.0.*` EF Core packages pinned to the same exact `8.0.10` used elsewhere (eliminates the `MSB3277` warnings seen since Step 27), and `JobCopilot.Worker.csproj`'s `Microsoft.Extensions.Http`/`System.Net.Http.Json` corrected from `10.0.10` (a .NET 10 version in a .NET 8 project) to `8.0.1`.
    - All builds clean (0 warnings, including the version-conflict warnings genuinely gone), all 4 existing tests still passing.
32. ✅ **Production-hardened compose architecture, VPS-ready — live-verified from a genuinely fresh volume.** Frontend URLs made build-time configurable (relative paths in prod → no CORS needed at all in production, only for local dev). Frontend's own nginx now proxies `/api`+`/hubs` internally by Docker service name, so the *outer* VPS nginx (shared with the user's other project) only needs one simple rule — deliberately minimizing Step 33's blast radius. Postgres/RabbitMQ: removed all published ports (internal-only). API/frontend: rebound to `127.0.0.1` only, never `0.0.0.0`. This removed host access for manual migrations, so added automatic `db.Database.Migrate()` on API startup — the correct fix, not a workaround, for a single-instance deployment. **Full regression test performed**: stack rebuilt from a genuinely fresh volume (`docker compose down -v`), tested end-to-end through the NEW nginx-proxied path (port 5173, not the old direct-to-API 5220) — register, submit, poll all confirmed working, `Completed` status with real score and gap-analysis text.
33. ✅ **LIVE ON THE REAL VPS — fully verified, including browser SignalR over the real domain.** Read the co-hosted project's own ops runbook first rather than guessing at server structure — this surfaced a pre-existing wildcard DNS record and wildcard TLS cert (both verified live, not assumed), eliminating almost all originally-planned DNS/certbot work. Discovered the co-hosted nginx runs *inside Docker* (not host-level), ruling out the original loopback-proxy plan. **Key decision**: joined the frontend container to the co-hosted project's existing named Docker network (`<other-app>_<other-app>-private`, confirmed via `docker network ls`) as an `external: true` network — meaning **zero lines changed** in the co-hosted project's own compose file, eliminating the riskiest originally-planned step entirely. New nginx site config deliberately mirrors the co-hosted project's existing config style exactly (same redirect/ACME-challenge/WebSocket-header patterns). `nginx -t` validated before every reload, exactly matching the co-hosted project's own documented safety practice. Caught and corrected an over-scoped GitHub PAT (had `repo` + `write:packages`; corrected to `read:packages` only, with an expiration set) before it was used. **Full live verification, multi-stage**: nginx config validity → co-hosted project's own health check confirmed unaffected → new subdomain reachability → full auth+async pipeline via curl from the VPS (register, login, submit, poll → `Completed` with real Gemini score/analysis) → **live SignalR push confirmed by the user in an actual browser**, over the real domain, through two layers of nginx. **Real gap, documented honestly**: Terraform was never actually implemented — Claude's SSH tooling failed silently in this environment (zero output through every invocation method tried), so the deployment became guided manual execution (Claude wrote exact commands, user ran them, pasted results back for verification at each step). Fully verified, but no IaC layer currently manages this deployment.

34. ✅ **Health checks + container healthchecks — code complete, verified locally against real failure and recovery.** Split **liveness** (`/health`, no dependency checks) from **readiness** (`/health/ready`, checks Postgres + RabbitMQ) — deliberately, because Docker *restarts* containers that fail liveness, so a brief DB blip must not be allowed to kill a healthy API. Added container healthchecks for `api` (curl → `/health`), `frontend` (busybox wget), and `worker` (heartbeat-file freshness, since it has no HTTP surface). The worker's heartbeat is **gated on its AMQP connection being open**, which turns the "process alive but consuming nothing" silent failure into a visible unhealthy state. Health exposed publicly via the *frontend's own* nginx, so **no change to the shared VPS nginx** was needed.
    - **Real bug found by running it, not by building it**: the frontend sat permanently unhealthy — nginx listens on `0.0.0.0:80` (IPv4 only) but `localhost` resolves to `::1` first inside the container, so wget got connection-refused. Fixed with an explicit `127.0.0.1`.
    - **Failure path genuinely exercised**: with RabbitMQ stopped → `/health` stayed `200` (API correctly *not* restarted), `/health/ready` returned `503`, and the worker container went `unhealthy` while still running. Restarting RabbitMQ recovered the worker to healthy **with no container restart** — confirming `RabbitMQ.Client`'s automatic recovery genuinely works rather than assuming it.
    - Also verified no regression: message consumption still works after the heartbeat loop replaced the worker's terminal `Task.Delay(Timeout.Infinite)`.
    - **Still outstanding for this step (both manual, not yet done):** update `/opt/jobcopilot/docker-compose.yml` on the VPS with the same healthchecks, and register `https://jobcopilot.dentflowbd.com/health` with an external uptime monitor (UptimeRobot — free, no card).

35. ✅ **Automated deployment — pushes to `master` now deploy to the VPS, fully verified green end-to-end.** `cd.yml` gained a `deploy` job gated on all three image builds. The deploy key is **pinned by a forced command** (`restrict,command="/opt/jobcopilot/deploy.sh"`) in the VPS's `authorized_keys`, so a leaked GitHub secret cannot open a shell on the box that also runs the live the co-hosted app app — **verified by connecting with the key and asking for `whoami`, which ran the deploy script instead.** Host key pinned via `VPS_KNOWN_HOSTS` (cross-checked against the fingerprint this workstation already trusted) rather than disabling host key checking. `deploy.sh` pulls, applies, waits for every container to report healthy, smoke-tests the real public URL, and prunes dangling images.
    - **Three real bugs, each found by verifying rather than trusting:**
      1. **A smoke test that asserted nothing** — it checked only the HTTP status of `/health`, but the frontend's SPA `try_files` fallback returns `200` with `index.html` for *any* unmatched path. Proven against the live site *before* deploying: `/health` returned `200` with `<!doctype html>` on a deployment where the endpoint didn't exist. Now asserts the exact body (`Healthy`).
      2. **The deploy key had an unintended passphrase** — `ssh-keygen -N '""'` in **PowerShell** produces a literal passphrase, not an empty one. CI failed with `Permission denied (publickey)`, which points at the secret, not the key. Diagnosed by testing the key locally; regenerated in Git Bash. Same PowerShell quoting hazard already in `AGENTS.md`, applied to key generation.
      3. **A 502 on the first successful deploy** — a race, not a breakage: the VPS compose had no healthchecks yet, so the script had nothing to wait on and smoke-tested while the API was still applying EF migrations. Fixed at the cause by adding the Step 34 healthchecks to the VPS compose, not with a `sleep`.
    - Added `.gitattributes` pinning `*.sh` to LF — with `core.autocrlf=true`, a committed `deploy.sh` would reach the VPS with CRLF and die on `bad interpreter: ...^M`. Verified 0 CR chars and a matching sha256 on the VPS.
    - **Verified**: pipeline green (`deploy` in 24s), deploy log shows all 5 containers healthy then `liveness: Healthy` / `readiness: Healthy`; full app pipeline re-tested over the public domain (register → submit → `Completed`, score 70, real Gemini analysis); **the co-hosted app confirmed unaffected** (`/health` → 200, 3-week uptime intact).
    - **Known gap, named honestly**: deploys pull `:latest`, not the commit SHA, so rollback means editing the VPS compose by hand. SHA-pinning needs the forced command to accept a validated argument — listed as a Future Addition, not quietly skipped.

36. ✅ **Final README, architecture diagram, and decisions/tradeoffs writeup — Project 1's last build deliverable.** Root `README.md` written for a hiring-manager audience: live URL and what it does up front, Mermaid architecture diagram, request-flow walkthrough, tech stack and API surface, then **"Decisions and tradeoffs" as the centrepiece** (async pipeline vs. synchronous call, liveness/readiness split, the connection-gated worker heartbeat, the forced-command deploy key, zero-touch integration with the co-hosted app, prompt-injection hardening). A **"Known gaps"** section names the real ones plainly: no IaC/Terraform, `:latest` deploys with manual rollback, failed matches not pushing SignalR, single API instance, in-memory rate limiting, only four tests.
    - Diagram is Mermaid (renders natively on GitHub, diffable) **plus** a committed `docs/architecture.png` rendered via `@mermaid-js/mermaid-cli`, with `docs/architecture.mmd` as the extracted source. The PNG is *linked*, not embedded inline — GitHub renders the Mermaid block itself, so embedding both would show the diagram twice on the page.
    - Cleanup done: deleted `docs/STEP_21_VERIFICATION.md` (the self-generated file whose own "how to verify" section was an unperformed to-do list).

## Next Step — an interlude before Project 2

Project 1's roadmap steps are done, but a **polish-and-publish interlude was agreed before moving on**, prompted by an honest look at the frontend. Do these in order; the roadmap's Project 2 comes *after*.

### A. Frontend: finish what's started, then modernise

**Committed locally but NOT pushed, and NOT yet verified in a browser** (commit `1dc0dad`). Pushing auto-deploys to production, so verify first, then push.
- Renders `gapAnalysis` via expandable disclosure rows; status shown as a coloured pill (`Pending`→"Queued", `Processing`→"Analysing"); score counts up when a live SignalR result lands; deleted the never-imported Vite template `App.css`.
- **To verify**: local stack up, log in as `demo@local.test` / `DemoTest123!` (seeded, has one completed application), expand a row, then submit a new one and watch the status transition live without refreshing.

**Then the remaining modernisation**, in the priority order agreed:
3. **TanStack Query** — replaces the current refetch-everything-on-any-event pattern with caching, background refresh, real loading/error states. The most recognisable "modern React" signal.
4. **react-hook-form + zod** — real validation and shared schema types. Note `react-router-dom` is currently **installed but never imported** — either use it (below) or drop it.
5. **Routing + a detail page** — `/`, `/applications/:id`, protected routes.
6. **Vitest + React Testing Library** — currently **zero** frontend tests, so CI's frontend stage only type-checks and builds.
7. **Error boundary, toasts, empty/error states, aria labels, keyboard navigation.** Currently 2 `catch` blocks and 2 `aria-` attributes in the whole app.

### B. Hunt for more bugs of the same class

The `gapAnalysis` bug — data generated, stored, returned by the API, and silently never rendered — was found by reading the code, not by any test or build. **Assume there are others.** Worth auditing specifically: every field on `ApplicationResponse` actually reaching the UI; error paths that swallow or misreport failures; the known "failed matches never push a SignalR update" gap; and whether anything else in the repo is dead or unused like `App.css` and `react-router-dom` were.

### C. Make this repo public

Decision taken: **sanitize the docs first, then publish** (no history rewrite).
- **Git history is already clean of real secrets** — verified: no Gemini keys, no private keys, no tokens. Only `devpassword` and a self-labelled throwaway JWT key.
- **What must be sanitized before publishing** — `docs/HANDOVER.md` and `docs/ARCHITECTURE_CONCEPTS.md` currently contain the **VPS IP, the SSH username (`deploy`), exact server paths, the Docker network name, the full nginx config, and the co-hosted production app's details**. The IP is DNS-discoverable from the live domain anyway, but the SSH username, directory layout and "this box also runs another production app" are not. Replace with placeholders; **keep every architectural lesson**, since the reasoning is the portfolio value.
- Then `gh repo edit i-am-shams/ai-jobsearch-copilot --visibility public`, and pin it on the GitHub profile (pinning is a profile setting, done in the web UI).

### D. Review and update the portfolio site

`my-portfolio` — **already PUBLIC**, JavaScript, cloned locally at `C:\Users\Khalid\Documents\GitHub\my-portfolio`, last updated 2026-08-10. Review it and add/refresh the entry for this project: live URL, the architecture diagram, and a link to the (by then public) repo. Not yet examined at all — assess its current state first.

### E. Still outstanding from Step 34

- **Register an external uptime monitor** against `https://jobcopilot.dentflowbd.com/health` (UptimeRobot — free, no card). **Match the response body keyword `Healthy`, not just a 200 status** — the SPA fallback returns 200 with `index.html` for any unmatched path, so a status-only monitor is decorative (see Step 35, bug 1).

### Then: Project 2

`docs/Full_Stack_Developer_Transition_Roadmap.md` → **break a slice into microservices + cloud-native deploy**, plus the interview-preparation track.

> **Tooling constraint for whoever picks this up:** in the current Claude Code environment, `ssh` is blocked by the harness permission classifier and `gh` is not installed, so VPS and GitHub-secret work is guided manual execution (Claude writes exact commands, user runs them, pastes results back) — same as Step 33, for a different underlying reason.

## Known Gotchas

> **Moved to `AGENTS.md`** at the repo root — general engineering lessons that apply regardless of which step you're on now live there, auto-read by Claude Code and similar tools.

## Future Additions (deliberately deferred, don't lose track)

- **Node.js polyglot piece**: a small Node.js service consuming `MatchCompletedEvent` (e.g., logs/webhooks on match completion) — planned as an *additive*, low-risk demonstration of polyglot architecture. Unblocked since Step 22, not yet started.
- **Failed matches don't push a live SignalR update** — only success does. Known limitation from Step 22, not yet fixed.
- ~~Prompt-injection hardening~~ — **done, Step 30.**
- ~~Diagnostic logging cleanup in `Worker.cs`~~ — **done, Step 31.**
- ~~RabbitMQ connection retry-with-backoff~~ — **done, Step 31, live-tested against a real outage.**
- ~~EF Core / package version drift~~ — **done, Step 31.**

> **Workflow preferences, tooling gotchas, and standing rules** (response style, Copilot CLI usage pattern, verification discipline, VPS/shared-infrastructure caution) **now live in `AGENTS.md`** at the repo root.
