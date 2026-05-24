# Actor Mapping

## Concern

HTTP responses must match README field names while the database keeps normalized column names.

## Mapping

| Database (`AuditLog` entity) | API (`AuditLogResponse`) |
|------------------------------|--------------------------|
| `actorType` | `actor` |
| `createdAt` | `timestamp` |
| `performedBy` | `performedBy` (unchanged) |

Implemented in `src/audit-log/audit-log.mapper.ts` via `toAuditLogResponse()`. Ticket `stateHistory` entries reuse the same mapping through `toTicketStateHistoryEntry()`.

## Query DTO alignment

`AuditLogQueryDto` accepts `actor` (README-facing). `AuditLogService.buildWhere()` maps it to `where.actorType` for TypeORM.

`performedBy` filter retained for backward compatibility in tests and queries.

## Actor values

`AuditActor` enum: `USER`, `SYSTEM`. Current writes use `AuditActor.USER` from domain services. `SYSTEM` is reserved for future automated actions (escalation, auto-assign)—not written today.

## References

- `src/audit-log/audit-log.mapper.ts`
- `src/audit-log/audit-log.api-contract.spec.ts`
- `src/audit-log/dto/audit-log-query.dto.ts`
- `src/common/enums/audit-actor.enum.ts`
