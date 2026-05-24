# Deterministic Workflows

## Concern

AI sessions should produce repeatable outcomes: same constraints, same verification, same artifacts.

## Fixed inputs

| Input | Purpose |
|-------|---------|
| `README.md` | HTTP contract |
| `docs/implementation-plan.md` | Scope per slice |
| `.cursor/rules/*.mdc` | Non-negotiable architecture |
| `compose.yml` | Postgres for e2e |

## Fixed verification

```bash
npm run test
npm run build
npm run test:e2e   # PostgreSQL required
```

E2E config: `test/jest-e2e.json` — single worker for DB isolation.

## Deterministic test patterns

- Fixtures: `src/*/testing/*.fixtures.ts` (`mockTicketEntity`, `mockUserResponse`)
- Route assertions: `expectHandlerRoute` — metadata-based, not stringly HTTP calls in unit tests
- Transaction assertions: `expectTransactionalAuditCall` — exact manager reference

## Avoid nondeterminism in specs

- `uniqueSuffix()` in e2e for usernames/emails—prevents collision, not flakiness
- Do not depend on wall-clock ordering without explicit sort (audit history sorts by `createdAt`)

## References

- `run.md` — local Postgres setup
- `src/audit-log/testing/transaction-test.helpers.ts`
