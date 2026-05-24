# DTO Alignment

## Concern

Request bodies must validate exactly what README allows—no extra fields, correct enums, required fields enforced.

## Pattern

Each write endpoint uses a class-validator DTO in `src/*/dto/`:

```typescript
// Example pattern — create-ticket.dto.ts
@IsEnum(TicketStatus)
status: TicketStatus;

@IsInt()
@Min(1)
projectId: number;
```

`ValidationPipe` strips unknown properties (`whitelist`) and rejects unknown keys (`forbidNonWhitelisted`).

## Enum alignment

Shared enums live in `src/common/enums/`:

- `TicketStatus`, `TicketPriority`, `TicketType`
- `UserRole` (`ADMIN`, `DEVELOPER`)
- `AuditAction`, `AuditEntityType`, `AuditActor`

DTOs import these—never duplicate string unions.

## Query DTOs

`AuditLogQueryDto` validates `GET /audit-logs` filters. Maps README `actor` to internal `actorType` in service layer.

## Tests

Colocated `*.dto.spec.ts` files assert validation failures (invalid enum, missing required field).

## References

- `src/tickets/dto/create-ticket.dto.ts`
- `src/tickets/dto/update-ticket.dto.ts` — includes `version` for optimistic locking
- `src/main.ts` — global pipe config
