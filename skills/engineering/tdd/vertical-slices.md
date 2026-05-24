# Vertical Slices

## Concern

How work is scoped so each increment ships a complete, reviewable unit of behavior.

## Approach

`docs/implementation-plan.md` decomposes IssueFlow into slices (Foundation → Users → Auth → Projects → Tickets → Comments → Quality → Audit Log → Soft Delete). Each slice lists deliverables, tests, and explicit **out of scope** items.

A vertical slice cuts through:

- entity + migration shape (TypeORM `synchronize` in dev)
- DTO validation
- service business rules
- thin controller
- module wiring
- tests

## Implementation in this repo

**Example — Slice 5 (Tickets):** `src/tickets/` module with `TicketsService` owning status transitions (`TODO → IN_PROGRESS → IN_REVIEW → DONE` only), optimistic locking via `@VersionColumn`, and audit on create/update/delete.

**Example — Slice 9 (Soft delete):** Tests landed first (`test(slice-9): add soft delete and restore specs`), then service/controller changes in one `feat(slice-9)` commit.

## Tradeoffs

| Choice | Benefit | Cost |
|--------|---------|------|
| Slice per domain module | Clear ownership, easy review | Cross-slice refactors (audit wiring) touch many files |
| Runnable after each slice | Continuous integration confidence | Resist “half a module” PRs |

## Anti-patterns here

- Adding README endpoints without service implementation.
- Shared abstractions before a second use case exists (no generic restore framework).

## References

- `docs/implementation-plan.md` — slice definitions
- `docs/ai-workflow.md` — plan-before-code
- `.cursor/rules/project-standards.mdc` — incremental delivery rules
