# AI Prompts

## Model Used

GPT-5.5 Thinking and Cursor AI agent.

## Prompt 1: Planning

You are a senior backend engineer.

Build a NestJS backend API based on the IssueFlow assignment.

Do not write code yet.

First:
- Identify the real product goal.
- Clarify assumptions.
- Reduce scope into the smallest strong backend MVP.
- Use the README.md API table as the implementation contract.
- Respect the assignment requirements.
- Create a concise implementation plan.

Focus on:
- Core architecture
- Database model
- API boundaries
- Auth/JWT flow
- Validation strategy
- Ticket lifecycle rules
- Concurrency approach
- Testing priorities
- Small vertical slices
- Fastest safe implementation order

Important:
- Prefer one polished end-to-end flow over unfinished features.
- Keep the app runnable after every step.
- Avoid overengineering.
- Keep modules and files small.
- Prioritize clean APIs, validation, auth boundaries, business rules, and tests.

Return only:
- MVP scope
- Vertical slices
- Implementation order
- Main architecture decisions

## Prompt 2: Implementation Slice

You are now in implementation mode.

Current slice:
[DESCRIBE CURRENT SLICE]

Execution requirements:
- Implement only the current slice.
- Do not rewrite unrelated code.
- Keep the app runnable after changes.
- Preserve existing architecture decisions.
- Use clear naming.
- Keep controllers thin.
- Put business logic in services.
- Use DTO validation.
- Handle realistic edge cases.
- Avoid overengineering.
- Prefer the smallest correct implementation first.

Before coding:
- Briefly explain the approach.
- State which files will change.

After coding:
- Self-review the implementation.
- Check for bugs or missing edge cases.
- Suggest the next smallest vertical slice.

## Prompt 3: Code Review

Review the current implementation as a senior backend engineer.

Check:
- API contract alignment
- NestJS architecture
- DTO validation
- Auth boundaries
- Database consistency
- Ticket lifecycle rules
- Concurrency safety
- Error handling
- Test coverage
- Overengineering
- Unnecessary abstractions
- Missing edge cases

Return:
- Critical issues
- Important improvements
- Nice-to-have improvements
- Suggested next action