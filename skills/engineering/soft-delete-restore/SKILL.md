# Soft Delete and Restore — IssueFlow

## Overview

Tickets and projects use TypeORM soft delete (`@DeleteDateColumn`). Public DELETE endpoints set `deletedAt`; they do not hard-delete rows. Deleted records are hidden from standard queries but listable and restorable by **ADMIN** users via dedicated endpoints.

## Why this matters

Support and compliance often require undo—not destruction. Separating “delete from normal views” from “restore” keeps the default API simple while giving operators a controlled recovery path.

## How this repository applies it

| Endpoint | Auth | Behavior |
|----------|------|----------|
| `DELETE /tickets/:id`, `DELETE /projects/:id` | JWT (any role) | `softDelete` + DELETE audit |
| `GET /tickets/deleted?projectId=` | JWT + **ADMIN** | DB-filtered deleted tickets |
| `POST /tickets/:id/restore` | JWT + **ADMIN** | Transactional restore + RESTORE audit, **200 OK** |
| `GET /projects/deleted` | JWT + **ADMIN** | DB-filtered deleted projects |
| `POST /projects/:id/restore` | JWT + **ADMIN** | Transactional restore + RESTORE audit, **200 OK** |

Entities: `Ticket`, `Project` with `deletedAt`. Standard `find` / `findOne` exclude soft-deleted rows automatically.

## Core principles

1. **No hard delete in public API** — only `softDelete` / `restore`.
2. **DB-level deleted filters** — `Not(IsNull())` on `deletedAt`, not in-memory filtering.
3. **Restore is fully transactional** — lookup, restore, audit in one `dataSource.transaction`.
4. **ADMIN gate on recovery** — `RolesGuard` + `@Roles(UserRole.ADMIN)`.

## Real examples

```typescript
// Deleted list — src/tickets/tickets.service.ts
await this.ticketRepository.find({
  where: { projectId, deletedAt: Not(IsNull()) },
  withDeleted: true,
});
```

```typescript
// Controller — src/tickets/tickets.controller.ts
@Get('deleted')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
findAllDeleted(...)
```

## Related files

| Path | Purpose |
|------|---------|
| `src/auth/guards/roles.guard.ts` | Role enforcement |
| `src/auth/decorators/roles.decorator.ts` | `@Roles()` metadata |
| `src/tickets/tickets.soft-delete-restore.spec.ts` | Service unit tests |
| `src/quality/soft-delete-api-contract.spec.ts` | Route + guard contract |
| `test/soft-delete-restore.e2e-spec.ts` | ADMIN/DEVELOPER e2e |

## Subfiles

- [restore-lifecycle.md](./restore-lifecycle.md)
- [transactional-restore.md](./transactional-restore.md)
- [deleted-query-strategy.md](./deleted-query-strategy.md)
- [restore-authorization.md](./restore-authorization.md)
