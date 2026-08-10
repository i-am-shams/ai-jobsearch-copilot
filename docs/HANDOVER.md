# AI Job-Search Copilot — Project Handover / State Doc

> **Purpose:** this file is the single source of truth for project state across chat sessions. Any new Claude session should read this file first before continuing the build. Update it after every completed step.

**Last updated:** Step 20 complete, about to start Step 21
**Reference doc:** `Full_Stack_Developer_Transition_Roadmap.md` (roadmap), `ARCHITECTURE_CONCEPTS.md` (per-step architectural reasoning + concept definitions — read this for *why*, this file for *what/status*)

---

## Project Summary

Small full-stack app: paste a resume + job description → AI extracts skills from both → computes a match score + gap analysis → tracked over time on a dashboard. Built deliberately "over-engineered" (event-driven, async worker, real-time updates) to demonstrate senior/architect-level patterns, not just CRUD.

## Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript (Vite) | Running on `localhost:5173` or `5174` |
| API | ASP.NET Core 8 Web API | Controllers, not minimal APIs. Runs on `localhost:5220` |
| Worker | TBD — Week 2 | Likely Node.js, for polyglot demonstration |
| DB | PostgreSQL 16 (Docker) | Host port **5433** (5432 was taken by local install) |
| ORM | EF Core 8 | Npgsql provider |
| Auth | JWT + BCrypt | Custom, not Identity framework. `MapInboundClaims = false` set explicitly (see Gotchas) |
| Queue | RabbitMQ (local) → SQS/Azure Service Bus (cloud) | Week 2 |
| Real-time | SignalR | Week 2, pushes match results to frontend |
| Vector search | Postgres `pgvector` extension | For embeddings-based match scoring, later phase |
| Containerization | Docker Compose (dev) | `infra/docker-compose.dev.yml` |
| CI/CD | GitHub Actions | Week 3 |
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
├── api/JobCopilot.Api/
│   ├── Controllers/      → AuthController.cs, ApplicationsController.cs
│   ├── Models/           → User.cs, Application.cs, MatchResult.cs
│   ├── Data/             → AppDbContext.cs
│   ├── Services/         → AuthService.cs
│   ├── Messaging/        → MatchRequestedEvent.cs, IMessagePublisher.cs, RabbitMqPublisher.cs
│   ├── Migrations/       → InitialCreate
│   ├── Program.cs        → DbContext, JWT auth, CORS, all middleware registered
│   └── appsettings.Development.json  → connection string + JWT config
├── worker/               → empty, Week 2
├── frontend/src/
│   ├── api/client.ts             → shared axios instance, setAuthToken()
│   ├── context/AuthContext.tsx   → in-memory token/email state, login()/logout()
│   ├── types/application.ts      → ApplicationResponse, CreateApplicationRequest (mirrors API DTOs)
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

## Completed Steps (1–20)

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

## Next Step (21)

Build the worker service (`worker/` — currently empty) that consumes from the `match-requests` queue. For each message, it should call an AI API (embeddings + LLM call) to score the resume/JD match, then update the corresponding `MatchResult` row (status → `Completed`, populate `MatchScore` and `GapAnalysis`). This is where the "AI-assisted development" and "AI-infra" parts of the project's value proposition actually get built — everything so far has been infrastructure to support this step.

## Known Gotchas / Things That Tripped Us Up (don't repeat)

- NuGet defaults to latest major package version even on a .NET 8 project — always pin explicitly (`8.0.*` for EF Core/ASP.NET packages; other packages need their own known-good version checked, e.g. `RabbitMQ.Client` pinned to `6.8.1` in Step 20 to avoid the newer major version's breaking API changes). This is a general rule, not specific to one package.
- Docker Compose port mapping is `hostPort:containerPort` — container-side must stay `5432` for Postgres regardless of what host port you choose.
- Run `docker compose` commands from the `infra/` folder, or pass the full path to the compose file.
- **CORS + `UseHttpsRedirection()`**: any local dev setup with frontend and API on different ports needs explicit CORS configuration — the browser blocks cross-origin requests by default. `UseHttpsRedirection()` will also break plain-http frontend calls if left in for local dev.
- **JWT claim remapping**: ASP.NET Core's JWT Bearer middleware silently renames claim types like `sub` by default. Set `options.MapInboundClaims = false` explicitly if you need to read standard JWT claim names as-issued — don't work around it with manual token re-parsing.
- **AI-assisted dev failure mode observed directly**: when Copilot hits an error, it tends to patch the symptom locally (add a fallback, catch and retry) rather than diagnose the root cause. Worth deliberately reviewing AI-written code for this pattern, not just checking that it compiles/runs.
- **Always `Ctrl+C` a dev server before starting a new one.** Orphaned processes silently squat on ports (5173 → 5174 → 5175...), and an old browser tab pointed at a stale port serves outdated code that looks like a mysterious regression.
- **Always use `import type { }` for TypeScript interfaces/types**, never plain `import { }`. Vite's dev-mode transform (esbuild) processes files individually and doesn't always reliably elide type-only imports, causing a runtime `SyntaxError` for something that's actually just a compile-time construct.

## User Context (for tone/pacing calibration)

- Experienced backend dev (ASP.NET/C# since 2010), rusty on modern frontend/cloud-native/DevOps, not a beginner — skip beginner analogies, use direct technical language.
- Prefers terse "what & why" recaps after each step.
- Background: IIS deployment experience only — flagged that a "deployment has evolved" explainer is owed once we reach Docker/K8s/cloud deploy steps (Week 3–4). **Still owed, don't forget.**
- Working step-by-step, confirms each step before moving to the next.
- **From Step 16 onward: writes code via GitHub Copilot directly in the repo**, not chat-pasted. Claude verifies by reading actual files (has direct filesystem access via Desktop Commander/Filesystem MCP tools), not by trusting chat summaries alone.
- Maintains `docs/ARCHITECTURE_CONCEPTS.md` in parallel — every step (going forward, including retroactively for 1–16) gets an entry there: Architectural Viewpoint & Arguments, Plain-Language Definitions, File Mapping. Claude writes this proactively without being asked each time.
