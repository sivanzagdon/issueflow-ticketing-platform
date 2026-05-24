# Implementation Plan

## Goal

Build a RESTful backend API for IssueFlow, a lightweight project and ticket management platform. The [**README.md**](../README.md) is the HTTP API contract.

## Core MVP

1. Project setup and PostgreSQL connection  
2. User management  
3. JWT authentication  
4. Project management  
5. Ticket management (lifecycle, locking, soft delete)  
6. Comment management  
7. Validation, error handling, and tests  
8. Documentation aligned with the implemented code  

---

## Slice Summary

| Slice | Topic | Status |
|-------|--------|--------|
| 1 | Foundation (PostgreSQL, TypeORM, entities) | Completed |
| 2 | Users | Completed |
| 3 | Authentication (JWT) | Completed |
| 4 | Projects | Completed |
| 5 | Tickets (lifecycle, `dueDate`, `isOverdue`) | Completed |
| 6 | Comments | Completed |
| 7 | Quality, docs, contract alignment | Completed |
| 8 | Audit log + ticket `stateHistory` | Completed |
| 9 | Soft delete + ADMIN restore | Completed |
| 10 | Optimistic locking (`version`, 409) | Completed |
| 11 | `@mention` in comments + mentions API | Completed |
| 12 | Ticket dependencies / blockers | Completed |
| 13 | Ticket attachment metadata | Completed |
| 14 | Ticket CSV import/export | Completed |
| 15 | Auto-assignment by workload | Completed |
| 16 | Ticket auto-escalation | Completed |

---

## Shared Conventions

These patterns apply across slices unless a slice explicitly notes an exception.

**Architecture**

- One NestJS module per domain; thin controllers; business rules in services.  
- DTO validation via global `ValidationPipe`.  
- TypeORM entities/repositories; soft delete via `deletedAt`.  
- State-changing writes use transactional audit: `AuditLogService.record(..., manager)`.

**Delivery**

- Vertical slices; backend stays runnable after each step.  
- TDD-first where slice complexity warrants it (`test(slice-X)` then `feat(slice-X)`).  
- Hardening fixes: `fix(slice-X): …`; documentation: `docs: …`.

**Verification (each slice)**

```bash
npm run build
npm test
npm run test:e2e   # requires docker compose up -d
```

E2e uses real PostgreSQL, `maxWorkers: 1`, and `test/helpers/reset-database.ts` where suites need isolation.

**Globally deferred (not implemented)**

Refresh tokens, email/OAuth/MFA, Kafka/event bus, websockets, background schedulers, job queues, production migration pipeline in-repo, distributed locks.

---

## Slice 1 — Foundation Infrastructure

**Status:** Completed

**Goal:** PostgreSQL + TypeORM foundation, core enums/entities, global validation — no business APIs yet.

**Delivered:** User, Project, Ticket, Comment, AuditLog entities and relationships; Docker Compose PostgreSQL; local schema via TypeORM `synchronize: true`.

---

## Slice 2 — Users

**Status:** Completed

**Endpoints:** `POST /users`, `GET /users`, `GET /users/:userId`, `POST /users/update/:userId`, `DELETE /users/:userId`

**Key rules**

- Unique username and email; `password` hashed with bcrypt; `passwordHash` never in responses.  
- Partial updates on update DTO; missing user → 404; duplicate → 409.

**Out of scope (this slice):** JWT guards, RBAC, audit integration.

---

## Slice 3 — Authentication

**Status:** Completed

**Endpoints:** `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`

**Key rules**

- Login returns JWT (`accessToken`, `tokenType`, `expiresIn`); invalid credentials → 401.  
- Protected routes require `Authorization: Bearer …`.  
- Logout uses in-memory token deny-list (single-process dev approach).  
- JWT payload includes user id, username, role; secret from env with dev default.

---

## Slice 4 — Projects

**Status:** Completed

**Endpoints:** `POST /projects`, `GET /projects`, `GET /projects/:projectId`, `PATCH /projects/:projectId`, `DELETE /projects/:projectId`

**Key rules**

- JWT required on all project routes.  
- Create requires existing `ownerId`; update allows name/description only.  
- Deletion designed for later soft-delete compatibility.

---

## Slice 5 — Tickets

**Status:** Completed

**Endpoints:** `POST /tickets`, `GET /tickets`, `GET /tickets/:ticketId`, `PATCH /tickets/:ticketId`, `DELETE /tickets/:ticketId`

**Key rules**

- JWT required. Validate project and assignee exist on create.  
- Status lifecycle forward-only: `TODO → IN_PROGRESS → IN_REVIEW → DONE` (no backward transitions).  
- **DONE tickets cannot be updated.**  
- Optional `dueDate` and `isOverdue` fields on entity (escalation logic in Slice 16).  
- Soft delete on remove (restore in Slice 9).

---

## Slice 6 — Comments

**Status:** Completed

**Endpoints:** `POST|GET /tickets/:ticketId/comments`, `PATCH|DELETE /tickets/:ticketId/comments/:commentId`

**Key rules**

- JWT required; ticket and author must exist.  
- Content required and non-empty; list scoped by ticket.  
- Standard CRUD with NotFound handling.

---

## Slice 7 — Quality, Documentation, and Final Review

**Status:** Completed

**Goal:** Submission readiness — tests, build, API contract audit, security/docs review, clean repo — without new product features.

**Checklist highlights**

- Compare endpoints/DTOs/responses to README; JWT on protected routes.  
- Never expose `passwordHash`; document logout and dev defaults.  
- Keep `run.md`, `prompts.md`, `docs/ai-workflow.md`, and this plan aligned with code.  
- `.gitignore` covers `node_modules`, `dist`, `coverage`, `.env`.

---

## Slice 8 — Audit Log

**Status:** Completed

**Endpoints:** `GET /audit-logs` (filters: `entityType`, `entityId`, `action`, `performedBy` — combinable). **No** public `POST /audit-logs`.

**Key rules**

- Append-only `audit_logs`; never update/delete log rows.  
- USER actions: `actorType = USER`, `performedBy = user id`. SYSTEM actions: `actorType = SYSTEM`, `performedBy = null`.  
- `GET /tickets/:ticketId` includes derived `stateHistory` from ticket audit rows (ASC by `createdAt`) — not stored on Ticket entity.  
- Wired into Users, Projects, Tickets, Comments (and later slices) on state changes.

**Representative actions:** `CREATE_*`, `UPDATE_*`, `DELETE_*`, `RESTORE_*`, `UPDATE_TICKET_STATUS`, `ADD/REMOVE_DEPENDENCY`, `AUTO_ASSIGN`, `AUTO_ESCALATE`, `IMPORT_TICKETS`.

---

## Slice 9 — Soft Delete + Restore Lifecycle

**Status:** Completed

**Endpoints**

- `DELETE /tickets/:ticketId`, `GET /tickets/deleted?projectId=…`, `POST /tickets/:ticketId/restore`  
- `DELETE /projects/:projectId`, `GET /projects/deleted`, `POST /projects/:projectId/restore`

**Key rules**

- No hard delete via public API; standard GET hides soft-deleted rows.  
- Deleted-list and restore endpoints are **ADMIN-only**.  
- Restore only for soft-deleted records; DELETE/RESTORE audit entries transactional with mutation.  
- Failed delete/restore does not write audit rows.

---

## Slice 10 — Optimistic Locking

**Status:** Completed

**Endpoints:** `PATCH /tickets/:ticketId`, `PATCH /tickets/:ticketId/comments/:commentId`

**Key rules**

- Updates require client `version`; success increments version; stale version → **409 Conflict** with no mutation and no audit row.  
- Ticket lifecycle rules (including DONE lock) still apply alongside version checks.

---

## Slice 11 — @Mention Mechanism in Comments

**Status:** Completed

**Endpoints:** Comment CRUD (Slice 6) + `GET /users/:userId/mentions?page=&pageSize=`

**Key rules**

- Parse `@username` from comment content; case-insensitive match; one association per user per comment.  
- Comment responses include `mentionedUsers: [{ id, username, fullName }]`.  
- Comment update re-evaluates mentions in the same transaction as comment + audit.  
- Mentions API returns paginated `{ data, total, page }`, newest first.  
- No notification/email infrastructure in this slice.

---

## Slice 12 — Ticket Dependencies / Blockers

**Status:** Completed

**Endpoints:** `POST|GET /tickets/:ticketId/dependencies`, `DELETE /tickets/:ticketId/dependencies/:blockerTicketId`

**Key rules**

- Both the pair `(ticketId, blockerTicketId)`; no self-dependency; soft-deleted tickets excluded.  
- Add/remove in transaction with audit (`TICKET_DEPENDENCY` entity type).

**Out of scope:** Recursive graph validation, auto-unblock, status propagation.

---

## Slice 13 — Ticket Attachment Metadata

**Status:** Completed

**Endpoints:** `POST|GET /tickets/:ticketId/attachments`, `DELETE /tickets/:ticketId/attachments/:attachmentId`

**Key rules**

- **Metadata only** — persist `filename` and `contentType`; **no binary/blob storage**.  
- POST accepts multipart `file` (multer); only metadata from the upload is saved.  
- Soft-deleted tickets cannot receive attachments; stable list order by attachment id ASC.  
- CREATE/DELETE audit on `TICKET_ATTACHMENT` in same transaction.

**Out of scope:** S3/filesystem, presigned URLs, virus scanning, file size policies.

---

## Slice 14 — Ticket Import / Export

**Status:** Completed

**Endpoints:** `GET /tickets/export?projectId=…`, `POST /tickets/import`

**Export**

- Required `projectId`; non-deleted tickets only; CSV columns: id, title, description, status, priority, type, assigneeId; escape commas/quotes.

**Import**

- Multipart: `file` + `projectId`; skip invalid rows; summary `{ created, failed, errors }`; audit per successfully created ticket. Export is read-only (no audit).

**Out of scope:** Excel, async/background import, storing uploaded CSV files.

---

## Slice 15 — Auto Assignment by Workload

**Status:** Completed

**Endpoint:** `GET /projects/:projectId/workload`

**Behavior**

- On `POST /tickets`, if `assigneeId` omitted → assign least-loaded `DEVELOPER` in project.  
- Workload = non-DONE, non-soft-deleted tickets in project; ties → oldest registered developer; no developers → `assigneeId = null`.  
- Explicit `assigneeId` wins; no reassignment on update.  
- Audit: `AUTO_ASSIGN` (SYSTEM), transactional with ticket create.

**Out of scope:** Reassignment, notifications, post-create balancing.

---

## Slice 16 — Ticket Auto Escalation

**Status:** Completed

**Goal:** Escalate priority for overdue tickets with `dueDate`.

**Behavior**

- Eligible: `dueDate` set, `dueDate < now`, `status != DONE`, not soft-deleted.  
- **One priority step per run:** LOW→MEDIUM→HIGH→CRITICAL.  
- CRITICAL + overdue: priority stays CRITICAL; `isOverdue = true`.  
- Later runs may escalate again if still overdue and below CRITICAL.  
- CRITICAL with `isOverdue = true` is skipped on subsequent runs (idempotent).  
- Manual `PATCH` priority clears `isOverdue`; next run re-evaluates from new priority.  
- Does not change ticket status.

**Execution**

- Explicit `TicketsService.runAutoEscalation(now?: Date)` — **no** HTTP endpoint, cron, or queue in-repo.  
- Returns `{ escalated, markedOverdue, skipped }`.  
- Audit: `AUTO_ESCALATE` (SYSTEM), transactional with ticket update.

**Out of scope:** Notifications, email, SLA UI, status changes, in-repo schedulers.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [**README.md**](../README.md) | API contract |
| [**run.md**](../run.md) | Setup, build, test, run |
| [**prompts.md**](../prompts.md) | AI prompts used per workflow phase |
| [**docs/ai-workflow.md**](ai-workflow.md) | AI-assisted delivery workflow |
| [**skills/**](../skills/) | Engineering playbooks |
