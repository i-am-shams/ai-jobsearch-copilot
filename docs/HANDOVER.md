# AI Job-Search Copilot — Project Handover / State Doc

> **Purpose:** this file is the single source of truth for project state across chat sessions. Any new Claude session should read this file first before continuing the build. Update it after every completed step.

**Last updated:** Step 33 complete — **live on the real VPS, fully verified including browser SignalR over the real domain.** About to start Step 34/35 (TLS already covered by existing wildcard cert — verify this is durable; extend CD pipeline to auto-deploy on push)

## 🚀 LIVE DEPLOYMENT

**https://jobcopilot.dentflowbd.com** — running on the user's own VPS (`144.79.132.100`), alongside their other production project (<other-app>), sharing its nginx via a Docker external network, zero disruption to it. Full pipeline live-verified: auth, async matching (Postgres/RabbitMQ/worker/Gemini all containerized on the VPS), and live SignalR push confirmed in a real browser through two layers of nginx.

- VPS deployment files live at `/opt/jobcopilot/docker-compose.yml` and `/opt/jobcopilot/.env` **on the VPS itself, not in this git repo** (environment-specific, contains real secrets)
- New nginx site config: `/opt/<other-app>/nginx/conf.d/jobcopilot.conf` (new file, existing config for the other project untouched)
- To redeploy manually right now (until Step 35 automates this): `ssh <deploy-user>@144.79.132.100 "cd /opt/jobcopilot && docker compose pull && docker compose up -d"`

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

## Next Step (34/35)

TLS is already covered (existing wildcard cert) — nothing to do there. Remaining: extend `cd.yml` so pushes to `master` auto-deploy to the VPS (currently manual: `ssh <deploy-user>@144.79.132.100 "cd /opt/jobcopilot && docker compose pull && docker compose up -d"`), basic monitoring/health-check alerting, and the final README + architecture diagram + honest "decisions and tradeoffs" writeup — including the Terraform gap named plainly, not hidden.

## Known Gotchas / Things That Tripped Us Up (don't repeat)

- NuGet defaults to latest major package version even on a .NET 8 project — always pin explicitly (`8.0.*` for EF Core/ASP.NET packages; other packages need their own known-good version checked, e.g. `RabbitMQ.Client` pinned to `6.8.1` in Step 20 to avoid the newer major version's breaking API changes). This is a general rule, not specific to one package.
- Docker Compose port mapping is `hostPort:containerPort` — container-side must stay `5432` for Postgres regardless of what host port you choose.
- Run `docker compose` commands from the `infra/` folder, or pass the full path to the compose file.
- **CORS + `UseHttpsRedirection()`**: any local dev setup with frontend and API on different ports needs explicit CORS configuration — the browser blocks cross-origin requests by default. `UseHttpsRedirection()` will also break plain-http frontend calls if left in for local dev.
- **JWT claim remapping**: ASP.NET Core's JWT Bearer middleware silently renames claim types like `sub` by default. Set `options.MapInboundClaims = false` explicitly if you need to read standard JWT claim names as-issued — don't work around it with manual token re-parsing.
- **AI-assisted dev failure mode observed directly**: when Copilot hits an error, it tends to patch the symptom locally (add a fallback, catch and retry) rather than diagnose the root cause. Worth deliberately reviewing AI-written code for this pattern, not just checking that it compiles/runs.
- **NuGet version drift isn't limited to EF Core.** `Microsoft.Extensions.Http`/`System.Net.Http.Json` were found pinned to `10.0.10` (a .NET 10 version) inside a `net8.0` project — same root cause as every prior pinning gotcha (an unpinned `dotnet add package` grabbing "latest"). Check *all* package versions against the target framework when reviewing a `.csproj`, not just the packages that happened to cause visible errors before.
- **`ssh.exe` on Windows produced zero output through every invocation method tried** in this environment (`Desktop Commander:start_process`, `Start-Process` with redirected streams, piping to a file) — even basic flags like `-V` or `BatchMode=yes` (which should force fast, loud failure) produced nothing, no error, no timeout message. Basic non-SSH command redirection worked fine in the same environment, isolating the issue to `ssh.exe` specifically — likely related to it expecting a real console/PTY that this environment's process spawning doesn't provide. **No fix found; worked around, not solved**: fell back to guided manual execution — Claude writes exact commands, the user runs them in their own real terminal, pastes results back for verification at each step. If a future session has working SSH access, this workaround may no longer be necessary — worth testing directly before assuming it's still needed.
- **Read existing operational documentation before touching shared infrastructure.** The co-hosted project's own ops runbook (`docs/29_vps_production_operations_runbook.md`) revealed a pre-existing wildcard DNS record, wildcard TLS cert, and the fact that its nginx runs inside Docker — each of these materially changed the deployment plan, and each was verified live rather than trusted blindly from the doc alone (e.g., the wildcard cert was confirmed via `openssl x509`, not assumed from the runbook's prose).
- **Scope credentials to the minimum needed, every time — even for "just pulling an image."** The first GitHub PAT generated for VPS image pulls defaulted to `repo` (full read/write on all repositories) and `write:packages`. Caught before use; corrected to `read:packages` only, with an explicit expiration set. A credential living indefinitely on a remote server should never carry more access than its actual job requires.
- **When integrating with a live server hosting an unrelated project, look for a way to be purely additive before assuming you need to edit shared config.** Originally planned to edit the co-hosted project's `docker-compose.yml` to add a shared network — turned out unnecessary once the network's actual (non-default) name was discovered via `docker network ls`: an `external: true` network reference in *this* project's own compose file was sufficient. Zero lines changed in the other project's files.
- **Always use `import type { }` for TypeScript interfaces/types**, never plain `import { }`. Vite's dev-mode transform (esbuild) processes files individually and doesn't always reliably elide type-only imports, causing a runtime `SyntaxError` for something that's actually just a compile-time construct.
- **Extracting a shared library: move files, don't copy them.** Copying models into `JobCopilot.Contracts` while leaving the originals in place created an orphaned duplicate that compiled silently (C# allows identical class names in different namespaces) — only caught by deliberately reading the file tree, not by trusting a successful build.
- **AI model version strings go stale fast.** `gemini-1.5-flash` was already fully shut down (404) by the time it was used — always verify current model availability via live search rather than assuming prior knowledge is current, especially for fast-moving AI provider APIs.
- **`Start-Process -NoNewWindow` requires an attached console.** Fails silently (returns `$null`) when a script is launched headlessly/programmatically. Use `-RedirectStandardOutput`/`-RedirectStandardError` to log files instead for scripts that might run outside an interactive terminal.
- **A build succeeding or a service starting is not proof a feature works.** Only exercising the actual behavior (a real request, a real response) counts as verification — a self-generated report claiming "complete" with an unperformed "how to verify" checklist is a pattern worth recognizing and distrusting.
- **Don't mistake test timing for a bug.** Polling too soon after triggering an async AI call can show a stale intermediate state (`Processing`) that looks alarming but is just normal latency — re-check before concluding something's broken.
- **A build succeeding in dev mode is not proof it will succeed in production.** `npm run dev` (esbuild, lenient) can mask errors that `npm run build` (`tsc -b`, strict) catches — run the real production build at least once before assuming the frontend is deployment-ready.
- **EF Core migrations assume the `DbContext` and its migrations live in the same assembly by default.** The moment they're split across projects (as happened when `AppDbContext` moved into `JobCopilot.Contracts`), migrations silently stop being discovered unless `.MigrationsAssembly("...")` is explicitly configured. Verify with `dotnet ef migrations list` against a genuinely fresh database, not an already-populated one — an existing database can mask this bug indefinitely.
- **Don't trust that an AI coding tool's safety heuristics only affect its display output.** Copilot CLI's secret-redaction logic corrupted an actual file it wrote (not just its terminal echo) by masking a harmless placeholder password. Verify security-adjacent file content (connection strings, credentials, anything password-shaped) byte-for-byte after any AI tool writes it — "the write succeeded" is not the same as "the content is correct."
- **`depends_on: condition: service_healthy` in Docker Compose is necessary but not always sufficient.** A healthcheck can report "healthy" slightly before the actual service is ready for new connections (RabbitMQ's AMQP listener vs. its Erlang-node healthcheck, here) — don't rely on compose-level health gating alone for genuinely critical startup dependencies; add retry logic in the app itself too.
- **A "test" stage in CI is meaningless if there are no real tests to run.** `dotnet test` against a solution with zero test projects succeeds trivially, giving false confidence — worth adding genuine tests before wiring up CI's test stage, not after.
- **Claude's own specs can be wrong too, not just Copilot's implementations.** A stale namespace reference (`Models.User` instead of the post-refactor `JobCopilot.Contracts.User`) was written directly into a prompt file by Claude — caught the same way everything else is caught: by actually building it, not by trusting the source.
- **Copilot CLI with only `write` tool permission may not reliably create new nested directories.** It hung indefinitely attempting several approaches when asked to create files in `.github/workflows/` and a new test project folder that didn't exist yet. Pre-create parent directories manually before invoking Copilot CLI for file-creation tasks in genuinely new folders.
- **NuGet version drift isn't limited to EF Core.** `Microsoft.Extensions.Http`/`System.Net.Http.Json` were found pinned to `10.0.10` (a .NET 10 version) inside a `net8.0` project — same root cause as every prior pinning gotcha (an unpinned `dotnet add package` grabbing "latest"). Check *all* package versions against the target framework when reviewing a `.csproj`, not just the packages that happened to cause visible errors before.

## Future Additions (deliberately deferred, don't lose track)

- **Node.js polyglot piece**: a small Node.js service consuming `MatchCompletedEvent` (e.g., logs/webhooks on match completion) — planned as an *additive*, low-risk demonstration of polyglot architecture. Unblocked since Step 22, not yet started.
- **Failed matches don't push a live SignalR update** — only success does. Known limitation from Step 22, not yet fixed.
- ~~Prompt-injection hardening~~ — **done, Step 30.**
- ~~Diagnostic logging cleanup in `Worker.cs`~~ — **done, Step 31.**
- ~~RabbitMQ connection retry-with-backoff~~ — **done, Step 31, live-tested against a real outage.**
- ~~EF Core / package version drift~~ — **done, Step 31.**

## User Context (for tone/pacing calibration)

- Experienced backend dev (ASP.NET/C# since 2010), rusty on modern frontend/cloud-native/DevOps, not a beginner — skip beginner analogies, use direct technical language.
- Prefers terse "what & why" recaps after each step. **From Step 21 onward: prefers compact, bullet-style chat responses generally**, not just recaps.
- Background: IIS deployment experience only — the "deployment has evolved" explainer (IIS vs. containers/orchestration/CI-CD) was delivered at the Step 22→23 boundary. **Delivered, not owed anymore.**
- **From Step 20 onward: uses GitHub Copilot CLI (`copilot` command) invoked directly by Claude via shell access**, not VS Code Copilot chat. Claude writes the spec, invokes `copilot -p "..." --model claude-haiku-4.5` with scoped `--allow-tool` permissions, then verifies by reading the actual files. Batch related file-creation tasks into one Copilot CLI call where possible (explicit user preference — token/request efficiency) rather than one call per file. Avoid inlining large/quote-heavy prompts directly in the shell command (causes argument-escaping corruption) — write the spec to a file and point Copilot at it instead, or keep inline prompts short and quote-free.
- Working step-by-step, confirms each step before moving to the next.
- **From Step 16 onward: writes code via GitHub Copilot directly in the repo**, not chat-pasted. Claude verifies by reading actual files (has direct filesystem access via Desktop Commander/Filesystem MCP tools), not by trusting chat summaries alone.
- Maintains `docs/ARCHITECTURE_CONCEPTS.md` in parallel — every step (going forward, including retroactively for 1–16) gets an entry there: Architectural Viewpoint & Arguments, Plain-Language Definitions, File Mapping. Claude writes this proactively without being asked each time.
