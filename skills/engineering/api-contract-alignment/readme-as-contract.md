# README as Contract

## Concern

External behavior is defined in documentation, not inferred from implementation.

## Rules

1. New endpoints require README table rows **before** or **with** implementation.
2. Response examples in README use public names (`actor`, `timestamp`, `role`, `version`).
3. Status codes in README are explicit expectations (e.g. restore → 200 OK, not 201).

## Nest route alignment

Controller `@Controller('tickets')` + handler paths must compose to README paths:

| README | Controller |
|--------|------------|
| `GET /tickets/deleted?projectId=` | `@Get('deleted')` on `TicketsController` |
| `POST /tickets/:ticketId/restore` | `@Post(':ticketId/restore')` |

Route order matters: static segments (`deleted`) before parametric (`:ticketId`).

## Assignment source

`docs/TDP_issueflow_requirements.pdf` is authoritative for scope; README is the integrator-facing HTTP contract. `docs/implementation-plan.md` bridges requirements into slices.

## References

- `README.md`
- `src/quality/api-contract-metadata.spec.ts`
- `src/quality/soft-delete-api-contract.spec.ts`
