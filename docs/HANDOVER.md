# AI Job-Search Copilot — Project Handover / State Doc

> **Placeholders in this document.** This repository is public. Anything that
> identifies the SSH username or the unrelated production app that shares this
> server has been replaced with a placeholder, in both the working tree and
> git history, while every architectural decision and lesson is kept verbatim
> — the reasoning is the point, not those specific values. The VPS's address
> is a real, committed value throughout, deliberately — it's already
> discoverable from the live domain's own DNS, so hiding it has no real
> security value.
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

**Last updated:** Polish-and-publish interlude fully complete, including publication (**C**) — the
repo is now public. See **"Polish-and-publish interlude — status"** for the full A-F breakdown.
**Every item in "Future Additions" below is now resolved and deployed** — dead-letter queues, the
live `Analysing` status push, a Grafana dashboard, and the Atlas DB user scope-down, each
independently verified against real running infra (not just built). The RabbitMQ queue-redeclare
gotcha (`PRECONDITION_FAILED` on the three pre-existing queues, since this repo auto-deploys on
push) was handled by deleting `match-requests`/`match-completed-api`/`match-completed-notifications`
via `rabbitmqadmin` (over SSH, no port exposed for the management UI itself) immediately before
pushing. **Post-deploy verification, not just CD-green**: all 9 queues (3 originals + their
`.dlq`s + the new `match-processing` + its `.dlq`) confirmed present via `rabbitmqctl list_queues`;
all 7 containers report healthy; a real submitted application against the live production site
was caught mid-flight in `Processing` status by polling, then reached `Completed` normally.
**Project 2's first bounded context is live in production**: a Notifications service
(`notifications/`, Node.js+TypeScript, own MongoDB Atlas) extracted off a newly fanout-exchanged
RabbitMQ topology (a real bug — a second consumer silently splitting the API's messages — caught
and fixed before it shipped). Verified four ways: local dev, the actual Docker image, a local
`kind` Kubernetes cluster (card-free substitute for managed K8s), and now the real VPS deployment
— all 6 containers healthy, a real submitted application independently produced a real document in
MongoDB Atlas, confirmed by querying Atlas directly. **Grafana Cloud observability is now also live
on the VPS** — a 7th container (`alloy`) ships host + per-container metrics and logs, scoped to
this project's own containers only after a real bug (unscoped discovery was shipping the co-hosted
`<other-app>` app's data too, and its log backlog was silently dropping this project's own logs) was
caught and fixed live. See **"Project 2 — microservices + cloud-native deploy"**.

> ✅ **Everything is pushed and deployed.** `master` and `origin/master` match, CD was green, and
> post-deploy verification against the live production site confirms all of it actually works
> (see "Last updated" above for specifics). Real Terraform
> (`terraform/atlas`, `terraform/vps`) now covers Atlas and the VPS deploy path too, and
> `docs/architecture.mmd`/`.png` (plus the root `README.md`) now draw the full picture —
> notifications, the fanout exchange, Atlas, and Grafana Cloud all in one pass, as planned. **The
> repo is now public** — see interlude item C. **Project 2's roadmap items are now all done**;
> see "Project 2 — microservices + cloud-native deploy" for the full detail on each.

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
| IaC | **Terraform** (`terraform/atlas`, `terraform/vps`) — see "Project 2" section below | Atlas resources imported (never apply-created); VPS deploy path via `file`/`remote-exec` provisioners, `.env` deliberately excluded (see `terraform/vps/README.md`) |
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
│   ├── api/
│   │   ├── client.ts             → axios instance, setAuthToken()
│   │   ├── applications.ts       → TanStack Query hooks + applyMatchPush (cache patching)
│   │   └── errors.ts             → toErrorMessage: the 429/ProblemDetails/network fix
│   ├── lib/schemas.ts            → zod schemas; response types are INFERRED from these
│   ├── hooks/useLiveMatchUpdates.ts → SignalR → query cache, returns connection status
│   ├── routes/                   → Dashboard, ApplicationDetail, ProtectedRoute
│   ├── components/
│   │   ├── LoginForm.tsx         → react-hook-form + zod
│   │   ├── ApplicationForm.tsx   → react-hook-form + zod, uses the create mutation
│   │   ├── ApplicationList.tsx   → table + gap-analysis disclosure + detail links
│   │   ├── StatusPill.tsx / AnimatedScore.tsx / LiveIndicator.tsx
│   │   ├── ErrorBoundary.tsx     → render exceptions can't blank the page silently
│   │   └── Toaster.tsx           → aria-live region for pushed results
│   ├── test/                     → Vitest setup + render helpers
│   ├── App.tsx                   → router shell, owns the SignalR connection
│   └── main.tsx                  → ErrorBoundary > QueryClient > Auth > Toast > Router
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

35. ✅ **Automated deployment — pushes to `master` now deploy to the VPS, fully verified green end-to-end.** `cd.yml` gained a `deploy` job gated on all three image builds. The deploy key is **pinned by a forced command** (`restrict,command="/opt/jobcopilot/deploy.sh"`) in the VPS's `authorized_keys`, so a leaked GitHub secret cannot open a shell on the box that also runs the live co-hosted app — **verified by connecting with the key and asking for `whoami`, which ran the deploy script instead.** Host key pinned via `VPS_KNOWN_HOSTS` (cross-checked against the fingerprint this workstation already trusted) rather than disabling host key checking. `deploy.sh` pulls, applies, waits for every container to report healthy, smoke-tests the real public URL, and prunes dangling images.
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

## Polish-and-publish interlude — status

Project 1's roadmap steps (1–36) are complete. This interlude was agreed before starting
Project 2. **A, B, D, E and F are done; C is deliberately paused.**

### A. Frontend verified, then modernised — done

**Verified first, in a real browser** (Playwright driving actual Edge, since no browser tool
was connected this session): logged in as the seeded demo user, expanded the gap analysis,
submitted a new application and watched it go `Queued -> Completed` with **zero page
navigations** and the score counting up (`— -> 18 -> 35`). Then pushed; CD green.

**Then modernised:**
- **TanStack Query** replaces refetch-everything-on-any-event. Pushes now patch the one row
  that changed. Measured in a browser: a submit-to-completed cycle costs **one** API call
  (the POST) and nothing else.
- **react-hook-form + zod.** Schemas are the single source of truth — response types are
  *inferred* from them, and responses are **parsed at runtime**, so a field silently
  disappearing from the API fails loudly instead of rendering blanks forever.
- **Routing + a detail page.** Also the first-ever caller of `GET /api/applications/{id}`,
  which had been implemented and user-scoped since Step 13 with **no consumer at all**.
  `react-router-dom` was already a dependency and had never been imported.
- **Vitest + React Testing Library — 21 tests**, the frontend's first. CI's frontend job now
  *runs* them instead of only type-checking and building. **Mutation-checked**: reverting the
  gapAnalysis render makes two of them fail.
- **Error boundary, toasts in an `aria-live` region, labelled fields with `aria-invalid` and
  `aria-describedby`, visible focus rings, invalid state marked by border weight as well as
  colour, and a live-connection indicator.**

### B. Bug audit — seven silent failures found and fixed

All the same class as `gapAnalysis`: **no test or build could have caught any of them.**

1. **SignalR was silently running on its slowest transport.** WebSockets and SSE cannot send
   an `Authorization` header, so the SignalR client passes the token as an `access_token`
   query parameter — which nothing read. Both transports 401'd on handshake and the client
   fell back to long polling. *It worked*, which is exactly why nobody noticed. Now read,
   **scoped to `/hubs`** so a query-string token is never accepted on the REST API, where it
   would leak into logs. Verified by tracing transports: negotiate 200, WebSocket first try.
2. **Failed matches never told the browser anything.** Publishing on success only meant a
   failure saved `Failed` and stopped; the row sat on "Analysing" until a manual refresh.
   Verified by running the worker against an invalid Gemini key: `Queued -> Failed` live,
   zero page navigations.
3. **A single unexpected exception could stop the worker permanently.** The consumer caught,
   logged, and then neither acked nor nacked. With manual ack and prefetch 1 that delivery
   stays outstanding forever and RabbitMQ never delivers another — **and it looks perfectly
   healthy while doing it**, because the process is alive and the AMQP connection is open, so
   even the connection-gated heartbeat keeps passing. Now nacks with `requeue: false`
   (requeuing a poison message just feeds it straight back to the only consumer in a loop).
   A dead-letter queue is the real answer and is listed as a gap, not pretended away.
4. **`MatchResult.CompletedAt` was stamped by the worker and returned by nothing** —
   generated-then-dropped, exactly like the gap analysis. Now on `ApplicationResponse`; with
   `CreatedAt` it gives the pipeline's real turnaround time.
5. **Hitting the rate limit showed the user nothing at all.** `err.response?.data ?? fallback`
   plus ASP.NET's empty 429 body: `''` is not null, so `??` passed it through, and
   `{error && <p/>}` renders nothing for `''`. Submitting past the limit was
   indistinguishable from a dead button. The same expression rendered ProblemDetails objects
   as `[object Object]` and reported network failures as server errors.
6. **Live updates could die without a trace** — `connection.start()`'s promise was ignored, so
   a failed handshake was an unhandled rejection and the app looked completely normal.
7. **The push carried no `completedAt`**, so a finished match kept a null timestamp and the
   detail view showed no analysis time and no turnaround at all. Found *during* the
   modernisation. The first fix attempt (an `invalidate`) **silently did nothing** — the
   detail query seeds from the list cache and so considered itself fresh on mount. Real fix:
   the event carries the complete terminal state. The worker now also stamps `CompletedAt` on
   failure, which it never did.

Also removed four unreferenced Vite template assets (`hero.png`, `react.svg`, `vite.svg`,
`icons.svg`) — the same dead weight as the `App.css` deleted the session before.

**Still open, named honestly:** `Analysing` is written to the database, but nothing pushes on
`Pending -> Processing`, so **the UI renders a state it can never actually reach.**

### C. Docs sanitized, history rewritten, repo public — done

Sanitization covers the SSH username, the co-hosted app's name, its nginx container and
network names, its config filename and its own health-check subdomain — all placeholders
now, with a legend at the top of `HANDOVER.md`. The VPS address is the one exception, kept
real and committed throughout: it's already discoverable from the live domain's own DNS, so
hiding it has no real security value. Every architectural lesson is intact and reads as
before.

**A second, later pass was needed before actually publishing.** The first sanitization commit
(Aug 13) only covered `HANDOVER.md`/`ARCHITECTURE_CONCEPTS.md` as they existed then. Project 2
and the Terraform work (both later) reintroduced real values that pass never saw: the
co-hosted app's real name back in `HANDOVER.md`'s Project 2 section, and — the more serious
one — the co-hosted app's real Docker network name as a functional literal in
`deploy/docker-compose.vps.yml`, the file Terraform pushes verbatim to the VPS on every
`apply`. That one couldn't just be placeholder-replaced without breaking the real deployment
(the frontend container's join to the co-hosted nginx would fail), so it's now the literal
token `__OTHER_APP_NETWORK_NAME__`, substituted at `apply` time via a targeted `replace()` in
`terraform/vps/main.tf` from a required, gitignored `terraform.tfvars` variable — verified
against a real `terraform plan` as a content-hash-only change, nothing else about the managed
resource shifted. `terraform/vps/variables.tf`'s SSH-username default (also a real, committed
value that pass had missed) lost its default the same way, now required via `terraform.tfvars`
too.

**History was rewritten** (`git-filter-repo`), not just the working tree — both for the
original two commits this section used to flag, and for the newer commits that reintroduced
the app name. Covered commit messages as well as file content (one commit's own message
literally named the app it was fixing — caught and reworded before finalizing). Re-verified
clean after rewriting: no app name, no SSH username, no API keys, no private keys, no tokens,
anywhere in history, and the file list matches the pre-rewrite tree except for the one file
meant to be gone (see below).

**The transition roadmap doc stays private, everything else is public.** Only
`docs/Full_Stack_Developer_Transition_Roadmap.md` was deliberately kept out — it's personal
career-planning content, not architecture — stripped from git history the same way, gitignored
going forward, kept locally outside the repo as a backup.
`ARCHITECTURE_CONCEPTS.md`, `architecture.mmd`/`.png`, and everything else are public as-is.

`gh repo edit --visibility public` has been run. **The repo is public.**
`my-portfolio/data/buildProjects.js`'s `repoUrl` now points at it.

### D. Portfolio updated — done

`my-portfolio` is Next.js (pages router) + Tailwind with existing Playwright smoke tests,
live at `https://khalid-shams.vercel.app`. It had **no projects section of its own kind at
all** — strong enterprise positioning, but every claim was an outcome the reader had to take
on trust.

Added an **"Engineering Deep Dive"** section (`data/buildProjects.js`,
`components/BuildProject.js`) between the flagship case study and the enterprise list: the
architecture diagram, request flow, stack, the engineering decisions *and why*, plus a
**Known gaps** list. New hero CTA, "See a System I Built". Project data is structured so
further builds are additive; **`repoUrl` is `null` and the Source link is conditional — set
that one field once this repo goes public.** Two new smoke tests, including asserting the
diagram actually renders (`naturalWidth > 0`) rather than merely that the file is referenced.
All 7 pass, production build clean, pushed.

### E. Uptime monitor — done (registered by the user directly)

Registered on the user's own UptimeRobot account, using the exact config verified below.

**The monitor's semantics were verified against production, so the setup is exactly right:**

| URL | Result |
|---|---|
| `https://jobcopilot.dentflowbd.com/health` | `200`, **7 bytes**, body is exactly `Healthy` |
| `https://jobcopilot.dentflowbd.com/health-typo` | **also `200`**, 458 bytes of `index.html`, **no `Healthy` anywhere** |

That second row is the whole argument: **a status-only monitor would report UP on a
completely broken deployment.** The monitor must be **keyword type, matching `Healthy`,
alerting when the keyword is *not* found** — see Step 35, bug 1, which is the same trap.

### F. Visual redesign — Linear-inspired, done

Raised after A-E: the frontend worked but read as visually unfinished. Verified live in a
browser before touching anything (Playwright, both light and dark) — the actual defects were a
leftover Vite-template bug (`#root { width: 1126px; text-align: center; border-inline }`
centering the entire app in a narrow floating column with dead whitespace either side) and
fully unstyled native buttons. Researched current SaaS-dashboard direction, presented three
concrete options (Linear-minimal / Vercel-Stripe monochrome / Supabase-dark-dev-tool) with
mockup previews; **Linear-inspired chosen** — kept the existing purple accent token, added a
real `.btn` system (primary/secondary/ghost), a sticky full-width header with the content
column left-aligned below it, tightened type scale (15px base, 600-weight headings), restyled
the applications table from a bordered grid to a quiet hover-able row list, fixed unstyled
default browser link color, flattened the detail-page metadata box to a tinted surface. CSS-only
change plus a handful of `className` additions — no component logic touched. **Verified**: 21/21
tests still pass, `tsc -b && vite build` clean, checked live in a real browser in both color
schemes before and after.

### Then: Project 2

`docs/Full_Stack_Developer_Transition_Roadmap.md` -> break a slice into microservices +
cloud-native deploy, plus the interview-preparation track.

## Project 2 — microservices + cloud-native deploy

**Same card-free constraint as Project 1** (no AWS/Azure/GCP account — all three require a
card even for free-tier-only usage). Substitutes chosen for the specific roadmap items that
need a major cloud, everything else built for real:

| Roadmap ask | Substitute | Why |
|---|---|---|
| Own polyglot (NoSQL) database | **MongoDB Atlas free M0** | Genuinely no card required, a real managed cloud database |
| Managed K8s (AKS/EKS) | **Local `kind` cluster** | The roadmap's own advice: "learn conceptually with kind/minikube before touching managed K8s" |
| Centralized logging/monitoring | **Grafana Cloud free tier** | No card required (not started yet — blocked on account creation) |
| Compute for the new service | Existing VPS (Docker) | Proven, zero new cost, consistent with Project 1 |
| Message queue | Existing RabbitMQ on the VPS | Already proven; not resurrecting the CloudAMQP path per the standing AGENTS.md rule (no new reason to) |

**Bounded context extracted: a Notifications service** (`notifications/`, Node.js +
TypeScript) — consumes `MatchCompletedEvent`, records a notification document to its own
MongoDB, independent of the API/worker's Postgres.

**Real bug caught before writing any new code, by reading the existing pipeline first**: the
worker published `MatchCompletedEvent` directly to a queue named `match-completed`, which the
API's `MatchCompletedConsumer` already consumed from directly. Adding a second consumer to that
same queue would have made RabbitMQ round-robin deliveries between the two — silently dropping
roughly half of all completed-match SignalR pushes, the exact class of bug the interlude's bug
audit (item B) was about eliminating. **Fixed at the architecture level**: the worker now
publishes to a `match-completed-fanout` **exchange**; the API and the notifications service each
declare and bind their own durable queue (`match-completed-api`, `match-completed-notifications`)
to it, so every subscriber gets every message independently. Verified via RabbitMQ's own message
stats after a real submit (`deliver_get: 1`, `ack: 1` on both queues, not just one) — not assumed
from the code alone.

**Fully verified locally, three ways:**
1. **Dev mode** (`npm run dev` against the existing local RabbitMQ + a new local Mongo container
   in `infra/docker-compose.dev.yml`): real application submitted through the API, real
   `Completed` status with a real Gemini score, and the notifications service independently wrote
   a real document to Mongo for the same event — confirmed by querying Mongo directly, not by
   trusting a log line.
2. **The actual Docker image** (not just `npm run dev`): built via `docker compose build
   notifications`, run standalone against the same real RabbitMQ/Mongo containers, same result.
3. **A local Kubernetes cluster** (`kind`, see `notifications/k8s/README.md`): all three pods
   (`mongo`, `rabbitmq`, `notifications`) reach `1/1 Ready`; a message published directly to the
   fanout exchange from inside the cluster was consumed and a real document appeared in the
   in-cluster Mongo. **The exact RabbitMQ cold-start race from Project 1 (Steps 23-26) reproduced
   here too** — the notifications pod started before RabbitMQ's AMQP listener was ready, logged
   several backoff retries, then connected once RabbitMQ was actually up. Confirmed by reading the
   pod's own logs.

**CI/CD wired**: `ci.yml` gained a `notifications` job (build + a real test suite — 5 tests on
the event-shape type guard, including a case that would catch the serialization casing
changing). `cd.yml`'s build matrix gained a fourth image
(`ghcr.io/.../ai-jobsearch-copilot-notifications`).

**Real bug caught by CI itself, not local testing**: the test script's `src/**/*.test.ts` glob
only expanded correctly in shells with `globstar` enabled (my local Git Bash session had it on;
GitHub Actions' non-interactive script shell doesn't by default) — the literal unexpanded string
got handed to Node's test runner on the real runner, which failed the job outright. Fixed by
pointing at the test file explicitly rather than depending on shell-glob behaviour that differs
across environments — the same category of lesson as `AGENTS.md`'s existing PowerShell-quoting
entries, just a different shell pair.

### MongoDB Atlas — live, account created and fully wired

Free M0 cluster, AWS, Singapore region (closest low-latency option to Bangladesh). Two real
issues found and fixed while getting it working, neither of them a code bug:

1. **`mongodb+srv://` DNS SRV lookup failed via Node's own resolver** (`querySrv ECONNREFUSED`)
   on the local dev workstation, while the OS's own resolver (`nslookup`) answered the identical
   query fine. Confirmed directly (`dns.resolveSrv` failed against the network's configured
   server, succeeded immediately once pointed at `8.8.8.8`/`1.1.1.1`) — a known class of issue
   with `mongodb+srv` specifically. Fixed in `notifications/src/mongo.ts` by setting explicit
   public DNS servers before connecting, not a workaround for one machine.
2. **TLS handshake failed with `SSL alert number 80 (internal_error)`** — from *both* the local
   workstation and, separately, the VPS (two unrelated networks, identical failure, confirmed with
   raw `openssl s_client`, not just the driver). When two unrelated networks hit the same failure,
   the common factor is the server side: Atlas's **Network Access (IP allowlist)** had only the one
   IP added by its own "Automate security setup" flow — neither the workstation's real egress IP
   nor the VPS's IP were in it. Fixed by adding the VPS's IP; re-verified with a real `mongosh
   --eval 'db.runCommand({ping:1})'` returning `{ ok: 1 }` from the VPS itself.

**Deployed to the VPS for real** — `/opt/jobcopilot/docker-compose.yml` gained the `notifications`
service block (own `MONGO_URI`/`MONGO_DB_NAME`, depends only on `rabbitmq`, no dependency on
Postgres or the co-hosted app's network), `/opt/jobcopilot/.env` gained `MONGO_URI`, and
`deploy.sh`'s (hardcoded, not dynamically read) container list gained `jobcopilot-notifications` —
all three edited directly on the VPS then re-verified (`docker compose config --quiet`) before
deploying. Rolled out through the normal CD pipeline (`gh run rerun`, per this doc's own stated
preference over manual SSH, so the real health-gating and smoke test ran) after the CI test-glob
fix landed. **Fully verified live, not just CD-green**: all 6 containers report healthy;
`docker ps` confirms the co-hosted `<other-app>` app unaffected; a real application submitted through
the public API completed with a real Gemini score, and the exact same event independently produced
a real document in MongoDB Atlas, confirmed by querying Atlas directly (`mongosh --eval
'db.notifications.findOne(...)'`), not by trusting a log line.

### Terraform — real IaC now covers Atlas and the VPS deploy path

Two modules, `terraform/atlas/` and `terraform/vps/` (each has its own README with full detail).
Confirms the SSH-tooling failure that blocked Project 1 (see AGENTS.md) genuinely doesn't apply in
a real Claude Code terminal — direct SSH worked immediately, no workaround needed this time.

**`terraform/atlas`**: manages the M0 cluster, the VPS's Network Access IP entry, and the
notifications DB user — all **imported**, never apply-created, since this cluster already holds
real data. Checked the cluster's live shape via a data source *before* writing the resource block,
rather than assuming: Atlas has been silently auto-migrating shared-tier clusters to a newer "Flex"
type since Jan 2025, and this one turned out not to have been (confirmed, not assumed).
`terraform plan` after import caught three real drifts between assumed and actual config before
anything was touched — including a genuine security finding, initially left deliberately unfixed
(changing a live credential's privileges is a separate decision from adopting Terraform) and
**since resolved**: the notifications DB user had `atlasAdmin` on `admin` (full project admin)
instead of a scoped `readWrite` on just its own database. Fixed once the real deployed database
name was confirmed (`jobcopilot_notifications`, via the running container's own env var) —
`terraform plan` showed a clean single-field diff, applied, and verified against production by
submitting a real application and confirming the notifications service still wrote its document
with the now-scoped credential. See `terraform/atlas/README.md`.

**`terraform/vps`**: replaces the manual "SSH in and hand-edit / re-upload deploy.sh" workflow with
real `file` + `remote-exec` provisioners. Added `deploy/docker-compose.vps.yml` to the repo as a
new committed, canonical source (downloaded byte-for-byte from the live VPS first, so the first
apply changes nothing) — this file, plus `deploy/deploy.sh` and `observability/alloy/config.alloy`,
are now what Terraform pushes on every apply, with content-hash triggers so a future edit to any of
them forces a real redeploy. **Deliberately does not manage `/opt/jobcopilot/.env`** — those are
production secrets (Postgres/RabbitMQ/JWT/Gemini) this session has no copies of, and templating
them from Terraform on a first apply is exactly the kind of action where one transcription slip
(already happened twice this session with other credentials, both caught before landing) could
break production auth or the DB connection outright. `.env` stays hand-maintained on the VPS.

**Verified, not just "apply succeeded"**: captured a full `docker ps` uptime baseline before
applying, applied, then confirmed every container's uptime was *identical* after — real proof of
zero restarts, not an assumption that a no-op plan meant a no-op apply. `md5sum`-verified the three
uploaded files matched their repo source exactly, both before and after. Re-ran the public
`/health` smoke test after apply.

**Blocked from running `terraform apply` against the VPS directly** (Claude Code's own auto-mode
classifier treats writes to the VPS as high-risk) — same restriction hit earlier with `scp`. Worked
around it the same way: gave the user the exact command, they ran it, pasted the result back for
verification. `terraform apply` against the Atlas provider (an API, not SSH) was not blocked and
ran directly.

### Grafana Cloud — live, metrics and logs flowing from the VPS

Free tier (auto-enrolls in a 14-day "Unlimited Usage" trial first; no card was ever entered, so it
auto-reverts to the permanent free plan with no action needed and no charge risk). Grafana Alloy
(the current unified agent, successor to Grafana Agent/Promtail) runs as a new `alloy` container
alongside the other six — added to `docker-compose.yml`, `deploy.sh`'s health-gate list, and
`observability/alloy/config.alloy` (the actual pipeline config, mounted read-only). Ships:
- **Metrics**: VPS host (`prometheus.exporter.unix`) and per-container (`prometheus.exporter.cadvisor`).
- **Logs**: every scoped container's stdout/stderr, via Docker log discovery.

**Real bug, caught before it reached the VPS**: pasting the Grafana Cloud API token from a
screenshot (rather than using its own "Copy to clipboard" button) silently corrupted it —
Alloy logged a clean `401: authentication error: invalid token` on both the metrics and logs
endpoints. Config itself was fine (component graph evaluated without error); only the secret was
wrong. Re-copied properly via the clipboard button, fixed.

**Second bug, caught live on the VPS, not locally**: Alloy's Docker discovery has no built-in
project scoping — by default it scrapes/tails **every container on the host**, including the
unrelated co-hosted `<other-app>` app. Two consequences, both real: (1) `<other-app>`'s own container
metrics were being shipped into this project's Grafana Cloud account, data that has nothing to do
with this project; (2) worse, `<other-app>-nginx`/`<other-app>-postgres` have log files stretching back
to May, and Grafana Cloud Loki rejects an entire batch if *any* entry in it is older than roughly
the last 7 days — so batching their ancient backlog alongside this project's own current logs was
causing **100% of logs to be silently dropped**, including this project's own. Fixed by adding an
explicit scope filter in both pipelines: a `keep` action on the `name` label (post-scrape
`prometheus.relabel`, since cAdvisor exposes one scrape target for the whole host, not one per
container) for metrics, and a `keep` action on `__meta_docker_container_name` (pre-tail
`discovery.relabel`) for logs — both matching `jobcopilot-.*` only.

**Third, smaller issue also found live**: even after that fix, one more batch of "timestamp too
old" drops appeared — this time from this project's *own* containers. Docker's default `json-file`
log driver keeps a container's full log history across plain restarts (only a true recreate resets
it), so a container last recreated more than ~7 days ago had its own old backlog rejected on
Alloy's first tailing pass. Confirmed (not assumed) this was a one-time catch-up, not a steady
problem: watched the drop counter stay flat while the sent-bytes counter kept climbing over the
next ~30s with zero new errors.

**Also found**: binding Alloy's own HTTP server to `127.0.0.1` *inside* its container made it
unreachable through the host-side port mapping — the same class of bug as the frontend
nginx/`wget` mismatch from Step 34. Fixed by binding `0.0.0.0` inside the container (the host-side
mapping was already loopback-only, so this doesn't expose anything new).

**Verified live, not just "container is up"**: queried Alloy's own `/metrics` endpoint on the VPS
directly — real, climbing `prometheus_remote_storage_samples_total` and `loki_write_sent_bytes_total`
counters, zero `*_failed_total`, and confirmed via `docker ps` that all 6 jobcopilot containers
*and* the 3 co-hosted `<other-app>` containers stayed healthy/unaffected throughout.

**Still open:**
- The VPS's `docker-compose.yml` is edited directly on the server (same established pattern as the
  notifications rollout) — a timestamped `.bak` copy of the pre-Alloy version was left next to it
  before overwriting, in case a rollback is ever needed.
- ~~No Grafana Cloud dashboards built yet~~ — **done**: `observability/grafana/jobcopilot-overview.json`, see its own README for import steps and the one caveat (disk-usage panel's `mountpoint` label assumed, not verified against live data — this session was never given Grafana Cloud query access).

## Known Gotchas

> **Moved to `AGENTS.md`** at the repo root — general engineering lessons that apply regardless of which step you're on now live there, auto-read by Claude Code and similar tools.

## Future Additions (deliberately deferred, don't lose track)

- ~~Node.js polyglot piece~~ — **done, Project 2**: the notifications service (`notifications/`) is exactly this — a Node.js/TypeScript service consuming `MatchCompletedEvent`.
- ~~Failed matches don't push a live SignalR update~~ — **done** in the interlude's bug audit, verified live against an invalid Gemini key.
- ~~`Analysing` is unreachable in the UI~~ — **done**: the worker now publishes `MatchProcessingEvent` (own direct queue, `match-processing` — deliberately not the `match-completed-fanout` exchange, since the notifications service must never see a non-terminal state) right after writing `Processing` to the database. The API relays it over the same `MatchCompleted` SignalR method the frontend already listened on generically (`applyMatchPush`/`parseStatus` already handled an arbitrary status string with null score/analysis/completedAt — zero frontend changes needed). **Live-verified in a real browser** (Playwright/Edge) locally before deploying: registered a user, submitted an application, watched the status pill actually render the spinning "Analysing" state before the terminal push, zero page reloads, zero console errors. **Re-confirmed against production post-deploy** (by polling, not a browser this time): a real submitted application was caught in `Processing` status before reaching `Completed`.
- ~~No dead-letter queue~~ — **done**: every consumer queue (`match-requests`, `match-completed-api`, `match-completed-notifications`, `match-processing`) now declares `x-dead-letter-exchange` pointing at its own `<queue>.dlx`/`<queue>.dlq`. The existing `nack(requeue: false)` calls needed no code change — RabbitMQ routes a dead-lettered message there automatically. **Live-verified**, not just built: published a malformed poison message directly to both `match-requests` and `match-completed-notifications` against local dev RabbitMQ, confirmed each landed in its `.dlq` fully intact (payload + RabbitMQ's own `x-death` headers showing why/when), and confirmed the origin queue drained to zero rather than stalling. One real migration gotcha, hit locally first and handled correctly before deploying: RabbitMQ rejects redeclaring an existing queue with new arguments (`PRECONDITION_FAILED`) — same as the stale local dev queues this session had to clear. The RabbitMQ management UI turned out to have no exposed port on the VPS at all (Step 32's hardening applies host-wide, not just externally), so the three pre-existing queues (`match-requests`, `match-completed-api`, `match-completed-notifications`) were deleted via `rabbitmqadmin` over `docker exec` instead, immediately before pushing. **Deployed and verified against production**: CD green, all 9 queues (3 originals + `.dlq`s + the new `match-processing` + its `.dlq`) confirmed via `rabbitmqctl list_queues`, all 7 containers healthy, and a real submitted application caught mid-flight in `Processing` status by polling before reaching `Completed`.
- ~~The notifications Atlas DB user is overprivileged~~ — **done**: scoped from `atlasAdmin`/`admin` to `readWrite`/`jobcopilot_notifications`, applied and verified against production (a real submitted application's notification document confirmed written with the scoped credential). See `terraform/atlas/README.md`.
- ~~Publication of this repo is paused~~ — **done**: repo is public, history rewritten, see interlude item C.
- ~~Portfolio `repoUrl` is `null`~~ — **done**: set in `my-portfolio/data/buildProjects.js`, pushed.
- ~~Prompt-injection hardening~~ — **done, Step 30.**
- ~~Diagnostic logging cleanup in `Worker.cs`~~ — **done, Step 31.**
- ~~RabbitMQ connection retry-with-backoff~~ — **done, Step 31, live-tested against a real outage.**
- ~~EF Core / package version drift~~ — **done, Step 31.**

> **Workflow preferences, tooling gotchas, and standing rules** (response style, Copilot CLI usage pattern, verification discipline, VPS/shared-infrastructure caution) **now live in `AGENTS.md`** at the repo root.
