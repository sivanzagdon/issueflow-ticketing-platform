# IssueFlow — Run Guide

This document describes how to install, configure, and run the IssueFlow backend locally for review. Commands match the repository as of the last update.

---

## 1. Project Overview

IssueFlow is a **NestJS** REST API for a lightweight project and issue-tracking platform (AT&T homework / TDP scope). The assignment API contract is defined in [**README.md**](README.md).

**Implemented today:** foundation (PostgreSQL + TypeORM), **Users**, **JWT Authentication**, and **Projects** APIs with unit tests. **Tickets**, **Comments**, and most extended README features are **not** implemented yet.

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

**Unit tests** (Jest, specs under `src/**/*.spec.ts`):

```bash
npm run test
```

Additional scripts:

```bash
npm run test:watch
npm run test:cov
npm run test:debug
```

**End-to-end** (separate Jest config):

```bash
npm run test:e2e
```

`test:e2e` boots the full [`AppModule`](src/app.module.ts) (including TypeORM). **PostgreSQL should be running** for e2e to succeed; unit tests `npm run test` are the primary CI-style check used during development.

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

**Users** routes (`/users`, etc.) are **not** JWT-protected in the current codebase (no global guard). This matches incremental slice delivery; tightening auth may happen in a later slice.

### Logout

- **POST** `/auth/logout` returns **200** with an empty body.

**Logout is stateless:** the server does **not** maintain a token deny-list. Tokens remain valid until they expire (`expiresIn` is **3600** seconds). Clients should discard the token after logout.

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

**Present but not exposed as REST yet (entities / modules only):** Tickets, Comments, AuditLog (and related README APIs).

**Not implemented** (non-exhaustive; see README for full assignment): ticket CRUD and lifecycle, comments, audit log API, dependencies, attachments, CSV import/export, soft-delete list/restore, mentions, workload, auto-escalation, auto-assignment, app-wide JWT on every route, RBAC.

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
- **Users without JWT** — assignment long-term may expect broader protection; see implementation plan for incremental approach.
- **Logout** — stateless; no server-side invalidation.
- **Soft-deleted projects** — DELETE uses TypeORM `softDelete`; list/restore endpoints from README are not implemented.
- **E2E** — minimal coverage (`test/app.e2e-spec.ts`); most quality gates are unit tests under `src/`.

---

## Quick reference — npm scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run start:dev` | Dev server (port 3000) |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled app |
| `npm run test` | Unit tests |
| `npm run test:e2e` | E2e tests (DB recommended) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

**API contract:** [**README.md**](README.md)
