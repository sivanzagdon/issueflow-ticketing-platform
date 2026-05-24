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
Status: Completed

Goal:
Implement project management with clean CRUD APIs, owner validation, JWT-protected routes, safe error handling, and test-first development.

Endpoints:
- POST /projects
- GET /projects
- GET /projects/:projectId
- PATCH /projects/:projectId
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

### Slice 5 — Tickets
Status: Completed

Goal:
Implement JWT-protected ticket management with strong validation, relational integrity, lifecycle enforcement, optimistic locking support, and test-first development.

Endpoints:
- POST /tickets
- GET /tickets?projectId=...
- GET /tickets/:ticketId
- PATCH /tickets/:ticketId
- DELETE /tickets/:ticketId

Scope:
- TicketsController
- TicketsService
- CreateTicketDto
- UpdateTicketDto
- Repository integration
- Project validation
- Assignee validation
- JwtAuthGuard on ticket routes
- Optimistic locking support
- Unit tests

Security:
- all ticket endpoints require JWT authentication
- use existing JwtAuthGuard from Slice 3
- do not implement RBAC/admin-only rules yet

Business rules:
- title is required
- description is optional
- projectId is required
- projectId must reference an existing project
- assigneeId is optional
- assigneeId must reference an existing user when provided
- status must use TicketStatus enum
- priority must use TicketPriority enum
- type must use TicketType enum
- tickets start with TODO status by default
- status transitions are forward-only:
  - TODO → IN_PROGRESS
  - IN_PROGRESS → IN_REVIEW
  - IN_REVIEW → DONE
- backward transitions are rejected
- updates to DONE tickets are blocked
- missing ticket returns NotFoundException
- missing project returns NotFoundException
- invalid assignee returns NotFoundException
- DELETE uses soft delete
- ticket responses should expose version field for optimistic locking
- concurrent update conflicts should be detectable through VersionColumn support

Testing strategy:
DTO tests:
- valid create payload
- missing title fails validation
- missing projectId fails validation
- invalid priority fails validation
- invalid status fails validation
- invalid type fails validation
- valid partial update payload
- empty title fails validation

TicketsService tests:
- creates ticket when project exists
- rejects create when project missing
- rejects create when assignee missing
- findAll filters by projectId
- findOne returns ticket by id
- findOne missing ticket throws NotFoundException
- update title/description/status/priority/type
- rejects backward status transition
- rejects updates after DONE
- update missing ticket throws NotFoundException
- remove existing ticket using soft delete
- remove missing ticket throws NotFoundException

TicketsController tests:
- delegates create/findAll/findOne/update/remove to service
- uses ParseIntPipe for route params
- applies JwtAuthGuard to ticket routes

Architecture:
Controller:
- thin controller only
- protected by JwtAuthGuard
- delegate business logic to service

Service:
- repository-driven
- validate project existence
- validate assignee existence
- centralize lifecycle transition validation
- keep ticket responses simple
- preserve optimistic locking compatibility
- keep deletion logic compatible with future restore support

Out of scope:
- Comments API
- Audit log
- Ticket restore endpoints
- Ticket dependencies
- Attachments
- CSV import/export
- Mentions
- Auto assignment
- Escalation jobs
- Background schedulers
- RBAC/admin-only permissions

Validation checklist:
- npm run test
- npm run build
- npm run start:dev
- manual smoke:
  - create ticket
  - filter tickets by projectId
  - valid status progression
  - invalid backward transition rejected
  - DONE ticket update rejected
  - JWT protection verified

Deliverables:
- TicketsController
- TicketsService
- DTOs
- Tests
- JWT-protected ticket routes
- Forward-only lifecycle validation
- Soft delete support
- Passing test suite

### Slice 6 — Comments
Status: Completed

Goal:
Implement JWT-protected comment management for tickets with clean CRUD APIs, ticket validation, author validation, safe responses, and test-first development.

Endpoints:
- POST /tickets/:ticketId/comments
- GET /tickets/:ticketId/comments
- PATCH /tickets/:ticketId/comments/:commentId
- DELETE /tickets/:ticketId/comments/:commentId

Scope:
- CommentsController
- CommentsService
- CreateCommentDto
- UpdateCommentDto
- Repository integration
- Ticket validation
- Author validation
- JwtAuthGuard on comment routes
- Unit tests

Security:
- all comment endpoints require JWT authentication
- use existing JwtAuthGuard from Slice 3
- do not implement RBAC/admin-only rules yet
- do not restrict editing/deleting to author only in this slice unless required by README

Business rules:
- content is required
- content cannot be empty
- ticketId must reference an existing ticket
- authorId must reference an existing user
- missing comment returns NotFoundException
- missing ticket returns NotFoundException
- missing author returns NotFoundException
- comments are listed by ticketId
- update supports content only
- delete removes the comment
- comment responses should include id, ticketId, authorId, content, createdAt, updatedAt

Testing strategy:
DTO tests:
- valid create payload
- missing content fails validation
- empty content fails validation
- missing authorId fails validation
- invalid authorId fails validation
- valid update payload
- empty update content fails validation

CommentsService tests:
- creates comment when ticket and author exist
- rejects create when ticket does not exist
- rejects create when author does not exist
- findByTicket returns comments for ticket
- findByTicket rejects missing ticket
- update content
- update missing comment throws NotFoundException
- remove existing comment
- remove missing comment throws NotFoundException

CommentsController tests:
- delegates create/findByTicket/update/remove to service
- uses ParseIntPipe for ticketId and commentId route params
- applies JwtAuthGuard to comment routes

Architecture:
Controller:
- thin controller only
- protected by JwtAuthGuard
- delegate business logic to service

Service:
- repository-driven
- validate ticket existence
- validate author existence
- keep comment response simple
- do not implement audit logging yet

Out of scope:
- Audit log
- Mentions
- Notifications
- Attachments
- RBAC/admin-only permissions
- Author-only edit/delete permissions unless explicitly required
- Comment versioning
- Soft delete for comments unless README requires it

Validation checklist:
- npm run test
- npm run build
- npm run start:dev
- manual smoke:
  - create comment for ticket
  - list comments by ticket
  - update comment content
  - delete comment
  - JWT protection verified

Deliverables:
- CommentsController
- CommentsService
- DTOs
- Tests
- JWT-protected comment routes
- Passing test suite

### Slice 7 — Quality, Documentation, and Final Review
Status: Completed

Goal:
Finalize the project for submission by improving reliability, documentation, consistency, API contract alignment, and reviewer experience without adding unnecessary new features.

Scope:
- Final test verification
- E2E verification
- Build verification
- Lint / formatting review
- Documentation review
- API contract audit
- Error handling review
- Security review
- Repository cleanup
- Submission readiness checklist

Quality tasks:
- run all unit tests
- run all e2e tests
- run production build
- run lint if stable
- verify Nest app starts successfully
- verify Docker Compose database startup
- verify no broken imports
- verify no unused debug code
- verify no accidental console logs
- verify no commented-out dead code
- verify no unrelated generated files are committed

API contract audit:
- compare implemented endpoints against README
- verify HTTP methods and paths
- verify request DTOs
- verify response shapes
- verify status codes where documented
- verify protected routes require JWT
- verify public routes are intentionally public
- verify error responses use appropriate Nest exceptions

Security review:
- passwordHash is never exposed
- passwords are hashed with bcrypt
- JWT-protected routes are protected
- logout invalidation behavior is documented
- no secrets are committed
- .env is not committed
- no RBAC added unless explicitly required
- public registration behavior is documented

Documentation tasks:
- update docs/implementation-plan.md
- mark completed slices accurately
- update run.md with final setup and run instructions
- update prompts.md with final AI prompts/workflow if needed
- verify AI instruction files / skills are included
- document intentionally deferred features
- document known technical debt
- document testing commands and results

Repository cleanup:
- remove IDE-specific files if present
- remove generated build artifacts if present
- remove coverage artifacts if present
- ensure .gitignore covers:
  - node_modules
  - dist
  - coverage
  - .env
  - IDE files
- verify git status is clean before final submission

Final validation checklist:
- npm run test
- npm run test:e2e
- npm run build
- npm run start:dev
- git status
- manual smoke test for:
  - auth login
  - protected route without token returns 401
  - create project
  - create ticket
  - invalid ticket transition returns 400
  - stale ticket version returns 409
  - create/list/update/delete comment

Out of scope:
- new product features
- new business modules
- RBAC redesign
- Redis/session store
- refresh tokens
- notifications
- websocket support
- microservices
- deployment infrastructure
- large architectural refactors

Deliverables:
- Updated documentation
- Clean repository
- Passing unit tests
- Passing e2e tests
- Successful build
- Verified startup
- Final API contract summary
- Final technical debt summary
- Submission-ready GitHub repository

### Slice 8 — Audit Log
Status: Completed

Goal:
Implement a centralized append-only audit logging system for all state-changing actions across the platform.

Endpoints:
- GET /audit-logs
- GET /audit-logs?entityType=...
- GET /audit-logs?entityId=...
- GET /audit-logs?action=...
- GET /audit-logs?performedBy=...

Important:
- Do not expose POST /audit-logs.
- Audit logs are created internally by application services only.
- Audit logs are not user-created resources.

Scope:
- AuditLogService
- AuditLogController
- AuditLog repository integration
- Centralized audit logging
- Audit log filtering
- Ticket stateHistory projection
- Tests

Architecture:
- audit_logs is the single source of truth for system history.
- audit logs are append-only.
- audit logs are never updated or deleted.
- every state-changing service method should create an audit log entry.
- ticket stateHistory is a derived response projection from audit_logs.
- stateHistory is NOT stored on the Ticket entity itself.

AuditLog entity:
- id
- action
- entityType
- entityId
- performedBy nullable
- actorType (USER | SYSTEM)
- details (jsonb)
- createdAt

Business rules:
- all state-changing actions must create audit log entries.
- both user-triggered and system-triggered actions must be logged.
- SYSTEM actions use actorType = SYSTEM and performedBy = null.
- USER actions use actorType = USER and performedBy = current user id.
- audit log entries must preserve historical integrity.
- audit logs are immutable after creation.

Examples of logged actions:
- CREATE_USER
- UPDATE_USER
- DELETE_USER
- CREATE_PROJECT
- UPDATE_PROJECT
- DELETE_PROJECT
- RESTORE_PROJECT
- CREATE_TICKET
- UPDATE_TICKET
- UPDATE_TICKET_STATUS
- DELETE_TICKET
- RESTORE_TICKET
- CREATE_COMMENT
- UPDATE_COMMENT
- DELETE_COMMENT
- ADD_DEPENDENCY
- REMOVE_DEPENDENCY
- AUTO_ASSIGN
- AUTO_ESCALATE
- IMPORT_TICKETS

Details examples:
- CREATE_TICKET:
  details includes created fields such as title, status, priority, type, projectId, assigneeId.
- UPDATE_TICKET_STATUS:
  details includes from and to.
- UPDATE_TICKET:
  details includes only changed fields with before and after values.
- DELETE_TICKET:
  details includes deletedAt.
- AUTO_ASSIGN:
  details includes assignedTo and reason.
- AUTO_ESCALATE:
  details includes previousPriority, newPriority, dueDate, isOverdue.
- IMPORT_TICKETS:
  details includes created, failed, and errors count.

Filtering:
- GET /audit-logs returns all audit logs ordered newest first.
- entityType filter returns logs for a specific entity type.
- entityId filter returns logs for a specific entity id.
- action filter returns logs for a specific action.
- performedBy filter returns logs created by a specific user.
- filters may be combined.
- actorType is stored on each log and returned in responses; it is not a query filter.

Ticket stateHistory:
- GET /tickets/:ticketId should include stateHistory.
- stateHistory is built from audit_logs where entityType = TICKET and entityId = ticketId.
- stateHistory is ordered ascending by createdAt.
- stateHistory should not expose internal database-only fields that are not useful to API consumers.

Testing strategy:
AuditLogService tests:
- creates audit entry.
- preserves details payload.
- creates append-only records.
- supports filtering by entityType.
- supports filtering by entityId.
- supports filtering by action.
- supports filtering by performedBy.
- supports combined filters.

Integration tests:
- creating user creates audit log.
- updating user creates audit log.
- deleting user creates audit log.
- creating project creates audit log.
- updating project creates audit log.
- deleting project creates audit log.
- creating ticket creates audit log.
- updating ticket creates audit log.
- updating ticket status creates audit log with from/to.
- deleting ticket creates audit log.
- creating comment creates audit log.
- updating comment creates audit log.
- deleting comment creates audit log.

Ticket response tests:
- GET /tickets/:id returns derived stateHistory.
- stateHistory is ordered ascending by createdAt.
- stateHistory is derived from audit_logs and not stored directly on Ticket.

Out of scope:
- public POST /audit-logs endpoint
- updating audit logs
- deleting audit logs
- actorType as a GET query filter
- distributed event streaming
- Kafka/event bus
- websocket notifications
- external SIEM integrations

Validation checklist:
- npm run test — 249 passing
- npm run build — passing
- npm run test:e2e — 16 passing (PostgreSQL required; see run.md)
- E2E Jest config uses `maxWorkers: 1` in `test/jest-e2e.json` to avoid parallel TypeORM `synchronize` conflicts on a shared database
- manual smoke:
  - GET /audit-logs without JWT returns 401
  - POST /audit-logs returns 404
  - user/project/ticket/comment mutations create audit rows
  - GET /tickets/:id includes stateHistory (ASC by createdAt)
  - GET /audit-logs supports entityType, entityId, action, performedBy filters

Deliverables:
- AuditLogService (record, findAll, buildTicketStateHistory)
- AuditLogController (GET /audit-logs only)
- Audit logging wired into Users, Projects, Tickets, Comments services
- Ticket stateHistory projection on GET /tickets/:id
- Unit and e2e tests
- Passing test suite

### Slice 9 — Soft Delete + Restore Lifecycle
Status: Completed

Goal:
Implement production-style soft delete and restore flows for tickets and projects, while preserving standard API behavior, authorization rules, and Audit Log consistency.

Requirement source:
The assignment requires tickets and projects to support soft delete only, with deleted records hidden from standard API responses and recoverable by ADMIN users.

Scope:
- Ticket soft delete
- Ticket restore
- Project soft delete
- Project restore
- Deleted-only listing endpoints
- ADMIN-only access for deleted/restore endpoints
- DB-level deleted filtering
- Transactional restore lifecycle
- Audit Log integration for DELETE and RESTORE
- Unit and e2e tests

Endpoints:
- DELETE /tickets/:ticketId
- GET /tickets/deleted?projectId=...
- POST /tickets/:ticketId/restore
- DELETE /projects/:projectId
- GET /projects/deleted
- POST /projects/:projectId/restore

Business rules:
- tickets and projects are never hard-deleted through public APIs.
- soft-deleted records are hidden from standard GET endpoints.
- deleted endpoints return only soft-deleted records.
- restore is allowed only for soft-deleted records.
- restoring a missing record returns 404.
- restoring a non-deleted record fails clearly.
- deleted-list and restore endpoints are ADMIN-only.
- DELETE creates an Audit Log record.
- RESTORE creates an Audit Log record.
- failed delete/restore operations do not create Audit Log records.

Implementation approach:
- use TypeORM soft delete support with deletedAt / DeleteDateColumn.
- use withDeleted: true only for deleted-list and restore flows.
- use DB-level filtering with deletedAt: Not(IsNull()) for deleted endpoints.
- keep standard queries relying on TypeORM default behavior to hide deleted rows.
- keep lookup, validation, restore mutation, and audit write inside the same transaction.
- use centralized AuditLogService with the transaction manager.
- keep controllers thin and services responsible for domain behavior.

Audit Log behavior:
- successful soft delete writes AuditAction.DELETE.
- successful restore writes AuditAction.RESTORE.
- audit entries use entityType TICKET or PROJECT.
- audit writes are transactional with the domain mutation.
- audit logs remain append-only.

Testing strategy:
TDD first.

Service tests:
- ticket soft delete does not physically remove the ticket.
- deleted tickets are hidden from standard queries.
- deleted tickets are returned from deleted-only endpoint.
- ticket restore makes the ticket visible again.
- restoring a missing ticket fails.
- restoring a non-deleted ticket fails.
- project soft delete does not physically remove the project.
- deleted projects are hidden from standard queries.
- deleted projects are returned from deleted-only endpoint.
- project restore makes the project visible again.
- restoring a missing project fails.
- restoring a non-deleted project fails.
- delete and restore create Audit Log records.
- failed delete/restore operations do not create Audit Log records.
- deleted queries use DB-level filtering.
- restore lookup, mutation, and audit write stay inside one transaction.

E2E tests:
- DELETE /tickets/:ticketId soft deletes a ticket.
- GET /tickets/deleted?projectId=... returns deleted tickets.
- POST /tickets/:ticketId/restore restores a ticket.
- DELETE /projects/:projectId soft deletes a project.
- GET /projects/deleted returns deleted projects.
- POST /projects/:projectId/restore restores a project.
- deleted/restore routes require ADMIN access.
- Audit Log contains DELETE and RESTORE records for successful operations.

Architecture:
- keep controllers thin.
- keep soft delete / restore logic inside services.
- preserve existing AuditLogService usage.
- preserve current JWT and RolesGuard patterns.
- avoid hard delete through public APIs.
- avoid generic restore frameworks or unnecessary abstractions.

Skills followed:
- skills/engineering/tdd/SKILL.md
- skills/engineering/audit-log-design/SKILL.md
- skills/engineering/soft-delete-restore/SKILL.md
- skills/engineering/api-contract-alignment/SKILL.md
- skills/engineering/production-hardening/SKILL.md

Out of scope:
- ticket dependencies
- attachments
- import/export
- mentions
- auto assignment
- auto escalation
- project-level permission model beyond ADMIN-only restore/deleted access
- changing README contract
- hard delete endpoints

Validation checklist:
- npm run test
- npm run build
- npm run test:e2e if PostgreSQL is available
- manual smoke:
  - soft delete ticket
  - verify ticket is hidden from standard GET
  - verify ticket appears in deleted list
  - restore ticket
  - verify ticket appears again
  - soft delete project
  - verify project is hidden from standard GET
  - verify project appears in deleted list
  - restore project
  - verify project appears again
  - verify Audit Log contains DELETE and RESTORE records

Deliverables:
- Ticket soft delete behavior
- Ticket restore endpoint
- Ticket deleted-list endpoint
- Project soft delete behavior
- Project restore endpoint
- Project deleted-list endpoint
- ADMIN-only deleted/restore access
- Transaction-safe Audit Log integration
- DB-level deleted filtering
- Unit tests
- E2E tests
- Passing test suite

### Slice 10 — Optimistic Locking / Concurrent Edit Prevention
Status: Planned

Goal:
Prevent simultaneous ticket/comment updates from silently overwriting each other by adding optimistic locking and explicit conflict handling.

Requirement source:
The assignment requires that:
- a ticket cannot be updated simultaneously by two users
- a comment cannot be edited simultaneously by two users

Scope:
- Ticket update concurrency protection
- Comment update concurrency protection
- Version-based optimistic locking
- Conflict detection
- 409 Conflict responses
- Audit Log consistency during conflicts
- Unit and e2e tests

Endpoints:
- PATCH /tickets/:ticketId
- PATCH /tickets/:ticketId/comments/:commentId

Business rules:
- update requests must include the entity version that the client last read.
- update succeeds only when the submitted version matches the current persisted version.
- successful update increments the version.
- stale updates must fail with 409 Conflict.
- stale updates must not mutate the entity.
- stale updates must not create Audit Log records.
- update attempts against missing entities still return NotFoundException / 404.
- existing ticket lifecycle rules remain enforced:
  - no backward status transitions
  - no updates once ticket is DONE
- optimistic locking must not weaken existing validation or authorization behavior.

Implementation approach:
- use TypeORM VersionColumn or equivalent version field.
- expose version in ticket/comment responses.
- require version in update DTOs.
- perform update through a version-aware condition:
  - id matches
  - version matches
- map stale version conflicts to ConflictException / HTTP 409.
- keep implementation simple and explicit.
- avoid pessimistic locks, distributed locks, Redis locks, or queue-based locking.

Audit Log behavior:
- successful updates create normal UPDATE audit records.
- stale/conflicting updates do not create audit records.
- failed validation does not create audit records.
- audit logging remains inside the same transaction as the successful update.

Testing strategy:
TDD first.

Service tests:
- ticket update succeeds with correct version.
- ticket update increments version.
- ticket update with stale version fails with ConflictException.
- stale ticket update does not create Audit Log record.
- ticket lifecycle rules still apply together with version checks.
- comment update succeeds with correct version.
- comment update increments version.
- comment update with stale version fails with ConflictException.
- stale comment update does not create Audit Log record.

E2E tests:
- fetch ticket/comment with version.
- perform first update successfully.
- perform second update using stale version.
- verify second update returns 409.
- verify persisted entity was not overwritten.
- verify Audit Log contains only the successful update.

Architecture:
- keep controllers thin.
- keep concurrency logic centralized in services.
- preserve current transaction patterns.
- preserve existing AuditLogService usage.
- do not change endpoint paths.
- do not introduce new architecture patterns.

Skills to follow:
- skills/engineering/tdd/SKILL.md
- skills/engineering/api-contract-alignment/SKILL.md
- skills/engineering/production-hardening/SKILL.md
- skills/engineering/audit-log-design/SKILL.md

Out of scope:
- pessimistic locking
- distributed locks
- Redis-based locks
- websocket collaboration
- merge conflict resolution UI
- locking create/delete operations
- project optimistic locking unless explicitly added later
- changing README unless needed to document version behavior consistently

Validation checklist:
- npm run test
- npm run build
- npm run test:e2e if PostgreSQL is available
- manual smoke:
  - get ticket includes version
  - update ticket with correct version succeeds
  - update ticket with stale version returns 409
  - get comment includes version
  - update comment with correct version succeeds
  - update comment with stale version returns 409
  - Audit Log is created only for successful updates

Deliverables:
- version support for Ticket and Comment updates
- update DTO version validation
- ConflictException mapping for stale updates
- transaction-safe Audit Log integration
- unit tests
- e2e tests
- passing test suite