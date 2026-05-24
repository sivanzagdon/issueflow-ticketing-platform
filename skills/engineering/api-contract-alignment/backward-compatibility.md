# Backward Compatibility

## Concern

Evolving the API without breaking existing clients or tests.

## Current practices

### Additive query parameters

`AuditLogQueryDto` keeps `performedBy` while README documents `actor`. Service supports both filters—existing callers keep working.

### Mapper indirection

Changing DB column names does not break API if mappers are updated once (`audit-log.mapper.ts`). Entities keep `actorType`; responses expose `actor`.

### Version field on tickets

`UpdateTicketDto.version` required; `ConflictException` on mismatch. Clients must send current version—documented behavior, not silent overwrite.

## Breaking change policy (project-local)

1. Update README row.
2. Update contract spec.
3. Update e2e.
4. Implement code.

Do not rename public response fields without README change.

## Soft delete compatibility

DELETE still returns 200; resources disappear from standard GET. Clients that ignore soft-delete endpoints behave as before. Recovery is opt-in via ADMIN routes.

## References

- `src/audit-log/dto/audit-log-query.dto.ts`
- `src/tickets/tickets.service.ts` — version conflict handling
