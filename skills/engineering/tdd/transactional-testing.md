# Transactional Testing

## Concern

Verifying that domain mutations and audit writes share one database transaction.

## Approach

Production code uses `DataSource.transaction(async (manager) => { ... })`. Services call `auditLogService.record(input, manager)` so audit inserts use the same `EntityManager` as the mutation.

Unit tests must mock **one** transactional `manager` and assert `record` receives it as the second argument.

## Implementation in this repo

**Helper:** `createMockTransactionalContext()` in `src/audit-log/testing/transaction-test.helpers.ts`

```typescript
// Pattern used in tickets.soft-delete-restore.spec.ts
const ctx = createMockTransactionalContext();
dataSource = ctx.dataSource;
transactionalManager = ctx.manager;
transactionalManager.getRepository = jest.fn((entity) => ticketRepository);

// After operation:
expectTransactionalAuditCall(auditLogService, transactionalManager, {
  action: AuditAction.DELETE,
  entityType: AuditEntityType.TICKET,
  ...
});
```

**Contract suite:** `src/audit-log/audit-log.domain-transaction.spec.ts` wires Users, Projects, Tickets, Comments services and asserts:

- audit called with manager on success
- no audit when mutation fails inside transaction

**E2E:** `test/audit-log-transaction.e2e-spec.ts` — simulated audit failure rolls back user creation.

## Pitfall

Mixing `mockDataSourceWithRepositories()` with `createMockTransactionalContext()` in the same spec produces a **different** manager instance than `expectTransactionalAuditCall` expects. Use `ctx.dataSource` consistently (see soft-delete service specs).

## References

- `src/tickets/tickets.service.ts` — `remove`, `restore`, `create`, `update`
- `src/audit-log/audit-log.service.ts` — `record(input, manager?)`
- `test/audit-log-transaction.e2e-spec.ts`
