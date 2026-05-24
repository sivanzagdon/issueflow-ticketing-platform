# Regression Prevention

## Concern

Stopping silent breakage of API shape, auth, and domain invariants as slices accumulate.

## Approach

Three complementary guardrails:

### 1. Domain invariants in service specs

Encoded once per module, rerun on every change.

| Invariant | Test location |
|-----------|---------------|
| DONE ticket immutable | `tickets.service.spec.ts` |
| One-step status transition | `tickets.service.spec.ts` |
| Version conflict | `tickets.service.spec.ts` |
| Append-only audit service | `audit-log.append-only.spec.ts` |

### 2. Contract metadata specs

`src/quality/api-contract-metadata.spec.ts` reflects Nest decorators to assert HTTP method + path match README tables (Users, Auth, Projects, Tickets, Comments).

`src/quality/soft-delete-api-contract.spec.ts` covers `GET .../deleted` and `POST .../restore` plus `RolesGuard` presence.

### 3. E2E on PostgreSQL

`npm run test:e2e` exercises real TypeORM soft delete, JWT, and audit rows. Requires `compose.yml` Postgres (`run.md`).

## CI discipline

Before closing a slice:

```
npm run test
npm run build
npm run test:e2e   # when DB available
```

`test/jest-e2e.json` sets `maxWorkers: 1` to avoid parallel schema sync races on one database.

## Planned-but-unimplemented coverage

`src/audit-log/audit-log.extended-features.plan.spec.ts` uses `it.todo` for README features not built (AUTO_ASSIGN, ESCALATE, IMPORT, etc.). Prevents false confidence while documenting future contract.

## References

- `src/quality/docs-sanity.spec.ts` — doc file presence
- `.cursor/rules/testing-and-quality.mdc`
