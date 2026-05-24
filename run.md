# IssueFlow — Run Guide

How to install, build, test, and run the IssueFlow backend locally. The API contract is defined in [**README.md**](README.md). This document reflects the repository as implemented through **Slice 16** (vertical slices 1–16).

---

## 1. Overview

IssueFlow is a **NestJS** REST API for project and issue tracking (TDP / homework scope). The codebase uses a modular domain layout (users, auth, projects, tickets, comments, audit log) with PostgreSQL persistence, JWT authentication, transactional audit logging, and automated tests (unit + e2e).

**Implemented capabilities (summary):**

- Users, JWT auth (login, logout deny-list, `/auth/me`), projects, tickets (lifecycle, optimistic locking, optional `dueDate` / `isOverdue`)
- Comments with `@username` mentions
- Ticket dependencies (blockers), ticket attachment metadata (filename and content type; no file/blob storage)
- Soft delete and ADMIN restore for tickets and projects
- Audit log (append-only, filters, ticket `stateHistory`)
- CSV ticket export/import
- Project workload (`GET /projects/:projectId/workload`)
- Auto-assignment on ticket create (least-loaded `DEVELOPER`)
- Auto-escalation via explicit `TicketsService.runAutoEscalation()` (no scheduler HTTP endpoint)

---

## 2. Requirements

| Requirement | Notes |
|-------------|--------|
| **Node.js 18+** | Matches `@types/node` ^20 and Nest 10 toolchain |
| **npm** | Package manager used by this repo |
| **Docker Desktop** (or Docker Engine + Compose v2) | Runs PostgreSQL only; the Nest app runs on the host |
| **Docker Compose** | See [**compose.yml**](compose.yml) |

Terminal at the repository root: `issueflow-ticketing-platform`.

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | NestJS 10 |
| Language | TypeScript |
| ORM | TypeORM 0.3.x |
| Database | PostgreSQL 15 (Docker) |
| Validation | `class-validator` / `class-transformer` |
| Auth | JWT (`@nestjs/jwt`, `passport-jwt`), `bcrypt` |
| CSV | `csv-parse`, `csv-stringify` |

---

## 4. Setup (recommended order)

### 4.1 Install dependencies

```bash
npm install
```

### 4.2 Start PostgreSQL

```bash
docker compose up -d
```

Defaults: user `issueflow`, password `issueflow`, database `issueflow`, port **5432** ([**compose.yml**](compose.yml)).

> Legacy CLI: `docker-compose up -d`

Stop:

```bash
docker compose down
```

### 4.3 Database schema

The **development** environment uses TypeORM **`synchronize: true`** in [**src/config/database.config.ts**](src/config/database.config.ts) to create/update tables from entities when the app or e2e suite starts. There is **no** dedicated migration script (`npm run migrate` does not exist in [**package.json**](package.json)).

**Do not use `synchronize` in production**; use proper migrations there.

### 4.4 Demo data (no seed script)

There is **no** bundled seed command. For manual exploration:

1. `npm run start:dev`
2. **POST** `/users` with `password` (min 8 chars) and role `DEVELOPER` or `ADMIN`
3. **POST** `/auth/login` → use `Authorization: Bearer <token>` on protected routes
4. Create projects, tickets, and comments per [**README.md**](README.md)

E2e suites create their own data; several reset tables between tests (see §8.2).

---

## 5. Environment variables

Optional. Defaults match `compose.yml`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `issueflow` | DB user |
| `DB_PASSWORD` | `issueflow` | DB password |
| `DB_NAME` | `issueflow` | Database name |
| `JWT_SECRET` | `issueflow-dev-secret` | JWT signing (**change for real deployments**) |

No `.env` file is required if defaults suffice.

---

## 6. Build

Compiles to `dist/`. **Does not require Docker or PostgreSQL.**

```bash
npm run build
```

Production run (after build):

```bash
npm run start:prod
```

Optional:

```bash
npm run lint
npm run format
```

---

## 7. Run the application

Development (watch mode, port **3000**):

```bash
npm run start:dev
```

Requires PostgreSQL running for any route that touches the database. Schema is applied via TypeORM `synchronize: true` (development only; see §4.3).

Other scripts from [**package.json**](package.json):

```bash
npm run start          # nest start (no watch)
npm run start:debug    # nest start --debug --watch
```

Starter route (not in README API tables): `GET http://localhost:3000/`

---

## 8. Tests

### 8.1 Unit tests

Specs under `src/**/*.spec.ts`. **No database required** (repositories mocked).

```bash
npm run test
```

Optional:

```bash
npm run test:watch
npm run test:cov
npm run test:debug
```

### 8.2 End-to-end tests

E2e tests run against a **real PostgreSQL** instance (not mocks). Suites that need a clean slate use database reset helpers in [`test/helpers/reset-database.ts`](test/helpers/reset-database.ts).

Config: [`test/jest-e2e.json`](test/jest-e2e.json). Boots full [`AppModule`](src/app.module.ts) against that database.

**Requires:** `docker compose up -d` before running.

```bash
npm run test:e2e
```

Run a single suite (example):

```bash
npm run test:e2e -- --testPathPattern=auto-escalation
```

**Behavior:**

- Uses the same DB credentials as the app; TypeORM `synchronize` applies schema at startup.
- Exercises HTTP + transactions (auth, CRUD, audit rows, soft delete, etc.).
- **`maxWorkers: 1`** — serial execution avoids parallel schema sync races on one database.
- Some suites call `test/helpers/reset-database.ts` to truncate tables for deterministic isolation.

**E2e suites (14 files):** `app`, `auth`, `tickets`, `audit-log`, `audit-log-transaction`, `final-flow`, `soft-delete-restore`, `optimistic-locking`, `mentions`, `ticket-dependencies`, `ticket-attachments`, `ticket-import-export`, `auto-assignment-workload`, `auto-escalation`.

### 8.3 Recommended pre-submit checks

```bash
npm run build
npm run test
npm run test:e2e
```

---

## 9. Authentication and authorization

### Login / logout

- **POST** `/auth/login` — body `{ "username", "password" }` → JWT (see README).
- **POST** `/auth/logout` — Bearer required; token added to in-memory deny-list (single-process only).
- **GET** `/auth/me` — current user from JWT.

### Protected routes

Most routes require `Authorization: Bearer <accessToken>`. **POST** `/users` (registration) is public.

### Roles (RBAC)

`RolesGuard` enforces `ADMIN` vs `DEVELOPER` where applicable (e.g. soft-deleted list/restore endpoints). See README Soft Delete APIs.

### Passwords

Responses never include `passwordHash`. On **POST** `/users`, supply `password` (≥8 chars) when you need to log in locally.

---

## 10. Implementation status (slices 1–16)

Aligned with [**docs/implementation-plan.md**](docs/implementation-plan.md):

| Slice | Topic | Status |
|-------|--------|--------|
| 1 | Foundation (PostgreSQL, TypeORM, validation) | Completed |
| 2 | Users | Completed |
| 3 | Auth (JWT, guards) | Completed |
| 4 | Projects | Completed |
| 5 | Tickets (lifecycle, `dueDate`, `isOverdue` fields) | Completed |
| 6 | Comments | Completed |
| 7 | Quality (contract metadata, security guards, docs sanity) | Completed |
| 8 | Audit log (append-only, filters, `stateHistory`) | Completed |
| 9 | Soft delete + ADMIN restore (tickets & projects) | Completed |
| 10 | Optimistic locking (`version`, 409 on conflict) | Completed |
| 11 | `@mention` in comments + user mentions API | Completed |
| 12 | Ticket dependencies / blockers | Completed |
| 13 | Ticket attachment metadata | Completed |
| 14 | Ticket CSV export/import | Completed |
| 15 | Auto-assignment by workload | Completed |
| 16 | Ticket auto-escalation | Completed |

**Not in scope / not implemented:** background schedulers, job queues, email notifications, separate escalation HTTP endpoint, production migration pipeline in-repo.

---

## 11. Slice 16 — auto-escalation (actual behavior)

README describes auto-escalation conceptually; **runtime execution is explicit**, not cron-driven:

| Aspect | Implementation |
|--------|----------------|
| Entry point | `TicketsService.runAutoEscalation(now?: Date)` |
| HTTP / cron / queues | **None** — call from code, tests, or ops scripts you add |
| Eligible tickets | `dueDate` set, `dueDate < now`, `status != DONE`, not soft-deleted |
| Per run | At most **one** priority step: LOW→MEDIUM→HIGH→CRITICAL |
| CRITICAL + overdue | Priority stays CRITICAL; `isOverdue = true` |
| Later runs | May escalate again if still overdue and below CRITICAL |
| Idempotency | CRITICAL with `isOverdue = true` is skipped on subsequent runs |
| Manual PATCH priority | Clears `isOverdue`; next run re-evaluates from new priority |
| Audit | `AUTO_ESCALATE`, actor `SYSTEM`, `performedBy: null`, transactional with ticket update |
| Return value | `{ escalated, markedOverdue, skipped }` |

E2e example: `test/auto-escalation.e2e-spec.ts` calls `runAutoEscalation(SLICE16_FIXED_NOW)` with a fixed clock.

---

## 12. Slice 15 — auto-assignment (brief)

On **POST** `/tickets`, if `assigneeId` is omitted, the ticket is assigned to the least-loaded `DEVELOPER` in the project (`GET /projects/:projectId/workload` for counts). Explicit `assigneeId` wins. Audit: `AUTO_ASSIGN` (SYSTEM). No reassignment on update.

---

## 13. Architecture notes

- **Modular NestJS** — one module per domain; thin controllers; business rules in services.
- **PostgreSQL + TypeORM** — entities, repositories, soft delete via `deletedAt`.
- **Transactional audit** — state changes recorded via `AuditLogService.record(..., manager)` in the same transaction as domain writes where required.
- **Contract tests** — `src/quality/*.spec.ts` guard route metadata and README alignment.
- **TDD slices** — tests committed before or with features per slice workflow.

---

## 14. AI-assisted development

Human review remains responsible for submitted code. See [**docs/ai-workflow.md**](docs/ai-workflow.md), [**prompts.md**](prompts.md), [**docs/implementation-plan.md**](docs/implementation-plan.md), and [**.cursor/rules/**](.cursor/rules/).

---

## 15. Production / technical notes

- Replace `synchronize: true` with migrations for real deployments.
- Set a strong `JWT_SECRET`; logout deny-list is in-memory (not multi-instance safe without shared storage).
- JWT logout and dev defaults are not production-hardening on their own.

---

## Quick reference — npm scripts

All scripts from [**package.json**](package.json):

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Compile to `dist/` (no DB) |
| `npm run start:dev` | Dev server on port 3000 (DB required) |
| `npm run start` | `nest start` |
| `npm run start:debug` | Debug + watch |
| `npm run start:prod` | `node dist/main` |
| `npm run test` | Unit tests (no DB) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:debug` | Unit tests with Node inspector |
| `npm run test:e2e` | E2e tests (**PostgreSQL required**) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

**API contract:** [**README.md**](README.md)
