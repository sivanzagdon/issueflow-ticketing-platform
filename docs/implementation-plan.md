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

### Slice 1 — Foundation Infrastructure
Status: Completed

Goal:
Establish the backend foundation before implementing business APIs.

Scope:
- Configure PostgreSQL connection
- Configure TypeORM
- Add global validation
- Define core enums
- Define core entities
- Establish entity relationships
- Keep application runnable

Entities:
- User
- Project
- Ticket
- Comment
- AuditLog

Out of scope:
- CRUD APIs
- Authentication
- Authorization
- Business rules
- Background jobs
- CSV import/export

Implemented:
- Project opened and verified locally
- Dependencies installed
- PostgreSQL container started through Docker Compose
- NestJS app started successfully in watch mode

Validation:
- npm install completed successfully
- docker compose up -d completed successfully
- npm run start:dev completed successfully with 0 compile errors

### Slice 2 — Users

Goal:
Implement production-quality user management with strong validation, clean API contracts, secure password handling, and comprehensive automated tests.

Endpoints:
- POST /users
- GET /users
- GET /users/:userId
- POST /users/update/:userId
- DELETE /users/:userId

Scope:
- UsersController
- UsersService
- CreateUserDto
- UpdateUserDto
- Repository integration
- ValidationPipe integration
- Password hashing
- Exception mapping
- Unit tests

Business rules:
- username must be unique
- email must be unique
- passwordHash must never be exposed in API responses
- password must be hashed before persistence
- invalid DTO payloads must fail validation
- update supports partial updates
- deleting a missing user returns NotFoundException
- fetching a missing user returns NotFoundException

Validation:
CreateUserDto:
- username required
- email valid
- fullName required
- role must be valid enum
- password minimum length 8

UpdateUserDto:
- all fields optional
- role enum validation
- no empty fullName

Architecture:
Controller:
- thin controller only
- delegate business logic to service
- ParseIntPipe for route params

Service:
- repository-driven
- map entities to safe response objects
- central passwordHash stripping helper
- map postgres unique violation (23505) to ConflictException
- throw NotFoundException when entity missing

Testing strategy:
DTO tests:
- valid payload
- invalid email
- invalid role
- missing required fields
- short password

UsersController tests:
- verify delegation to service
- verify route contracts
- verify passwordHash never exposed

UsersService tests:
- create hashes password
- create omits passwordHash
- duplicate username throws ConflictException
- duplicate email throws ConflictException
- findAll omits passwordHash
- findOne omits passwordHash
- findOne missing user throws NotFoundException
- update user fields
- update missing user throws NotFoundException
- remove existing user
- remove missing user throws NotFoundException

Out of scope:
- JWT auth
- Guards
- RBAC
- Refresh tokens
- Current user context
- Audit logging integration
- Email verification
- Password reset

Validation checklist:
- npm run build
- npm run test
- all users tests passing
- no compile errors
- Nest app starts successfully

Deliverables:
- UsersController
- UsersService
- DTOs
- Tests
- Clean API responses
- Passing test suite

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