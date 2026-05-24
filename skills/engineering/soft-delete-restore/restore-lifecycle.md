# Restore Lifecycle

## Concern

End-to-end behavior from soft delete through restore and re-entry into normal queries.

## States

```
ACTIVE (deletedAt = null)
   |  DELETE /tickets/:id  (softDelete)
   v
DELETED (deletedAt set, hidden from default find)
   |  POST /tickets/:id/restore  (ADMIN)
   v
ACTIVE (deletedAt cleared, DELETE audit + RESTORE audit in log)
```

## Visibility rules

| Operation | Standard GET | GET /deleted |
|-----------|--------------|--------------|
| Active ticket | Visible | Not listed |
| Soft-deleted ticket | 404 on `findOne` | Listed |
| After restore | Visible again | Not listed |

TypeORM excludes soft-deleted entities from `find`/`findOne` unless `withDeleted: true`.

## Error semantics

| Case | HTTP |
|------|------|
| Restore missing id | 404 |
| Restore non-deleted entity | 404 (treated as not restorable) |
| DEVELOPER calls restore | 403 |
| No JWT | 401 |

## Audit trail

DELETE action records `details.deletedAt` (ISO string). RESTORE records `before` / `after` deletedAt in `details`.

## References

- `test/soft-delete-restore.e2e-spec.ts`
- `src/tickets/tickets.service.ts` — `remove`, `restore`
