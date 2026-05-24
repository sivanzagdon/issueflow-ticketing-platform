# AI Workflow

This project was implemented using an AI-assisted engineering workflow. The exact prompts used at each stage are recorded in [**prompts.md**](../prompts.md). This document describes the workflow those prompts support.

---

## Model Used

GPT-5.5 Thinking and Cursor AI agent.

---

## AI Usage Summary

AI was used as an engineering assistant for:

- planning the implementation into vertical slices
- reviewing the README and official requirements
- writing TDD-first test suites
- implementing one slice at a time
- reviewing code quality, API contract alignment, and edge cases
- hardening implementation details before submission
- maintaining architectural consistency across slices

All generated code was reviewed, tested, and adjusted by the developer before being committed.

The AI agent was not used as a replacement for understanding the system. It was used as a development assistant under explicit project rules, [**.cursor/rules/**](../.cursor/rules/), and architecture constraints.

I remain fully accountable for the submitted implementation.

---

## Engineering Skills Usage

Reusable engineering **skills** files under [**skills/**](../skills/) were used throughout the project to keep implementation consistent across slices.

These skill files included:

- NestJS architecture conventions
- audit logging patterns
- transactional write patterns
- testing conventions
- DTO validation rules
- commit conventions
- slice workflow rules
- API contract alignment rules
- review/hardening checklists

The AI agent was instructed to review relevant skill files before implementing or modifying a slice in order to preserve architectural consistency and avoid regressions.

---

## Workflow Principles

- Plan before coding.
- Reduce scope into small vertical slices (see [**docs/implementation-plan.md**](implementation-plan.md)).
- Keep the backend runnable after every slice.
- Implement the smallest correct version first.
- Avoid overengineering.
- Use AI for planning, code review, edge-case discovery, and test suggestions — not for inventing endpoints or features outside the README contract.

---

## Workflow Phases

Each slice followed the same high-level cycle. Step numbers map to the prompts in [**prompts.md**](../prompts.md).

### Phase 1 — Initial planning (Prompt 1)

Before any code:

- identify the real product goal and assumptions
- split work into vertical slices and a runnable implementation order
- decide architecture for modules, auth, RBAC, ticket lifecycle, audit, soft delete, and tests
- document scope and risks in **implementation-plan.md**

**Commit style:** planning docs only (no feature code yet).

### Phase 2 — TDD slice planning (Prompt 2)

For each new slice:

- re-read **README.md** and requirements
- review previous slices and relevant **skills/** files
- write behavior-focused tests first (unit and e2e where relevant)
- expose implementation gaps via intentionally failing tests

**Commit:** `test(slice-X): add [feature] specs`

### Phase 3 — Slice implementation (Prompt 3)

- read **README.md**, **run.md**, **prompts.md**, failing tests, and relevant skills
- implement only the current slice; keep controllers thin and logic in services
- preserve API response shapes, DTO validation, TypeORM patterns, and transactional audit writes
- run `npm run build`, `npm test`, and relevant `npm run test:e2e` suites

**Commit:** `feat(slice-X): implement [feature]`

### Phase 4 — Senior code review (Prompt 4)

AI-assisted review against:

- API contract and requirements alignment
- NestJS architecture, auth/RBAC, transactions, audit, soft delete, concurrency
- test and e2e coverage; missing edge cases; documentation accuracy

Output: critical issues, important improvements, and suggested next action.

### Phase 5 — Production hardening (Prompt 5)

Focus on correctness, transaction boundaries, query efficiency, validation gaps, brittle tests, and accidental feature creep.

**Commit (when needed):** `fix(slice-X): [short description]`

### Phase 6 — Documentation alignment (Prompt 6)

Before submission, align **README.md**, **run.md**, **prompts.md**, and **implementation-plan.md** with the actual code:

- no completed feature marked as missing
- no nonexistent feature documented as implemented
- setup commands match **package.json**
- Docker/PostgreSQL and build/test expectations are accurate
- AI usage and known tradeoffs stated clearly

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [**prompts.md**](../prompts.md) | Full prompt text for each phase |
| [**run.md**](../run.md) | Install, build, test, and run instructions |
| [**docs/implementation-plan.md**](implementation-plan.md) | Slice breakdown and status |
| [**skills/**](../skills/) | Engineering playbooks and conventions |
| [**.cursor/rules/**](../.cursor/rules/) | Persistent AI/project rules |
