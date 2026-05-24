# Append-Only Audit Trail

## Concern

Audit data must never be updated or deleted through application code.

## Implementation

`AuditLogService` exposes only:

- `record()` — insert
- `findAll()` — read with filters
- `buildTicketStateHistory()` — read projection

`src/audit-log/audit-log.append-only.spec.ts` asserts the service has no `update`, `remove`, or `delete` methods and that the repository mock never receives update/delete during `record`.

`AuditLogController` exposes **GET `/audit-logs` only**. No POST/PUT/PATCH/DELETE handlers.

## Schema signals

`AuditLog` uses `@CreateDateColumn` for `createdAt`. No `updatedAt`. No soft delete on audit rows.

## Out of scope (by design)

README does not require audit correction APIs. Operational retention/archival is infrastructure concern, not implemented here.

## References

- `src/audit-log/audit-log.append-only.spec.ts`
- `docs/implementation-plan.md` — Slice 8 out-of-scope list
