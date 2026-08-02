# AI Job-Search Copilot — Project Handover / State Doc

> **Purpose:** this file is the single source of truth for project state across chat sessions. Any new Claude session should read this file first before continuing the build. Update it after every completed step.

**Last updated:** Step 11 complete, about to start Step 12
**Reference doc:** `Full_Stack_Developer_Transition_Roadmap.md` (contains the full 3-project roadmap; this project is Project 1)

---

## Project Summary

Small full-stack app: paste a resume + job description → AI extracts skills from both → computes a match score + gap analysis → tracked over time on a dashboard. Built deliberately "over-engineered" (event-driven, async worker, real-time updates) to demonstrate senior/architect-level patterns, not just CRUD.

## Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript (Vite) | `npm create vite@latest . -- --template react-ts` |
| API | ASP.NET Core 8 Web API | Controllers, not minimal APIs |
| Worker | TBD — Week 2 | Likely Node.js, for polyglot demonstration |
| DB | PostgreSQL 16 (Docker) | Host port **5433** (5432 was taken by local install) |
| ORM | EF Core 8 | Npgsql provider |
| Auth | JWT + BCrypt | Custom, not Identity framework |
| Queue | RabbitMQ (local) → SQS/Azure Service Bus (cloud) | Week 2 |
| Real-time | SignalR | Week 2, pushes match results to frontend |
| Vector search | Postgres `pgvector` extension | For embeddings-based match scoring, later phase |
| Containerization | Docker Compose (dev) | `infra/docker-compose.dev.yml` |
| CI/CD | GitHub Actions | Week 3 |
| Cloud IaC | Terraform | Week 4 |

## Key Architecture Decisions & Why

- **Guid primary keys, app-generated** (`= Guid.NewGuid()` at declaration) — not DB-generated, not int/identity. Reason: IDs need to exist in C# code before DB save, since they'll be published onto the message queue in the same request (Week 2). Also avoids enumerable/guessable IDs and works cleanly in a distributed/event-driven setup.
- **`MatchResult` is a separate entity from `Application`**, 1:1 relationship, not just columns on `Application`. Reason: `MatchResult` needs independent state (`Pending/Processing/Completed/Failed`) because scoring will become an async, queue-driven operation in Week 2 — decoupling now avoids a schema change later.
- **Custom JWT + BCrypt auth**, not ASP.NET Core Identity. Reason: full control over the token payload and flow, and it's simpler to explain/defend in an interview than "Identity did it for me."
- **Postgres on host port 5433**, not default 5432. Reason: user already has a local Postgres install using 5432; container maps 5433 (host) → 5432 (container-internal, unchanged).

## Repo Structure

```
ai-jobsearch-copilot/
├── api/JobCopilot.Api/
│   ├── Models/          → User.cs, Application.cs, MatchResult.cs
│   ├── Data/             → AppDbContext.cs
│   ├── Services/         → AuthService.cs
│   ├── Program.cs        → DbContext + JWT middleware registered
│   └── appsettings.Development.json  → connection string + JWT config
├── worker/               → empty, Week 2
├── frontend/             → Vite + React + TS scaffold, not yet connected to API
└── infra/
    └── docker-compose.dev.yml  → Postgres only, so far
```

## Completed Steps (1–11)

1. ✅ Environment setup (.NET 8, Node 20, Docker, Git)
2. ✅ Monorepo structure (`api/ worker/ frontend/ infra/`)
3. ✅ Backend scaffolded (`dotnet new webapi`), EF Core + Npgsql + JWT packages pinned to `8.0.10` (not 10.x — SDK mismatch)
4. ✅ Frontend scaffolded (Vite + React + TS)
5. ✅ Postgres running in Docker, host port **5433** (fixed from initial 5432 conflict, then fixed `5433:5433` → `5433:5432` mapping bug)
6. ✅ Initial commit, `.gitignore` in place
7. ✅ EF Core models created: `User`, `Application`, `MatchResult` (Guid PKs, explained above)
8. ✅ `AppDbContext` created — 1:1 `Application ↔ MatchResult` relationship configured explicitly, unique index on `User.Email`
9. ✅ Connection string wired (`Host=localhost;Port=5433;...`), DbContext registered in `Program.cs`
10. ✅ Migration created and applied (`InitialCreate`) — confirmed tables exist via `psql \dt`: `Users`, `Applications`, `MatchResults`, `__EFMigrationsHistory`
11. ✅ Auth infrastructure: `AuthService` (BCrypt hash/verify, JWT generation), JWT middleware registered in `Program.cs` in correct order (`UseAuthentication()` before `UseAuthorization()`). Build succeeds, 0 warnings/errors. **No endpoints yet** — just wiring.
12. ✅ `AuthController` created — `/api/auth/register` and `/api/auth/login` endpoints. Register checks email uniqueness (app-level + DB unique index), hashes via BCrypt, returns JWT immediately. Login re-verifies password, returns fresh token. Tested via curl — confirmed working, valid JWT returned with correct claims (sub, email, issuer, audience).

## Next Step (13)

Build the `Applications` CRUD endpoints (create/list/get by id), scoped to the logged-in user via `[Authorize]` and the `sub` claim from the JWT. This is where a submitted resume+JD pairing actually gets saved — currently only auth exists, no core feature endpoints yet.

## Known Gotchas / Things That Tripped Us Up (don't repeat)

- NuGet defaults to latest major package version even on a .NET 8 project — always pin `--version 8.0.*` explicitly for EF Core/ASP.NET packages.
- Docker Compose port mapping is `hostPort:containerPort` — container-side must stay `5432` for Postgres regardless of what host port you choose.
- Run `docker compose` commands from the `infra/` folder, or pass the full path to the compose file.

## User Context (for tone/pacing calibration)

- Experienced backend dev (ASP.NET/C# since 2010), rusty on modern frontend/cloud-native/DevOps, not a beginner — skip beginner analogies, use direct technical language.
- Prefers terse "what & why" recaps after each step, not long explanations, unless the concept is genuinely new (e.g., Kubernetes, Terraform) — then a short plain-language explanation is fine.
- Background: IIS deployment experience only — flagged that a "deployment has evolved" explainer is owed once we reach Docker/K8s/cloud deploy steps (Week 3–4). **Don't forget this.**
- Working step-by-step, wants to confirm each step before moving to the next — don't batch multiple steps ahead.