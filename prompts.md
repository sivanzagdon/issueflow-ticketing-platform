# AI Prompts

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

---

## Engineering Skills Usage

Reusable engineering "skills" files were used throughout the project to keep implementation consistent across slices.

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

## Prompt 1: Initial Planning

You are a senior backend engineer.

Review the IssueFlow assignment requirements and README.md API contract.

Do not write code yet.

First:
- identify the real product goal
- clarify assumptions
- reduce scope into small vertical slices
- define the smallest strong backend MVP
- identify risky requirements early
- create an implementation order that keeps the app runnable after every step

Focus on:
- NestJS module structure
- database model
- DTO validation
- JWT authentication
- RBAC
- ticket lifecycle rules
- optimistic locking
- audit logging
- soft delete behavior
- test strategy
- API contract alignment

Return:
- MVP scope
- vertical slices
- implementation order
- main architecture decisions
- key risks and tradeoffs

---

## Prompt 2: TDD Slice Planning

You are a senior backend engineer.

We are starting a new implementation slice.

Current slice:
[SLICE NAME]

Before implementation, write the test suite first using strict TDD.

Requirements:
- re-read README.md
- re-read the official requirements document
- review previous slices
- review relevant engineering skill files
- preserve existing behavior
- do not implement production code yet
- write tests that define the API and business contract
- include edge cases and negative cases
- keep tests behavior-focused and not overly coupled to internals

Cover:
- service-level behavior
- validation rules
- audit behavior
- transaction behavior
- API contract
- e2e scenarios when relevant

After writing tests:
- report files added
- number of tests added
- intentionally failing tests
- implementation gaps exposed
- confirmation no production code was added

Commit with:
test(slice-X): add [feature] specs

---

## Prompt 3: Slice Implementation

You are now implementing the current slice.

Current slice:
[SLICE NAME]

Before coding:
- read README.md
- read the official requirements
- read run.md
- read prompts.md
- review previous slices
- review relevant engineering skill files
- review the failing tests for this slice
- review relevant engineering skill files
- follow existing repository conventions
- preserve architectural consistency between slices

Implementation requirements:
- implement only the current slice
- do not rewrite unrelated code
- keep controllers thin
- keep business logic in services/domain helpers
- preserve existing architecture
- preserve existing API response shapes
- use DTO validation where relevant
- use TypeORM patterns already used in the project
- keep audit writes transactional when state changes
- avoid overengineering
- keep the app runnable

After coding:
- run npm run build
- run npm test
- run relevant e2e tests
- self-review for bugs, missing edge cases, and README alignment

Commit with:
feat(slice-X): implement [feature]

---

## Prompt 4: Senior Code Review

Review the current implementation as a senior backend engineer.

Check:
- API contract alignment
- requirements alignment
- NestJS architecture
- DTO validation
- auth/RBAC boundaries
- database consistency
- transaction safety
- audit log correctness
- soft delete behavior
- concurrency behavior
- test coverage
- e2e coverage
- overengineering
- missing edge cases
- documentation accuracy

Return:
- critical issues
- important improvements
- nice-to-have improvements
- suggested next action

---

## Prompt 5: Production Hardening

Review the implemented slice for production-readiness.

Focus on:
- correctness
- edge cases
- transaction boundaries
- database query efficiency
- validation gaps
- brittle tests
- documentation mismatch
- unnecessary abstractions
- accidental feature creep

If an issue is found:
- propose the smallest safe fix
- preserve existing behavior
- do not change public API contracts unless required
- keep tests green
- commit as fix(slice-X): [short description]

---

## Prompt 6: Documentation Alignment

Review README.md, run.md, prompts.md, and implementation-plan.md against the actual code.

Ensure:
- no completed feature is marked as missing
- no nonexistent feature is documented as implemented
- setup commands match package.json
- Docker/PostgreSQL requirements are clear
- build/runtime/test expectations are accurate
- AI usage is documented honestly
- known tradeoffs are stated clearly

Return:
- documentation mismatches
- required edits
- final submission checklist