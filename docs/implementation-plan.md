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
Status: Completed

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

### Slice 3 — Authentication
Status: Completed

Goal:
Implement JWT-based authentication for IssueFlow while keeping the auth layer simple, testable, and aligned with the assignment contract.

Endpoints:
- POST /auth/login
- POST /auth/logout
- GET /auth/me

Scope:
- AuthModule
- AuthController
- AuthService
- LoginDto
- JwtAuthGuard
- JwtStrategy
- Current user extraction
- JWT signing and validation
- Basic logout strategy
- Auth tests

Business rules:
- login accepts username and password
- login returns accessToken, tokenType, expiresIn
- invalid credentials return UnauthorizedException
- password comparison uses bcrypt
- /auth/me returns the authenticated user profile
- protected endpoints require a valid Bearer token
- logout invalidates the current token or uses stateless expiry strategy

Validation:
LoginDto:
- username required
- password required
- both must be strings
- empty values rejected

Architecture:
Controller:
- thin controller only
- delegate login/logout/me logic to AuthService
- use guards only where needed

Service:
- validate user by username
- compare password with passwordHash
- sign JWT payload
- return safe user profile without passwordHash
- do not duplicate user mapping logic if reusable from Users module

JWT strategy:
- payload should include user id, username, role
- token expiration configured centrally
- secret should come from environment variable with safe local default

Logout strategy:
- keep simple for MVP
- either document stateless token expiry
- or implement an in-memory deny-list if simple enough
- avoid overengineering persistent token revocation in this slice

Testing strategy:
AuthService tests:
- login succeeds with valid credentials
- login returns accessToken, tokenType, expiresIn
- login rejects missing user
- login rejects invalid password
- returned user/token payload never exposes passwordHash

AuthController tests:
- delegates login to service
- delegates logout to service
- /auth/me returns current user profile

Guard/strategy tests:
- JwtStrategy validates payload
- invalid token is rejected where practical

Out of scope:
- refresh tokens
- password reset
- email verification
- OAuth
- MFA
- RBAC permissions beyond role in payload
- persistent sessions
- full user registration redesign
- protecting every endpoint before basic auth is stable

Validation checklist:
- npm run test
- npm run build
- npm run start:dev
- manual smoke:
  - POST /users creates user with password
  - POST /auth/login returns token
  - GET /auth/me with Bearer token returns user profile
  - GET /auth/me without token returns 401

Deliverables:
- AuthModule
- AuthController
- AuthService
- LoginDto
- JwtStrategy
- JwtAuthGuard
- Tests
- Working JWT login flow
- Safe profile responses without passwordHash

### Slice 4 — Projects
Status: Planned

Goal:
Implement project management with clean CRUD APIs, owner validation, JWT-protected routes, safe error handling, and test-first development.

Endpoints:
- POST /projects
- GET /projects
- GET /projects/:projectId
- POST /projects/update/:projectId
- DELETE /projects/:projectId

Scope:
- ProjectsController
- ProjectsService
- CreateProjectDto
- UpdateProjectDto
- Repository integration
- Owner user validation
- JwtAuthGuard on project routes
- Unit tests

Security:
- all project endpoints require JWT authentication
- use existing JwtAuthGuard from Slice 3
- do not add RBAC/admin-only rules yet

Business rules:
- project name is required
- description is optional
- ownerId is required on create
- ownerId must reference an existing user
- missing project returns NotFoundException
- missing owner returns NotFoundException
- update supports name and description only
- project responses should include ownerId
- deletion should remain compatible with future soft-delete support

Testing strategy:
DTO tests:
- valid create payload
- missing name fails
- missing ownerId fails
- invalid ownerId fails
- valid update payload
- empty name fails

ProjectsService tests:
- creates project when owner exists
- rejects create when owner does not exist
- findAll returns projects
- findOne returns project by id
- findOne missing project throws NotFoundException
- update name/description
- update missing project throws NotFoundException
- remove existing project
- remove missing project throws NotFoundException

ProjectsController tests:
- delegates create/findAll/findOne/update/remove to service
- uses ParseIntPipe for route params
- applies JwtAuthGuard to project routes

Architecture:
Controller:
- thin controller only
- protected by JwtAuthGuard
- delegate business logic to service

Service:
- repository-driven
- validate owner using UsersService or User repository
- keep project response simple
- do not implement tickets logic yet
- keep deletion logic compatible with future soft delete

Out of scope:
- Tickets
- Comments
- Audit log
- RBAC/admin-only permissions
- Soft-delete restore endpoints
- Project workload
- Auto assignment
- Application-wide global JWT guard

Validation checklist:
- npm run test
- npm run build
- npm run start:dev

Deliverables:
- ProjectsController
- ProjectsService
- DTOs
- Tests
- JWT-protected project routes
- Passing test suite

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