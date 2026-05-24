# Audit Log Design — IssueFlow

## Overview

Audit logs are an **append-only** record of state-changing operations. Domain services call a centralized `AuditLogService.record()`; consumers read via `GET /audit-logs` and ticket `stateHistory` projection. No public API mutates or deletes audit rows.

## Why this matters

IssueFlow must explain who changed what, when, and with what payload—without coupling history storage to entity tables. Ticket status history is **derived** from audit rows, not duplicated on `Ticket`.

## How this repository applies it

| Component | Responsibility |
|-----------|----------------|
| `AuditLog` entity | `audit_logs` table, JSONB `details`, enums for action/entity/actor |
| `AuditLogService` | `record`, `findAll`, `buildTicketStateHistory` |
| `audit-log.mapper.ts` | Maps DB `actorType` → API `actor`, `createdAt` → `timestamp` |
| Domain services | Pass `EntityManager` into `record` inside transactions |

Wired domains today: **Users, Projects, Tickets, Comments** (CREATE/UPDATE/DELETE; Tickets/Projects also RESTORE).

**Not implemented:** extended README actions (`AUTO_ASSIGN`, `ESCALATE`, `IMPORT`) — tracked as `it.todo` in `audit-log.extended-features.plan.spec.ts`.

## Core principles

1. **Write path only through `record()`** — no `update`/`delete` on service.
2. **Transactional coupling** — mutation + audit commit or roll back together.
3. **API mapper owns naming** — README uses `actor` and `timestamp`; DB uses `actor_type` and `created_at`.
4. **Projection over duplication** — `stateHistory` built at read time from audit rows.

## Real examples

```typescript
// src/audit-log/audit-log.service.ts
async record(input: RecordAuditLogInput, manager?: EntityManager) {
  const repository = manager
    ? manager.getRepository(AuditLog)
    : this.auditLogRepository;
  // create + save only
}
```

```typescript
// src/tickets/tickets.service.ts — status change details
details: { from: beforeStatus, to: saved.status }
```

## Related files

| Path | Purpose |
|------|---------|
| `src/audit-log/entities/audit-log.entity.ts` | Schema |
| `src/common/enums/audit-action.enum.ts` | CREATE, UPDATE, DELETE, RESTORE |
| `src/audit-log/dto/audit-log-query.dto.ts` | Query filters (`actor` maps to `actorType`) |
| `src/audit-log/audit-log.controller.ts` | GET only |
| `src/audit-log/audit-log.api-contract.spec.ts` | Response shape |
| `test/audit-log.e2e-spec.ts` | Integration |

## Subfiles

- [append-only.md](./append-only.md)
- [transactional-auditing.md](./transactional-auditing.md)
- [rollback-safety.md](./rollback-safety.md)
- [actor-mapping.md](./actor-mapping.md)
