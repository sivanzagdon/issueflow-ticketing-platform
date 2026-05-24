# Rollback Safety

## Concern

Failed audit writes must not leave orphaned domain changes (and vice versa).

## Mechanism

TypeORM `DataSource.transaction()` wraps both operations in one DB transaction. Failure in either path aborts the whole unit.

## Verified scenarios

| Scenario | Expected | Test |
|----------|----------|------|
| `save` fails before audit | No audit row | `audit-log.domain-transaction.spec.ts` |
| `record` throws after save | User/ticket not persisted | `audit-log-transaction.e2e-spec.ts` |
| `softDelete` fails | No DELETE audit | `tickets.soft-delete-restore.spec.ts` |
| `record` fails after soft delete | Transaction rejects (e2e/unit) | soft-delete + transaction specs |

## Unit test limitation

Jest mocks do not run a real database transaction. Service specs verify **call order** and manager propagation; e2e confirms rollback against PostgreSQL.

## Operational note

`test/jest-e2e.json` uses `maxWorkers: 1` because parallel e2e against one database with `synchronize: true` causes flaky schema conflicts—not an audit design issue, but affects rollback e2e reliability.

## References

- `test/audit-log-transaction.e2e-spec.ts`
- `src/tickets/tickets.soft-delete-restore.spec.ts` — "propagates error when audit write fails"
