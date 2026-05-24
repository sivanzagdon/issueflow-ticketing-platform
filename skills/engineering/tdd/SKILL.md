# TDD and Quality — IssueFlow

## Overview

IssueFlow uses test-driven and test-backed delivery: failing specs define behavior first; implementation makes them pass without breaking prior slices. Quality is enforced through unit specs colocated with domains, contract specs under `src/quality/`, and PostgreSQL e2e tests under `test/`.

## Why this matters

The assignment spans auth, lifecycle rules, concurrency, audit integrity, and soft delete. Regressions are expensive. Tests encode contracts that README tables alone cannot enforce (transaction boundaries, guard metadata, status transitions).

## How this repository applies it

| Layer | Role |
|-------|------|
| Domain `*.spec.ts` | Service rules, mocks, transactional audit assertions |
| `src/quality/*.spec.ts` | Cross-cutting contract: routes, guards, README alignment |
| `test/*.e2e-spec.ts` | Real DB flows (JWT, soft delete, audit) |

Slices in `docs/implementation-plan.md` (1–9) map to commits like `test(slice-N):` then `feat(slice-N):`. Cursor rules in `.cursor/rules/testing-and-quality.mdc` require running tests before closing a slice.

## Core principles

1. **Meaningful tests only** — assert behavior, not implementation trivia.
2. **Vertical slices** — one complete flow per increment; app stays runnable.
3. **Contract tests are cheap insurance** — route metadata catches Nest decorator drift.
4. **E2E when persistence matters** — transactions, soft delete, audit rows need PostgreSQL (`run.md`).

## Real examples

**Ticket lifecycle (unit):** `src/tickets/tickets.service.spec.ts` — DONE tickets reject updates; version conflicts throw `ConflictException`.

**Transactional audit (unit):** `src/audit-log/audit-log.domain-transaction.spec.ts` — `expectTransactionalAuditCall` verifies `record(input, manager)` from `src/audit-log/testing/transaction-test.helpers.ts`.

**Soft delete (unit + e2e):** `src/tickets/tickets.soft-delete-restore.spec.ts`, `test/soft-delete-restore.e2e-spec.ts`.

**Security metadata:** `src/quality/security-guards.spec.ts` — `JwtAuthGuard` on controllers; `RolesGuard` on ADMIN-only routes.

## Related files

| Path | Purpose |
|------|---------|
| `src/audit-log/testing/transaction-test.helpers.ts` | Mock `DataSource.transaction`, assert audit manager |
| `src/quality/testing/route-metadata.helpers.ts` | Reflect Nest handler method + path |
| `test/jest-e2e.json` | `maxWorkers: 1` — shared DB safety |
| `.cursor/rules/testing-and-quality.mdc` | Pre-merge checklist |

## Subfiles

- [vertical-slices.md](./vertical-slices.md)
- [transactional-testing.md](./transactional-testing.md)
- [regression-prevention.md](./regression-prevention.md)
