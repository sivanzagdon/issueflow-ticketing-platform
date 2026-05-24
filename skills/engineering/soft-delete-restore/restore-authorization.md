# Restore Authorization

## Concern

Only ADMIN users may list deleted entities or restore them. Regular developers retain delete capability on their own work but cannot browse the deletion tombstone set.

## Implementation

Minimal RBAC—no permission matrix:

| Piece | Location |
|-------|----------|
| `@Roles(UserRole.ADMIN)` | Handler metadata |
| `RolesGuard` | `src/auth/guards/roles.guard.ts` |
| `ROLES_KEY` reflector | `src/auth/decorators/roles.decorator.ts` |
| JWT user on request | `JwtStrategy` loads full user including `role` |

Applied on:

- `TicketsController.findAllDeleted`, `TicketsController.restore`
- `ProjectsController.findAllDeleted`, `ProjectsController.restore`

Controller-level `@UseGuards(JwtAuthGuard)` runs first; handler-level `@UseGuards(RolesGuard)` enforces role.

## HTTP outcomes

| Caller | Result |
|--------|--------|
| No token | 401 (`JwtAuthGuard`) |
| DEVELOPER token | 403 (`RolesGuard`) |
| ADMIN token | Proceeds to service |

## Module wiring

`AuthModule` exports `RolesGuard`. `TicketsModule` and `ProjectsModule` import `AuthModule` so Nest can inject the guard.

## Tests

| Layer | File |
|-------|------|
| Guard unit | `src/auth/guards/roles.guard.spec.ts` |
| Metadata | `src/quality/soft-delete-api-contract.spec.ts` |
| E2E | `test/soft-delete-restore.e2e-spec.ts` — `ADMIN-only authorization` describe block |

## Not implemented

Field-level ACL, project membership checks, or separate `ADMIN` CRUD for users beyond existing `Users` API.

## References

- `README.md` — Soft Delete APIs section
- `src/common/enums/user-role.enum.ts` — `ADMIN`, `DEVELOPER`
