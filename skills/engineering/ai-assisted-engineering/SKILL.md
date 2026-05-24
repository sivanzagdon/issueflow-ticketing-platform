# AI-Assisted Engineering — IssueFlow

## Overview

IssueFlow was built with AI as a **constrained assistant**: planning and codegen under explicit architecture rules, with human review and accountability. AI does not define the contract—`README.md`, `docs/implementation-plan.md`, and `.cursor/rules/` do.

## Why this matters

AI accelerates boilerplate and test generation but will over-build, invent endpoints, or drift from patterns unless bounded. This repo encodes boundaries in docs, Cursor rules, and skills.

## How this repository applies it

| Artifact | Role |
|----------|------|
| `docs/ai-workflow.md` | Declared workflow and model usage |
| `docs/implementation-plan.md` | Slice scope, deliverables, out-of-scope |
| `.cursor/rules/*.mdc` | Always-on agent constraints |
| `skills/engineering/` | Durable playbooks (this tree) |
| Commit messages | `test(slice-N):` / `feat(slice-N):` traceability |

Typical slice flow: plan → failing tests → minimal implementation → `npm run test` / `build` / `test:e2e` → amend or commit.

## Core principles

1. **Plan before code** — slice scope from implementation plan.
2. **Smallest correct change** — match existing module layout.
3. **No invented systems** — if README lists it but code lacks it, use `it.todo` or plan specs.
4. **Human accountable** — per `docs/ai-workflow.md`.

## Real examples

**Slice 8 audit hardening:** Transactional `record(manager)`, mapper rename to `actor`/`timestamp`, domain transaction specs.

**Slice 9 soft delete:** Tests first; `RolesGuard` added only for ADMIN endpoints; DB `Not(IsNull())` filter; restore fully transactional.

**Cursor rules:** `backend-architecture.mdc` enforces Nest module boundaries, DTO validation, ticket lifecycle, DONE immutability.

## Related files

| Path | Purpose |
|------|---------|
| `docs/ai-workflow.md` | Workflow statement |
| `.cursor/rules/project-standards.mdc` | Incremental delivery |
| `.cursor/rules/backend-architecture.mdc` | Nest/TypeORM rules |
| `.cursor/rules/testing-and-quality.mdc` | Test expectations |
| `prompts.md` | Prompt patterns (if used in session) |

## Subfiles

- [slice-driven-development.md](./slice-driven-development.md)
- [anti-overengineering.md](./anti-overengineering.md)
- [deterministic-workflows.md](./deterministic-workflows.md)
- [ai-review-process.md](./ai-review-process.md)
