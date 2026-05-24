# Engineering Instructions

## Development Approach

The project was implemented incrementally using small vertical slices.

Each slice followed the same workflow:
1. Review README.md and official requirements
2. Define the smallest safe implementation scope
3. Write tests first (TDD-first workflow)
4. Implement only the active slice
5. Run build and tests after every change
6. Review architecture consistency and edge cases
7. Harden implementation before commit

## Architectural Rules

The following rules guided implementation:

- thin controllers
- business logic inside services/domain helpers
- DTO validation for API boundaries
- transactional state changes when audit logging is involved
- optimistic locking for concurrent updates
- soft delete instead of hard delete
- preserve API contract alignment with README.md
- preserve runnable application state after every slice
- avoid overengineering and unnecessary abstractions

## Testing Rules

Tests were designed to:
- validate business behavior
- validate API contract alignment
- cover negative scenarios and edge cases
- keep deterministic execution
- avoid brittle implementation-coupled assertions

The project uses:
- unit tests
- integration/service tests
- e2e tests against PostgreSQL

## AI Agent Guidance

AI agents were instructed to:
- preserve existing architecture patterns
- avoid unrelated refactors
- follow repository conventions
- keep implementation scoped to the active slice
- review relevant engineering skill files before modifications
- keep documentation aligned with implementation

## Skills Usage

Reusable engineering skill files were used for:
- NestJS architecture conventions
- transactional patterns
- audit logging patterns
- testing conventions
- DTO validation
- API contract alignment
- production hardening checklists