# Transactional Auditing

## Concern

Audit rows must reflect committed domain state, not speculative or rolled-back work.

## Pattern

```typescript
return this.dataSource.transaction(async (manager) => {
  const saved = await manager.getRepository(Entity).save(entity);
  await this.auditLogService.record({ ... }, manager);
  return toResponse(saved);
});
```

`AuditLogService.record` selects repository from optional `manager`:

```typescript
const repository = manager
  ? manager.getRepository(AuditLog)
  : this.auditLogRepository;
```

## Domains using this pattern

| Service | Operations |
|---------|------------|
| `UsersService` | create, update, remove |
| `ProjectsService` | create, update, remove, restore |
| `TicketsService` | create, update, remove, restore |
| `CommentsService` | create, update, remove |

## Ordering inside transaction

Typical order: **mutate first, audit second**. If `record` throws, TypeORM rolls back the mutation. If mutation throws, `record` is never reached.

Soft delete: `softDelete` then `DELETE` audit. Restore: lookup → `restore` → `RESTORE` audit (all inside one transaction in Slice 9).

## Testing

`expectTransactionalAuditCall` in `src/audit-log/testing/transaction-test.helpers.ts` is the canonical assertion for unit specs.

## References

- `src/audit-log/audit-log.domain-transaction.spec.ts`
- `src/audit-log/audit-log.domain-writes.spec.ts`
