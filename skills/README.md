# Engineering Skills

Internal playbooks for how IssueFlow is built, tested, and evolved.

This directory is not user-facing API documentation. It captures **engineering methodology** aligned with the code that exists today: NestJS modules, TypeORM, JWT auth, transactional audit logging, and slice-driven delivery documented in `docs/implementation-plan.md`.

## Structure

```
skills/engineering/
  tdd/                    Test-first delivery and regression control
  audit-log-design/       Append-only audit trail and transactional writes
  soft-delete-restore/    TypeORM soft delete, restore, ADMIN authorization
  api-contract-alignment/ README as contract, DTOs, drift prevention
  ai-assisted-engineering/ Slice workflow with AI under explicit rules
```

Each area has a `SKILL.md` (overview + repo map) and focused subfiles for single concerns.

## How to use

1. Read the relevant `SKILL.md` before changing that subsystem.
2. Follow links to real modules, tests, and `README.md` sections.
3. Treat `README.md` as the HTTP contract; treat these skills as **how we honor it**.

## Scope boundary

IssueFlow’s README describes capabilities beyond the current backend (dependencies, attachments, import/export, mentions, schedulers). Skills document **implemented** behavior unless explicitly marked as contract-only or planned (`audit-log.extended-features.plan.spec.ts`).
