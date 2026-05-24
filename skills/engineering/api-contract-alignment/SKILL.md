# API Contract Alignment — IssueFlow

## Overview

HTTP behavior is governed by `README.md` tables: paths, methods, status codes, and response field names. Code aligns through Nest controllers, DTO validation, response mappers, and automated contract specs—not ad hoc JSON shaping in controllers.

## Why this matters

Graders and integrators treat README as the contract. Drift (wrong path, 201 vs 200, `actorType` vs `actor`) fails silently until e2e or review. Contract tests make drift fail in CI.

## How this repository applies it

| Mechanism | Purpose |
|-----------|---------|
| Thin controllers | Delegate to services; no business logic |
| DTOs + `ValidationPipe` | `whitelist`, `forbidNonWhitelisted` in `main.ts` |
| Mappers (`*.mapper.ts`) | Stable response shapes decoupled from entities |
| `src/quality/*.spec.ts` | Reflect metadata; assert routes and guards |

**Implemented API surface today:** Users, Auth (JWT + logout denylist), Projects, Tickets, Comments, Audit Log (GET), Soft Delete (tickets/projects).

**README-only (not implemented):** Dependencies, Attachments, Import/Export, Mentions, Auto-Escalation, Auto-Assignment.

## Core principles

1. **README wins on externals** — do not change README to match code.
2. **Mappers absorb schema naming** — e.g. audit `actor`/`timestamp`.
3. **Explicit HTTP codes** — `@HttpCode(200)` where Nest defaults differ (restore).
4. **Contract tests for routes** — method + path from decorators.

## Real examples

```typescript
// src/quality/testing/route-metadata.helpers.ts
export function expectHandlerRoute(controller, handler, method, path) { ... }
```

```typescript
// Global validation — src/main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

## Related files

| Path | Purpose |
|------|---------|
| `README.md` | Contract source |
| `src/quality/api-contract-metadata.spec.ts` | Route table |
| `src/audit-log/audit-log.api-contract.spec.ts` | Audit response fields |
| `src/tickets/dto/*.ts` | Input validation |
| `src/tickets/tickets.mapper.ts` | Ticket responses |

## Subfiles

- [readme-as-contract.md](./readme-as-contract.md)
- [dto-alignment.md](./dto-alignment.md)
- [backward-compatibility.md](./backward-compatibility.md)
- [contract-drift-prevention.md](./contract-drift-prevention.md)
