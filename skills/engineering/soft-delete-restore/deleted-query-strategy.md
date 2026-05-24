# Deleted Query Strategy

## Concern

Listing deleted records must be efficient, correct, and must not leak deleted rows into normal list endpoints.

## Strategy

Use TypeORM soft-delete support explicitly:

```typescript
// Tickets — project-scoped deleted list
where: { projectId, deletedAt: Not(IsNull()) },
withDeleted: true,

// Projects — all deleted projects
where: { deletedAt: Not(IsNull()) },
withDeleted: true,
```

`withDeleted: true` is required because TypeORM still applies soft-delete scope; filtering `deletedAt IS NOT NULL` selects only tombstoned rows.

## Anti-pattern removed

Earlier implementation used `find({ withDeleted: true })` then `.filter(t => t.deletedAt != null)` in application code. That loads active + deleted rows—wrong at scale and error-prone.

## Standard queries unchanged

`findAll`, `findOne` on tickets/projects do **not** pass `withDeleted`. Active-only results require no extra filter.

## References

- `src/tickets/tickets.service.ts` — `findAllDeleted`
- `src/projects/projects.service.ts` — `findAllDeleted`
- `src/tickets/tickets.soft-delete-restore.spec.ts` — asserts `Not(IsNull())` in `find` call
