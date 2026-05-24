# AI Review Process

## Concern

How generated code is validated before it merges into a slice commit.

## Review checklist

### Contract

- [ ] Paths and methods match README
- [ ] Response fields go through mappers
- [ ] Status codes explicit where Nest defaults differ

### Architecture

- [ ] Logic in service, not controller
- [ ] DTO validation on inputs
- [ ] Domain module boundaries respected (no circular hacks)

### Data integrity

- [ ] Mutations + audit in one transaction when required
- [ ] Soft delete uses `softDelete`/`restore`, not `delete()`
- [ ] Optimistic locking honored on ticket update

### Security

- [ ] New routes have `JwtAuthGuard` unless `@Public()`
- [ ] ADMIN-only recovery routes have `RolesGuard`

### Tests

- [ ] Failing test preceded implementation (when doing TDD)
- [ ] No fake tests asserting `true === true`
- [ ] Contract spec updated if routes added

## Human review focus

AI is weak at: subtle transaction ordering, guard execution order, TypeORM `withDeleted` semantics, e2e DB flakiness. Human pass should read service methods end-to-end, not only diffs.

## Accountability

`docs/ai-workflow.md`: author remains responsible for submitted work. Skills and rules reduce risk; they do not replace understanding.

## References

- `docs/ai-workflow.md`
- `.cursor/rules/testing-and-quality.mdc`
- `skills/engineering/tdd/regression-prevention.md`
