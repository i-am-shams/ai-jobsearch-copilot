# Architecture & Concepts — Onboarding Document

> **Purpose:** this is the companion doc to the code itself. `HANDOVER.md` tracks *what's done and what's next* (session state). This doc explains *why the code looks the way it does* — architectural reasoning, plain-language definitions of concepts introduced, and exactly which files each step touches. Written so a fresh developer (or a fresh you, in six months) can understand the system without re-deriving every decision.

Each step below follows the same structure: **Architectural Viewpoint & Arguments** (why this way, alternatives, tradeoffs), **Plain-Language Definitions** (concepts introduced), **File Mapping** (what was touched).

---

## Step 1–2: Environment Setup & Repo Structure

### Architectural Viewpoint & Arguments

We chose a **monorepo** (one Git repository containing `api/`, `frontend/`, `worker/`, `infra/` as sibling folders) rather than separate repos per service.

- **Why this way:** at this project's scale (one developer, a handful of services), a monorepo means one `git clone`, one place to see the whole system, and no version-mismatch headaches between services during early development.
- **Alternative considered:** polyrepo (separate Git repo per service) — standard at larger companies where different teams own different services independently. Rejected here because it adds coordination overhead (versioning, cross-repo PRs) with no corresponding benefit for a single-developer portfolio project.
- **Tradeoff to be aware of:** monorepos can get unwieldy at large scale (many teams, huge codebases) — that's *why* polyrepo exists at companies like Google-scale orgs use monorepos too, but with heavy tooling). For this project's size, the simplicity wins outright.

### Plain-Language Definitions

- **Monorepo:** "mono" = one, "repo" = repository. One Git repository holding multiple, technically independent pieces of software (here: a backend API, a frontend website, and a worker service) as subfolders, instead of each living in its own separate Git repository.
- **SDK (Software Development Kit):** the tools needed to *build* software in a language — for .NET, this includes the compiler, project templates, and command-line tools (`dotnet new`, `dotnet build`, etc.). Different from a *runtime*, which is just what's needed to *run* already-built software.

### File Mapping

- Created: `ai-jobsearch-copilot/` (repo root), `api/`, `worker/`, `frontend/`, `infra/` (empty folders at this point)
- Initialized: `.git` (via `git init`)

---

## Step 3: Backend Scaffolding

### Architectural Viewpoint & Arguments

We used `dotnet new webapi --use-controllers` — traditional MVC-style controllers — rather than ASP.NET Core's newer **Minimal APIs** style.

- **Why this way:** controllers scale better organizationally as the API grows (clear file-per-resource structure: `AuthController`, `ApplicationsController`, etc.), and they're what most .NET job postings and codebases still use in practice. Minimal APIs are lighter-weight and faster to write for small APIs, but can become a single sprawling file as endpoint count grows.
- **Alternative considered:** Minimal APIs (`app.MapGet(...)`, `app.MapPost(...)` directly in `Program.cs`). Genuinely valid, especially for microservices with very few endpoints each — worth knowing as an alternative, not a wrong choice, just not what we picked here.
- **Package version note:** we had to explicitly pin packages to `8.0.10` rather than letting NuGet grab the latest. **Why this matters:** NuGet (the .NET package manager) doesn't automatically know which package major version matches your installed SDK — it'll happily try to install a package built for .NET 10 onto a .NET 8 project, which fails at build time, not at install time. Always pin explicitly when your SDK version is fixed.

### Plain-Language Definitions

- **Web API:** a backend program whose whole job is to respond to HTTP requests (like a browser or another program asking "give me this data" or "save this data") with data, usually as JSON — as opposed to a traditional website that returns fully-formed HTML pages.
- **Controller:** a class whose methods handle incoming HTTP requests for a specific "resource" (e.g., `AuthController` handles everything related to logging in/registering; `ApplicationsController`, everything related to job applications). Named "controller" because it *controls* the flow: receives the request, talks to the database, decides what response to send back.
- **NuGet:** .NET's package manager — like `npm` for JavaScript or `pip` for Python. A "package" is someone else's pre-written, reusable code (e.g., the Postgres database driver) that you pull into your project instead of writing yourself.
- **EF Core (Entity Framework Core):** an ORM (see below) for .NET — lets you work with database tables as if they were regular C# objects and lists, instead of writing raw SQL by hand for every operation.
- **Npgsql:** the specific NuGet package that lets EF Core talk to PostgreSQL specifically (EF Core itself is database-agnostic; it needs a "provider" package per database type — Npgsql is Postgres's provider).

### File Mapping

- Created: `api/JobCopilot.Api/` (entire project via `dotnet new webapi`)
- Modified: `api/JobCopilot.Api/JobCopilot.Api.csproj` (NuGet packages added: `Microsoft.EntityFrameworkCore.Design`, `Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.AspNetCore.Authentication.JwtBearer`, all pinned to `8.0.10`)

---

## Step 4: Frontend Scaffolding

### Architectural Viewpoint & Arguments

We used **Vite** to scaffold React + TypeScript, not the older Create React App (CRA).

- **Why this way:** Vite starts a dev server near-instantly and rebuilds on save much faster than CRA, because of *how* it bundles code during development (see definition below). CRA is also effectively unmaintained at this point — not a safe default for a new project in 2026.
- **Alternative considered:** Next.js — a React *framework* (not just a build tool) that adds server-side rendering, routing, and API routes built in. Rejected for this project specifically because we already have a separate ASP.NET Core API — Next.js's built-in backend features would be redundant, and a plain React SPA (Single Page Application) talking to our own API is architecturally simpler for this use case.

### Plain-Language Definitions

- **Vite** (pronounced "veet"): a frontend build tool. Its job is to take your React/TypeScript source code and turn it into plain JavaScript/HTML/CSS a browser can run, and to serve it locally while you develop, refreshing instantly as you save changes.
- **SPA (Single Page Application):** a website where the browser loads one HTML page once, and then JavaScript handles all further "navigation" without reloading the whole page from the server each time — what React apps are, by default.
- **TypeScript:** JavaScript with an added *type system* — you declare what kind of data (string, number, a specific object shape) a variable or function is supposed to hold, and the compiler catches mismatches *before* the code ever runs, rather than failing unpredictably at runtime.

### File Mapping

- Created: `frontend/` (entire Vite scaffold: `src/`, `index.html`, `package.json`, `tsconfig*.json`, `vite.config.ts`, etc.)

---

## Step 5: Local PostgreSQL via Docker

### Architectural Viewpoint & Arguments

We run Postgres **inside Docker** rather than installing it natively on the machine (in addition to the pre-existing native install already on this machine).

- **Why this way:** a containerized database is disposable and reproducible — `docker compose down` removes it cleanly, `up` recreates it identically, with zero risk of leftover config drifting from what a fresh clone of this repo would produce. It also means the exact same setup will work identically once this moves to a teammate's machine, a CI pipeline, or (eventually) production.
- **The port conflict we hit (5432 already in use) and how we resolved it (mapping host port 5433 → container's internal 5432)** is itself a good teaching example of the concept below.

### Plain-Language Definitions

- **Container:** a lightweight, isolated environment that packages an application with everything it needs to run (in this case, Postgres itself, pre-configured), separate from whatever else is installed directly on your machine. Different from a Virtual Machine — much lighter weight, because it shares the host machine's operating system kernel rather than emulating an entire separate OS.
- **Docker:** the tool that builds, runs, and manages containers.
- **Docker Compose:** a tool for defining and running *multiple* related containers together via one config file (`docker-compose.dev.yml`), instead of managing each container's start/stop commands by hand.
- **Port mapping (`"5433:5432"`):** a container is network-isolated from your actual machine by default. Port mapping says: "traffic arriving on my machine's port 5433 should be forwarded to port 5432 *inside* the container." The right-hand number must match what the software *inside* the container actually listens on (Postgres always defaults to 5432, regardless of what host port you choose); the left-hand number is yours to choose freely, and needs to be different from anything else already using that port on your machine.

### File Mapping

- Created: `infra/docker-compose.dev.yml`

---

## Step 6: Git Setup

### Architectural Viewpoint & Arguments

A `.gitignore` was added *before* the first commit, listing `bin/`, `obj/`, `node_modules/`, `dist/`, `.env`, `*.user`.

- **Why this matters:** these are all either (a) machine-generated build output that shouldn't be tracked as source (`bin/`, `obj/`, `dist/`), (b) massive dependency folders that should be reinstalled via package manager, not committed (`node_modules/`), or (c) files containing secrets/machine-specific settings that must never end up in a shared repository (`.env`, `*.user`).

### Plain-Language Definitions

- **`.gitignore`:** a file listing patterns of files/folders Git should never track, even if they exist in the folder. Prevents accidentally committing generated files or secrets.
- **Build output (`bin/`, `obj/` for .NET; `dist/` for frontend):** files the compiler/bundler generates from your actual source code. Never hand-edited, always regeneratable — so there's no reason to store them in version control.

### File Mapping

- Created: `.gitignore` (repo root)
- First commit made

---

## Step 7: EF Core Models

### Architectural Viewpoint & Arguments

Three separate model classes were created: `User`, `Application`, `MatchResult` — with `MatchResult` deliberately kept as its **own** entity/table rather than just extra columns bolted onto `Application`.

- **Why this way:** `MatchResult` needs an independent lifecycle — a status (`Pending → Processing → Completed/Failed`) that changes over time, asynchronously, once the Week 2 worker exists. If match data were just columns on `Application`, adding that async status tracking later would require an actual schema migration and touching every place `Application` is read/written. Splitting it now costs almost nothing and avoids that rework.
- **Alternative considered:** flatten `MatchScore`/`GapAnalysis`/`Status` directly onto `Application`. Simpler short-term, but architecturally naive once you know async processing is coming — a good example of designing for a *known* near-future requirement without over-engineering for hypothetical ones.

Every `Id` property is a **GUID, generated in C# code** (`= Guid.NewGuid()`) rather than an auto-incrementing integer generated by the database.

- **Why this way:** the ID needs to exist *before* the database save completes, because it will be published onto a message queue in the same request (Week 2's async flow). App-generated GUIDs also can't collide across services/environments the way sequential integers theoretically could in a distributed system, and they don't leak information (an attacker can't guess `/applications/6` exists just because `/applications/5` does).
- **Alternative considered:** database-generated auto-increment integers (the traditional default). Simpler to read in logs/URLs, but wrong fit here given the queue-publishing requirement, and weaker on the security/guessability front.

### Plain-Language Definitions

- **Entity:** in EF Core, a C# class that represents one row of one database table. `User`, `Application`, and `MatchResult` are entities — each instance of the class, in memory, corresponds to (or will become) one row in the `Users`, `Applications`, or `MatchResults` table.
- **GUID (Globally Unique Identifier):** a 128-bit randomly generated value, astronomically unlikely to ever collide with another GUID generated anywhere else, by anyone. Looks like `e1dd2956-b87f-4f0a-8860-3b73572ad407`. Used here as a primary key instead of a simple counting number.
- **Enum (`MatchStatus`):** a type that can only hold one of a fixed, named set of values (`Pending`, `Processing`, `Completed`, `Failed`) — safer than using a raw string or number for status, because the compiler prevents you from accidentally assigning an invalid value.
- **Navigation property** (e.g., `User.Applications`, `Application.User`): a property on an entity that points to a *related* entity (or list of them), letting EF Core understand and traverse relationships between tables in C# code rather than writing manual SQL joins.

### File Mapping

- Created: `api/JobCopilot.Api/Models/User.cs`, `Models/Application.cs`, `Models/MatchResult.cs`


---

## Step 8: DbContext & Migrations Setup

### Architectural Viewpoint & Arguments

`AppDbContext` explicitly configures the `Application ↔ MatchResult` one-to-one relationship in `OnModelCreating`, rather than relying on EF Core to infer it automatically.

- **Why this way:** EF Core's automatic relationship detection ("convention-based configuration") works well for one-to-many relationships, but one-to-one relationships are genuinely ambiguous to infer — EF can't always tell which side "owns" the foreign key without being told explicitly. Being explicit here avoids subtle bugs that would otherwise only surface at migration time.
- We also explicitly enforced `User.Email` as unique **at the database level** (`HasIndex(...).IsUnique()`), not just checked in application code (see Step 12).
- **Why both layers:** application-level checks are for good user experience — fast feedback, clear error message. Database-level constraints are the actual *guarantee* — even a bug in app code or a race condition can't bypass them. Never rely on application code alone for something that must always be true.

### Plain-Language Definitions

- **`DbContext`:** EF Core's central class representing one "session" with the database — tracks entities you've loaded/changed/added, translates C# into SQL on `SaveChangesAsync()`.
- **Migration:** a generated script describing how to change the database schema to match your current C# model classes — tracked and repeatable, instead of hand-editing the database.
- **Foreign key:** a column in one table storing the primary key of a row in another table — how a relationship is physically represented in a relational database.
- **Unique index:** a database-level rule: never allow two rows to share a value in this column. Enforced by Postgres itself.

### File Mapping

- Created: `api/JobCopilot.Api/Data/AppDbContext.cs`
- Generated: `api/JobCopilot.Api/Migrations/` folder


---

## Step 9: Connection String & DbContext Registration

### Architectural Viewpoint & Arguments

The connection string lives in `appsettings.Development.json`, registered into ASP.NET Core's **Dependency Injection (DI)** container in `Program.cs`, rather than `AppDbContext` being manually instantiated wherever needed.

- **Why this way:** DI means any controller simply *asks* for an `AppDbContext` in its constructor, and the framework hands it one, correctly scoped to a single HTTP request — two simultaneous requests never share or corrupt each other's session. Manually creating `new AppDbContext(...)` everywhere would be repetitive and error-prone.
- **Environment-specific settings (`appsettings.Development.json`):** ASP.NET Core layers this on top of base `appsettings.json` only in Development mode — this is why local dev secrets never accidentally reach a production deployment, as long as they aren't hand-copied into the base file.

### Plain-Language Definitions

- **Dependency Injection (DI):** a pattern where a class declares what it needs without knowing how it's created — a central container creates and hands it over automatically. Reduces repetition, eases testing (swap in a fake dependency).
- **Connection string:** one text value encoding everything needed to reach a database — host, port, database name, username, password.
- **Middleware:** code that runs on every incoming HTTP request, in order, before your controller code runs (and often again on the way out). Called "middleware" because it sits *in the middle* of the request/response pipeline. `app.UseAuthentication()` is an example: checks for a valid JWT on every request before your controller ever executes.

### File Mapping

- Modified: `appsettings.Development.json` (added `ConnectionStrings:Default`)
- Modified: `Program.cs` (registered `AddDbContext<AppDbContext>`)

---

## Step 10: Running the Migration

### Architectural Viewpoint & Arguments

Two separate commands: `migrations add` (generates a script by diffing C# models against last known schema) and `database update` (executes it against the real database).

- **Why split:** lets you *review* a generated migration before running it — critical in any real team, where a wrong auto-generated migration (e.g., one that would drop a column, losing data) needs human review before touching production.

### Plain-Language Definitions

- **Schema:** the structural definition of a database — tables, columns, types, constraints. Distinct from the data (actual rows) itself.
- **`__EFMigrationsHistory` table:** an internal EF Core table recording which migrations have already run against this specific database, so re-running `database update` doesn't reapply old migrations.

### File Mapping

- Generated: `api/JobCopilot.Api/Migrations/<timestamp>_InitialCreate.cs` and `.Designer.cs`
- Database changed: `Users`, `Applications`, `MatchResults`, `__EFMigrationsHistory` created


---

## Step 11: Authentication Infrastructure

### Architectural Viewpoint & Arguments

Custom **JWT + BCrypt** authentication was built rather than using ASP.NET Core Identity (Microsoft's built-in auth system).

- **Why this way:** Identity is powerful but heavyweight, with its own tables and conventions, and a fair amount of "magic" that's hard to explain concisely ("Identity handled it" is a weaker interview answer than describing exactly how tokens are generated and verified). For a portfolio project meant to demonstrate understanding, building the flow explicitly is more valuable than hiding it behind a framework.
- **Alternative considered:** ASP.NET Core Identity, or a third-party provider (Auth0, Clerk, Supabase Auth) — arguably the *safer* choice for a real production system (less custom security-critical code = fewer mistakes). Worth knowing as the "right for production" answer, distinct from "right for demonstrating skill."
- Passwords are stored only as a **one-way hash** (BCrypt) — never plain text, never reversibly encrypted.

### Plain-Language Definitions

- **Hashing (one-way):** turns a password into a scrambled, fixed-length output that's effectively impossible to reverse. Login checks hash the *attempted* password and compare hashes — never decrypts the stored one, because it was never encrypted (reversible) to begin with.
- **Salt:** random data mixed in before hashing, so identical passwords produce different stored hashes. BCrypt handles this automatically — prevents precomputed "rainbow table" attacks.
- **JWT:** a signed, tamper-proof token the server issues after login, carrying claims (facts like "this is user X") plus a cryptographic signature. Sent back on every request (`Authorization: Bearer <token>`) instead of resending credentials.
- **Claim:** one fact inside a JWT — e.g., `sub` (user ID) or `email`. The API reads claims to know who's asking, with no DB lookup needed.
- **Signing vs. encryption:** a JWT's contents are technically readable by anyone (just Base64 JSON) — but signed, so any tampering invalidates it. The server checks the signature, not secrecy.

### File Mapping

- Modified: `appsettings.Development.json` (added `Jwt:*` settings)
- Created: `Services/AuthService.cs`
- Modified: `.csproj` (added `BCrypt.Net-Next`)
- Modified: `Program.cs` (registered `AuthService`, configured JWT Bearer middleware, added `UseAuthentication()`/`UseAuthorization()` in that order)

---

## Step 12: Register & Login Endpoints

### Architectural Viewpoint & Arguments

Both register and login return a JWT immediately — a newly registered user is already logged in, no separate login step required.

- **Why this way:** better UX, no security downside — proving you know the password by setting it establishes the same trust as typing it again immediately after.
- Email uniqueness checked at **both** app level (friendly `409 Conflict`) and DB level (Step 8's unique index) — defense in depth, now visible in action.

### Plain-Language Definitions

- **DTO (Data Transfer Object):** a plain class defining the *shape* of data in/out of an endpoint — kept separate from EF entities, since you never want to accidentally expose internal fields (like a password hash) by returning a raw entity.
- **HTTP status codes used:** `200 OK`, `409 Conflict` (email already taken), `401 Unauthorized` (bad credentials) — using the semantically correct code lets clients react appropriately without parsing response text.

### File Mapping

- Created: `Controllers/AuthController.cs`


---

## Step 13: Applications CRUD Endpoints

### Architectural Viewpoint & Arguments

Every query in `ApplicationsController` filters by `UserId == CurrentUserId` — this, not `[Authorize]` alone, is the actual security boundary.

- **Why this matters:** `[Authorize]` only proves *a* valid user is making the request — it does not prevent that user from requesting *someone else's* data. If `GetById` queried only by `id`, any logged-in user could read any other user's applications by guessing GUIDs. This is a real vulnerability class (**IDOR**) — always scope queries by authenticated identity, never trust a client-supplied ID alone.
- `Create` immediately inserts a `Pending` `MatchResult` row alongside the `Application`, even before a worker exists to process it.
- **Why now:** establishes the data shape the frontend can build against immediately, and means the future worker only has to *update* existing rows rather than also handle creation — cleanly separating "a request was made" from "the request was fulfilled."

### Plain-Language Definitions

- **CRUD:** Create, Read, Update, Delete — the basic operations a resource-oriented API supports. This controller has Create + two Read variants so far; Update/Delete aren't needed yet.
- **IDOR (Insecure Direct Object Reference):** a vulnerability where an app exposes a direct reference (e.g., a database ID) without verifying the requesting user is actually authorized to access *that specific* object.
- **`[Authorize]`:** tells middleware to reject a request (`401`) unless a valid JWT is present. Authentication (who are you) vs. Authorization (what are you allowed to touch) are distinct — `[Authorize]` enforces the former; the per-query `UserId` filter enforces the latter.

### File Mapping

- Created: `Controllers/ApplicationsController.cs`

---

## Step 14: Frontend Wiring (API Client & Auth Context)

### Architectural Viewpoint & Arguments

The JWT is stored **only in React state (in memory)** via Context — deliberately not in `localStorage`.

- **Why this way:** `localStorage` is readable by any JavaScript on the page, including malicious script from an XSS vulnerability or a compromised dependency. In-memory state can't be read that way; the tradeoff is losing login on page refresh — acceptable for a demo app.
- **The production-correct answer**, not built here: an **httpOnly cookie** set by the server, which client-side JavaScript literally cannot read even during XSS. Skipped here since it needs server-side cookie handling + CORS config beyond current scope — a deliberate, explainable simplification, not an oversight.
- **React Context** (not Redux/Zustand) was chosen for auth state — at this project's size (one piece of global state), Context is right-sized; state libraries earn their complexity only with substantial, deeply-nested shared state.

### Plain-Language Definitions

- **XSS (Cross-Site Scripting):** an attack where malicious JavaScript executes in your site's context (e.g., via an unsanitized input rendered as HTML) — once running, it can read anything page JS can read, including `localStorage`.
- **React Context:** shares a value across many components without manually passing it down as props through every intermediate layer.
- **Shared `axios` instance:** rather than manually attaching the `Authorization` header on every call, one shared client's default headers carry the current JWT — set once, updated in one place on login/logout.
- **In-memory vs. persistent storage:** in-memory data exists only while the browser tab is open — gone on reload. `localStorage` persists across reloads/restarts, which is exactly what makes it a bigger target if XSS occurs.

### File Mapping

- Created: `frontend/src/api/client.ts`
- Created: `frontend/src/context/AuthContext.tsx`
- Modified: `frontend/src/main.tsx` (wrapped `<App />` in `<AuthProvider>`)
