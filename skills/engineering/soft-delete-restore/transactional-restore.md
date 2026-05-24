# Transactional Restore

## Concern

Restore must not commit visibility changes without a matching RESTORE audit row.

## Implementation

All restore steps run inside `dataSource.transaction`:

1. `findOne({ where: { id }, withDeleted: true })` — confirm deleted
2. Capture `deletedAt` for audit `before`
3. `repository.restore({ id })` — clear `deletedAt`
4. `findOne({ where: { id } })` — load active row for response
5. `auditLogService.record(RESTORE, ..., manager)`

Pre-transaction lookup was removed in Slice 9 polish so no repository work escapes the transaction boundary.

## Symmetry with delete

`remove()` loads active entity **outside** transaction (validation only), then transaction runs `softDelete` + DELETE audit. Restore keeps validation **inside** because deleted rows are invisible to default `findOne`.

## Failure behavior

| Failure point | Result |
|---------------|--------|
| Not found / not deleted | Throws before mutate; no audit |
| `restore()` fails | Rollback; no audit |
| `record()` fails | Rollback restore; no audit row |

## References

- `src/projects/projects.service.ts` — `restore`
- `src/tickets/tickets.service.ts` — `restore`
- `src/projects/projects.soft-delete-restore.spec.ts` — rollback test
