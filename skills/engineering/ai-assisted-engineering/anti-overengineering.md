# Anti-Overengineering

## Concern

AI defaults toward abstractions, base classes, and generic frameworks. IssueFlow explicitly rejects that until repetition justifies it.

## Project rules

From `.cursor/rules/project-standards.mdc`:

- Prefer one complete flow over many partial features
- Avoid premature abstractions
- Keep files small and cohesive
- Controllers thin; logic in services

## Examples of restraint in this codebase

| Temptation | Actual choice |
|------------|---------------|
| Generic `RestorableEntityService` | Explicit `restore()` per domain service |
| Event bus for audit | Direct `AuditLogService.record()` |
| Full RBAC matrix | `RolesGuard` + `@Roles(ADMIN)` on four handlers |
| CQRS for tickets | Single `TicketsService` with lifecycle helpers |

## README vs implementation

README describes future capabilities (dependencies, attachments, schedulers). Do not scaffold them “for later” without a slice—use plan specs (`audit-log.extended-features.plan.spec.ts`) instead.

## When to abstract

Extract helpers only after **two** call sites share identical logic. Example justified: `transaction-test.helpers.ts` (many domain specs need same mock transaction).

## References

- `.cursor/rules/project-standards.mdc`
- `.cursor/rules/backend-architecture.mdc`
