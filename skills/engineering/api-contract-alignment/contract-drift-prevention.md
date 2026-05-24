# Contract Drift Prevention

## Concern

Decorators, paths, and response shapes drifting from README without anyone noticing.

## Automated checks

| Spec | Catches |
|------|---------|
| `api-contract-metadata.spec.ts` | Wrong HTTP method or path on controller handlers |
| `soft-delete-api-contract.spec.ts` | Missing deleted/restore routes; missing `RolesGuard` |
| `security-guards.spec.ts` | Missing `JwtAuthGuard`; public route mistakes |
| `audit-log.api-contract.spec.ts` | Audit JSON field names |
| `docs-sanity.spec.ts` | Required doc files exist |

## E2E as second line

`test/*.e2e-spec.ts` assert status codes and body shapes against running app + PostgreSQL.

## Manual smoke (from implementation plan)

Slice checklists include manual steps (401 without JWT, 404 on invalid routes). Use when adding endpoints before e2e exists.

## When README exceeds implementation

Use `it.todo` or dedicated `*.plan.spec.ts` files—not skipped tests that pass vacuously. Example: `audit-log.extended-features.plan.spec.ts` for unbuilt README audit actions.

## References

- `src/quality/testing/route-metadata.helpers.ts`
- `docs/implementation-plan.md` — validation checklists per slice
