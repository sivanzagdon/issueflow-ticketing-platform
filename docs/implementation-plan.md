# Implementation Plan

## Goal

Build a RESTful backend API for IssueFlow, a lightweight project and ticket management platform.

## Core MVP

1. Project setup and database connection
2. User management
3. JWT authentication
4. Project management
5. Ticket management
6. Comment management
7. Validation and error handling
8. Tests for core behavior
9. Documentation

## Vertical Slices

### Slice 1: Foundation
- Validate project startup
- Configure database
- Define core entities and enums

### Slice 2: Users
- Create user
- Get user by id
- Get all users
- Update user
- Delete user

### Slice 3: Auth
- Login
- JWT generation
- Auth guard
- Logout strategy
- Current user endpoint

### Slice 4: Projects
- Project CRUD
- Owner validation

### Slice 5: Tickets
- Ticket CRUD
- Project relationship
- Assignee relationship
- Status, priority, and type validation
- Forward-only lifecycle transition
- Block update after DONE

### Slice 6: Comments
- Add comment
- List comments by ticket
- Update comment
- Delete comment

### Slice 7: Quality
- Tests
- Error handling review
- Build/lint verification
- run.md
- prompts.md

## Extended Features Priority

If time allows:
1. Audit log
2. Soft delete
3. Mentions
4. Auto assignment
5. Ticket dependencies
6. CSV import/export
7. Attachments
8. Auto escalation