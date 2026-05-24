# Slice-Driven Development

## Concern

How AI and humans coordinate delivery in bounded increments.

## Slice anatomy

From `docs/implementation-plan.md`, each slice defines:

- **Goal** — user-visible capability
- **Deliverables** — files/modules
- **Tests** — unit + e2e expectations
- **Out of scope** — explicit exclusions
- **Validation checklist** — commands to run

## Commit convention

```
test(slice-N): add <behavior> specs
feat(slice-N): implement <behavior>
```

Tests may fail until implementation lands. Keeps review diffs interpretable.

## AI task framing

Effective prompts reference:

1. Slice number and implementation-plan section
2. README endpoint table (no invented shapes)
3. Existing module to extend (not new framework)
4. Required test commands before done

## Runnable invariant

After every slice the app must start, migrate/sync schema, and pass prior tests. Slice 7 added quality/docs; Slice 8–9 hardened audit and soft delete without rewriting unrelated domains.

## References

- `docs/implementation-plan.md` — Slices 1–9
- Git history — `feat(slice-*)` messages
