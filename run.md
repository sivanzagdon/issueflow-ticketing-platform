# IssueFlow — Run Guide

This document describes how to install, configure, and run the IssueFlow backend locally for review. Commands match the repository as of the last update.

---

## 1. Project Overview

IssueFlow is a **NestJS** REST API for a lightweight project and issue-tracking platform (AT&T homework / TDP scope). The assignment API contract is defined in [**README.md**](README.md).

**Implemented today:** foundation (PostgreSQL + TypeORM), **Users** (JWT-protected except **POST /users** registration), **JWT Authentication** (login, protected `/auth/me`, **logout** with in-memory token invalidation), **Projects**, **Tickets**, **Comments**, and **Audit Log** (append-only internal logging, GET `/audit-logs`, ticket `stateHistory` projection) with unit and e2e tests. Most extended README features (dependencies, attachments, CSV, RBAC, etc.) are **not** implemented yet.

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | NestJS 10 |
| Language | TypeScript |
| ORM | TypeORM 0.3.x |
| Database | PostgreSQL (via Docker) |
| Validation | `class-validator` / `class-transformer` (global `ValidationPipe`) |
| Auth | JWT (`@nestjs/jwt`, `passport-jwt`) |
| Passwords | `bcrypt` |

---

## 3. Prerequisites

- **Node.js** and **npm** (compatible with the versions you use for Nest 10 / TypeScript 5.x projects)
- **Docker** with Docker Compose (v2) — used only to run PostgreSQL
- A terminal at the **repository root** (`issueflow-ticketing-platform`)

---

## 4. Install Dependencies

From the repository root:

```bash
npm install
```

---

## 5. Start PostgreSQL (Docker Compose)

The database is defined in [**compose.yml**](compose.yml): user `issueflow`, password `issueflow`, database `issueflow`, port **5432**.

From the repository root:

```bash
docker compose up -d
```

> If your environment uses the legacy CLI, try `docker-compose up -d` instead.

To stop the container:

```bash
docker compose down
```

---

## 6. Environment Variables

Optional. Defaults in [**src/config/database.config.ts**](src/config/database.config.ts) match `compose.yml`.

| Variable | Default (if unset) | Purpose |
|----------|-------------------|---------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `issueflow` | DB user |
| `DB_PASSWORD` | `issueflow` | DB password |
| `DB_NAME` | `issueflow` | Database name |

JWT signing / verification ([**src/auth/auth.constants.ts**](src/auth/auth.constants.ts)):

| Variable | Default (if unset) | Purpose |
|----------|-------------------|---------|
| `JWT_SECRET` | `issueflow-dev-secret` | JWT signing secret (**change for any real deployment**) |

No `.env` file is required for local runs if you use the defaults above. To override, set variables in your shell or use a `.env` loader of your choice (not bundled in this repo).

**TypeORM:** `synchronize: true` is enabled in `databaseConfig()` for **local development convenience** only. It auto-applies schema changes from entities. **Do not rely on this for production**; use migrations for real deployments.

---

## 7. Run Application

Development (watch mode):

```bash
npm run start:dev
```

The app listens on **port 3000** ([**src/main.ts**](src/main.ts)).

Smoke check (starter route — not part of the README API tables):

```bash
curl http://localhost:3000/
```

Other scripts from [**package.json**](package.json):

```bash
npm run start          # nest start (no watch)
npm run start:debug    # nest start --debug --watch
npm run start:prod     # node dist/main (after build)
```

---

## 8. Build Project

```bash
npm run build
```

Produces compiled output under `dist/`. Use `npm run start:prod` after a successful build.

Code style (optional):

```bash
npm run lint
npm run format
```

---

## 9. Run Tests

### Unit tests

Jest specs under `src/**/*.spec.ts`. **Does not require PostgreSQL.**

```bash
npm run test
```

Additional scripts:

```bash
npm run test:watch
npm run test:cov
npm run test:debug
```

### End-to-end tests

Separate Jest config ([`test/jest-e2e.json`](test/jest-e2e.json)). Boots the full [`AppModule`](src/app.module.ts) with TypeORM against PostgreSQL.

**Before running e2e:**

1. Start PostgreSQL: `docker compose up -d` (see §5).
2. Then run:

```bash
npm run test:e2e
```

E2E is configured to run **serially** (`maxWorkers: 1` in `test/jest-e2e.json`) so only one Nest app synchronizes the schema at a time. Parallel e2e workers can race on `synchronize: true` and fail against a shared database.

E2E suites include `test/audit-log.e2e-spec.ts` (JWT on GET `/audit-logs`, no POST `/audit-logs`, filters, `stateHistory`), plus auth, tickets, app, and final-flow specs.

### Build (recommended before submit)

```bash
npm run build
```

---

## 10. Authentication Notes

### Login

- **POST** `/auth/login`  
  Body: `{ "username": "<username>", "password": "<password>" }`  
  Response: `{ "accessToken", "tokenType": "Bearer", "expiresIn": 3600 }` (see README).

Invalid credentials return **401** (`UnauthorizedException`).

### Protected routes

- **GET** `/auth/me` — requires header: `Authorization: Bearer <accessToken>`.

### Projects API

All **project** routes (**POST/GET/PATCH/DELETE** under `/projects`) require the same **Bearer** JWT. They use [`JwtAuthGuard`](src/auth/guards/jwt-auth.guard.ts).

### Users API

All **users** routes except **POST /users** (registration) require a **Bearer** JWT (same as **projects** and **tickets**).

### Logout

- **POST** `/auth/logout` returns **200** with an empty body and requires a valid **Authorization: Bearer** token.

The server keeps a **simple in-memory deny-list** of logged-out access tokens. After logout, the **same** JWT is rejected with **401** on protected routes until it would have expired anyway. This is for local/dev-style hardening only (not multi-instance safe without a shared store).

### Passwords and user creation

- API responses **never** include `passwordHash`.
- **POST** `/users` accepts optional `password` (minimum length 8 per DTO). If omitted, a random password is hashed internally — the user **cannot** log in until credentials are known; for local testing, **supply `password`** on create when you need to call `/auth/login`.

---

## 11. Current Implementation Status

Aligned with [**docs/implementation-plan.md**](docs/implementation-plan.md) vertical slices:

| Slice | Status | Notes |
|-------|--------|--------|
| **1 — Foundation** | Completed | PostgreSQL, TypeORM, entities, enums, global validation |
| **2 — Users** | Completed | CRUD, bcrypt, conflict/not-found handling, tests |
| **3 — Auth** | Completed | JWT login, `/auth/me`, guard, strategy, tests |
| **4 — Projects** | Completed | CRUD, owner validation, JWT on all project routes, soft delete on DELETE, tests |
| **5 — Tickets** | Completed | CRUD, lifecycle, optimistic locking (`version` + **409** on conflict), JWT, tests |
| **6 — Comments** | Completed | Ticket-scoped CRUD, JWT, author/ticket validation, tests |
| **7 — Quality** | Completed | Contract metadata, security guards, docs sanity, extended e2e |
| **8 — Audit Log** | Completed | Append-only logging, GET `/audit-logs`, filters, `stateHistory` on GET `/tickets/:id`, tests |

**Not implemented** (non-exhaustive; see README for full assignment): dependencies, attachments, CSV import/export, soft-delete list/restore, mentions, workload, auto-escalation, auto-assignment, **RBAC**, SYSTEM audit producers (auto-assign, escalation, import).

---

## 12. AI-Assisted Development

IssueFlow was built with an explicit AI-assisted workflow. Principle: **human review remains responsible** for the submitted code — AI is a development assistant, not a substitute for understanding the system.

**Tools and models referenced in repo docs:**

- **Cursor** (IDE agent)
- **ChatGPT — GPT-5.5** (planning, architecture guidance, implementation assistance, code review, and API contract validation)

**Repo files to consult:**

- [**docs/ai-workflow.md**](docs/ai-workflow.md) — workflow principles and accountability
- [**prompts.md**](prompts.md) — example prompts and interaction notes
- [**docs/implementation-plan.md**](docs/implementation-plan.md) — slices, scope, and checklists
- [**.cursor/rules/**](.cursor/rules/) — persistent project rules for agents (`project-standards.mdc`, `backend-architecture.mdc`, `testing-and-quality.mdc`)

The README homework also invites documenting agent usage; the files above satisfy that intent alongside this `run.md`.

---

## 13. Notes / Technical Debt

- **`synchronize: true`** — development only; use migrations for production.
- **JWT secret** — default is for local dev; set `JWT_SECRET` for shared or deployed environments.
- **In-memory token deny-list** — **logout** invalidates tokens only in process memory (resets on restart; not suitable for horizontal scale without Redis or similar).
- **Soft-deleted projects** — DELETE uses TypeORM `softDelete`; list/restore endpoints from README are not implemented.
- **E2E** — requires PostgreSQL (`docker compose up -d`); runs serially via `maxWorkers: 1` in `test/jest-e2e.json`. Suites: `test/app.e2e-spec.ts`, `test/auth.e2e-spec.ts`, `test/tickets.e2e-spec.ts`, `test/audit-log.e2e-spec.ts`, `test/final-flow.e2e-spec.ts`.

---

## Quick reference — npm scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run start:dev` | Dev server (port 3000) |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled app |
| `npm run test` | Unit tests (no DB required) |
| `npm run test:e2e` | E2e tests (PostgreSQL required; serial workers) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

**API contract:** [**README.md**](README.md)
