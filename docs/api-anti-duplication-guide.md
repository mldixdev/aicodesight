# AI-Friendly Architecture Guide for APIs: Eliminating Duplicate Code

> **Version:** 1.0 — Iterative base document
> **Focus:** API Backend (REST, GraphQL, or hybrid)
> **Goal:** Practices, conventions, and configuration so that Claude Code generates API code without duplication or redundancy.

---

## Table of Contents

1. [The Problem in APIs](#1-the-problem-in-apis)
2. [AI-Friendly Architecture Principles for APIs](#2-principles)
3. [Recommended Folder Structure](#3-structure)
4. [Naming Conventions](#4-naming)
5. [CLAUDE.md Configuration for APIs](#5-claudemd)
6. [Working Practices](#6-practices)
7. [Progressive Refactoring Guide](#7-refactoring)
8. [Quick Checklist](#8-checklist)

---

## 1. The Problem in APIs {#1-the-problem-in-apis}

### 1.1 Root causes (API-specific)

The general causes of AI-driven duplication apply to any project, but in APIs they manifest in specific ways:

#### A. Business logic repeated across endpoints

Different endpoints (create user, update user, validate user) implement similar but not identical logic. The AI tends to rewrite validations, transformations, and rules in each endpoint instead of centralizing them.

**Impact:** Multiple versions of the same validation or transformation scattered across routes.

#### B. Inconsistent response patterns

Without a centralized HTTP response helper, each endpoint builds its own response structure. The AI generates `res.status(200).json({ data, message })` with variations in each file.

**Impact:** Responses with different structures, making frontend consumption difficult.

#### C. Duplicated middleware across routes

Authentication, authorization, logging, error handling — each route group implements its own version if centralized middleware doesn't exist.

**Impact:** Inconsistent behavior across endpoints of the same system.

#### D. Parallel DTOs and validations

In APIs with TypeScript, it's common for the AI to create nearly identical types/interfaces: one for the request, another for the response, another internal — without reusing common fields.

**Impact:** Duplicate types that silently diverge over time.

#### E. Repeated queries and data access

Similar database queries in different services. `findUserByEmail` appears in auth, in users, in notifications — each with its own implementation.

**Impact:** Scattered data access logic, difficult to optimize and maintain.

### 1.2 The vicious cycle in APIs

```
More endpoints with duplicated logic
    → Larger and harder-to-navigate API
        → More context consumption per session
            → Less visibility of existing code
                → More duplication in new endpoints
```

---

## 2. AI-Friendly Architecture Principles for APIs {#2-principles}

The 6 base principles are adapted to the API context:

### Principle 1: One file, one operation

In APIs, "one responsibility" translates to: one file per business operation.

```
❌ userController.ts    → 500 lines with create, update, delete, list, getById
✅ createUser.service.ts → 40 lines, only creates users
✅ updateUser.service.ts → 35 lines, only updates users
✅ getUserById.query.ts  → 25 lines, only queries a single user
```

### Principle 2: Clear layer separation

APIs need well-defined layers to prevent the AI from mixing responsibilities:

```
Route (route)      → Defines the endpoint and middleware
Controller         → Receives request, delegates to service, returns response
Service            → Pure business logic
Query              → Data access / queries
Validation         → Input validation schemas
Types/DTOs         → Interfaces and data types
```

### Principle 3: Shared modules for cross-cutting patterns

In APIs, certain patterns repeat across ALL endpoints:

```
shared/
  http/
    responseHelper.ts    → Standard response format
    errorHandler.ts      → Centralized error handling
    asyncWrapper.ts      → Wrapper for async/await in Express
  validation/
    commonSchemas.ts     → Reusable schemas (email, phone, pagination)
  database/
    pagination.ts        → Standard pagination logic
    queryBuilder.ts      → Common query builder
  middleware/
    authMiddleware.ts    → Authentication
    roleMiddleware.ts    → Role-based authorization
```

### Principle 4: Centralized types per domain

Each domain defines its types in ONE single file. Types shared between domains go in shared.

```
features/users/user.types.ts      → UserCreate, UserUpdate, UserResponse
features/payments/payment.types.ts → PaymentCreate, PaymentResponse
shared/types/pagination.types.ts   → PaginatedRequest, PaginatedResponse
shared/types/common.types.ts       → ApiResponse<T>, ErrorResponse
```

### Principle 5: Barrel files as module contract

In APIs, the barrel file of each feature acts as a contract: it exposes which operations are available.

```typescript
// src/features/users/index.ts
// User management module
export { createUser } from './createUser.service';
export { updateUser } from './updateUser.service';
export { deleteUser } from './deleteUser.service';
export { getUserById, listUsers } from './user.queries';
export { userCreateSchema, userUpdateSchema } from './user.validation';
export type { UserCreate, UserUpdate, UserResponse } from './user.types';
```

### Principle 6: Composition over duplication

When two endpoints share partial logic, extract the common part into a shared service or utility — don't copy and modify.

```
❌ createUser.service.ts duplicates email validation that already exists in auth
✅ shared/validation/validateEmail.ts is used by both modules
```

---

## 3. Recommended Folder Structure {#3-structure}

### 3.1 Template for API Backend

```
api-project/
├── CLAUDE.md                              ← Instructions for the AI
├── src/
│   ├── app.ts                             ← Application configuration
│   ├── server.ts                          ← Server entry point
│   │
│   ├── features/                          ← Business domains
│   │   ├── auth/
│   │   │   ├── login.service.ts           ← Login logic
│   │   │   ├── register.service.ts        ← Registration logic
│   │   │   ├── refreshToken.service.ts    ← Token renewal
│   │   │   ├── auth.validation.ts         ← Validation schemas
│   │   │   ├── auth.types.ts              ← Auth types/DTOs
│   │   │   ├── auth.constants.ts          ← Constants (expiration, etc.)
│   │   │   ├── auth.routes.ts             ← Route definitions
│   │   │   ├── auth.controller.ts         ← HTTP controller
│   │   │   └── index.ts                   ← Barrel file
│   │   │
│   │   ├── users/
│   │   │   ├── createUser.service.ts      ← Create user
│   │   │   ├── updateUser.service.ts      ← Update user
│   │   │   ├── deleteUser.service.ts      ← Delete user
│   │   │   ├── user.queries.ts            ← Database queries
│   │   │   ├── user.validation.ts         ← Validation schemas
│   │   │   ├── user.types.ts              ← Types/DTOs
│   │   │   ├── user.routes.ts             ← Routes
│   │   │   ├── user.controller.ts         ← HTTP controller
│   │   │   └── index.ts
│   │   │
│   │   └── payments/
│   │       ├── processPayment.service.ts
│   │       ├── refundPayment.service.ts
│   │       ├── payment.queries.ts
│   │       ├── payment.validation.ts
│   │       ├── payment.types.ts
│   │       ├── payment.routes.ts
│   │       ├── payment.controller.ts
│   │       ├── payment.webhook.ts         ← Webhook handler
│   │       └── index.ts
│   │
│   ├── shared/                            ← Reusable code
│   │   ├── http/
│   │   │   ├── responseHelper.ts          ← Standard response format
│   │   │   ├── errorHandler.ts            ← Centralized error handling
│   │   │   ├── asyncWrapper.ts            ← Try/catch wrapper for controllers
│   │   │   ├── httpErrors.ts              ← HTTP error classes
│   │   │   └── index.ts
│   │   │
│   │   ├── validation/
│   │   │   ├── validateEmail.ts           ← Email validation
│   │   │   ├── validatePhone.ts           ← Phone validation
│   │   │   ├── validatePagination.ts      ← Pagination params
│   │   │   ├── commonSchemas.ts           ← Reusable schemas
│   │   │   └── index.ts
│   │   │
│   │   ├── database/
│   │   │   ├── connection.ts              ← Database connection
│   │   │   ├── pagination.ts              ← Pagination logic
│   │   │   ├── queryHelpers.ts            ← Query helpers
│   │   │   ├── transaction.ts             ← Transaction handling
│   │   │   └── index.ts
│   │   │
│   │   ├── auth/
│   │   │   ├── tokenService.ts            ← Generate/verify JWT
│   │   │   ├── hashPassword.ts            ← Password hashing
│   │   │   └── index.ts
│   │   │
│   │   └── types/
│   │       ├── common.types.ts            ← ApiResponse<T>, ErrorResponse
│   │       ├── pagination.types.ts        ← PaginatedRequest, PaginatedResponse
│   │       └── index.ts
│   │
│   ├── middleware/
│   │   ├── authMiddleware.ts              ← Verify authentication
│   │   ├── roleMiddleware.ts              ← Verify authorization
│   │   ├── validationMiddleware.ts        ← Validate body/params/query
│   │   ├── rateLimitMiddleware.ts         ← Rate limiting
│   │   ├── loggingMiddleware.ts           ← Request logging
│   │   ├── errorMiddleware.ts             ← Global error handler
│   │   └── index.ts
│   │
│   ├── config/
│   │   ├── database.ts                    ← Database config
│   │   ├── environment.ts                 ← Environment variables
│   │   ├── cors.ts                        ← CORS config
│   │   ├── rateLimits.ts                  ← Rate limiting config
│   │   └── index.ts
│   │
│   └── routes/
│       └── index.ts                       ← Main router (registers all routes)
│
├── tests/
│   ├── features/
│   │   ├── auth/
│   │   │   ├── login.service.test.ts
│   │   │   └── register.service.test.ts
│   │   └── users/
│   │       ├── createUser.service.test.ts
│   │       └── user.queries.test.ts
│   ├── shared/
│   │   └── http/
│   │       └── responseHelper.test.ts
│   └── integration/
│       ├── auth.integration.test.ts
│       └── users.integration.test.ts
│
├── database/
│   ├── migrations/                        ← Database migrations
│   └── seeds/                             ← Seed data
│
└── docs/
    └── api.md                             ← Endpoint documentation
```

### 3.2 Adaptation for GraphQL

If the project uses GraphQL, the feature structure adapts:

```
features/
  users/
    user.resolver.ts          ← Instead of controller + routes
    user.schema.ts            ← GraphQL schema definition
    createUser.service.ts     ← Business logic does NOT change
    user.queries.ts           ← Data access does NOT change
    user.validation.ts
    user.types.ts
    index.ts
```

The key: **business logic and data access remain the same**. Only the transport layer changes (REST routes/controllers → GraphQL resolvers/schemas).

### 3.3 Location rule for APIs

| Where does it go? | Criteria |
|---|---|
| `features/[domain]/` | Logic specific to a business domain |
| `shared/http/` | Request/response helpers used by all endpoints |
| `shared/validation/` | Common validations (email, phone, pagination) |
| `shared/database/` | Database helpers used by multiple domains |
| `shared/auth/` | Authentication utilities (tokens, hashing) |
| `shared/types/` | Generic types (ApiResponse, PaginatedResponse) |
| `middleware/` | Cross-cutting HTTP middleware |
| `config/` | Centralized configuration |

---

## 4. Naming Conventions {#4-naming}

### 4.1 API files

| File type | Pattern | Example |
|---|---|---|
| Write service | `verbNoun.service.ts` | `createUser.service.ts` |
| Read service | `verbNoun.query.ts` | `getUserById.query.ts` |
| Grouped queries | `domain.queries.ts` | `user.queries.ts` |
| HTTP controller | `domain.controller.ts` | `user.controller.ts` |
| Routes/endpoints | `domain.routes.ts` | `user.routes.ts` |
| GraphQL resolver | `domain.resolver.ts` | `user.resolver.ts` |
| GraphQL schema | `domain.schema.ts` | `user.schema.ts` |
| Validations | `domain.validation.ts` | `user.validation.ts` |
| Types/DTOs | `domain.types.ts` | `payment.types.ts` |
| Constants | `domain.constants.ts` | `auth.constants.ts` |
| Webhook handler | `domain.webhook.ts` | `payment.webhook.ts` |
| Middleware | `nameMiddleware.ts` | `authMiddleware.ts` |
| Shared helper | `verbNoun.ts` | `formatCurrency.ts` |
| Unit test | `*.test.ts` | `createUser.service.test.ts` |
| Integration test | `*.integration.test.ts` | `auth.integration.test.ts` |
| Barrel/index | `index.ts` | `index.ts` |

### 4.2 API-specific functions

| Element | Pattern | Example |
|---|---|---|
| Handler/Controller | `verbNounHandler` | `createUserHandler()` |
| Business service | `verbNoun` | `createUser()`, `processPayment()` |
| Database query | `get/find/list + Noun` | `getUserById()`, `listActiveUsers()` |
| Validation schema | `domainVerbSchema` | `userCreateSchema`, `userUpdateSchema` |
| Middleware | `verb + Noun` | `requireAuth()`, `validateBody()` |
| HTTP error | `NameError` | `NotFoundError`, `UnauthorizedError` |
| Request type | `NounVerbRequest` | `UserCreateRequest` |
| Response type | `NounResponse` | `UserResponse`, `PaginatedResponse<T>` |

### 4.3 Endpoints and routes

| Operation | Method | Route | Handler |
|---|---|---|---|
| Create resource | POST | `/api/v1/users` | `createUserHandler` |
| List resources | GET | `/api/v1/users` | `listUsersHandler` |
| Get by ID | GET | `/api/v1/users/:id` | `getUserByIdHandler` |
| Update | PUT/PATCH | `/api/v1/users/:id` | `updateUserHandler` |
| Delete | DELETE | `/api/v1/users/:id` | `deleteUserHandler` |

---

## 5. CLAUDE.md Configuration for APIs {#5-claudemd}

### 5.1 API-specific template

```markdown
# Project Directives — API Backend

## Anti-duplication rule (MANDATORY)
Before creating ANY new function, service, validation, type, or middleware:

1. SEARCH in shared/ if something similar already exists:
   - Read shared/http/index.ts for response and error helpers
   - Read shared/validation/index.ts for reusable schemas
   - Read shared/database/index.ts for query helpers
   - Read shared/types/index.ts for generic types
2. SEARCH in the current feature if related functionality already exists:
   - Read the index.ts of the feature where you're working
3. Use Grep to search for functions with similar names across the entire project
4. ONLY if nothing reusable exists, create new code
5. If you find duplicate code while working, INFORM the user

## API Architecture

### System layers
1. Routes → Define endpoints and assign middleware
2. Controller → Receives request, calls service, returns response
3. Service → Pure business logic (no HTTP dependency)
4. Queries → Database access
5. Validation → Input validation schemas
6. Types/DTOs → Interfaces and types

### Layer rules
- Controllers NEVER contain business logic
- Services NEVER access req/res directly
- Queries NEVER contain business logic
- Validations are defined ONCE per operation

### Folder structure
- src/features/ → Code by business domain
- src/shared/ → Cross-domain reusable code
- src/middleware/ → Cross-cutting HTTP middleware
- src/config/ → Centralized configuration
- src/routes/ → Main router
- tests/ → Tests mirroring src/ structure

### File conventions
- Maximum ~150 lines per file
- One file = one business operation
- Each feature has: service(s), queries, validation, types, controller, routes, index.ts

### Naming conventions
- Services: verbNoun.service.ts (e.g., createUser.service.ts)
- Queries: domain.queries.ts or verbNoun.query.ts
- Controllers: domain.controller.ts
- Routes: domain.routes.ts
- Validations: domain.validation.ts
- Types: domain.types.ts
- Middleware: nameMiddleware.ts

### HTTP Responses
- ALWAYS use shared/http/responseHelper.ts to format responses
- ALWAYS use shared/http/httpErrors.ts for errors
- Standard format: { success: boolean, data?: T, error?: { code, message } }

### Imports
- ALWAYS import from the barrel (index.ts)
- ✅ import { createUser } from '@/features/users'
- ❌ import { createUser } from '@/features/users/createUser.service'

## Available shared modules (shared/)
[ADAPT — List as they are created]

## Technology stack
[ADAPT]
```

---

## 6. Working Practices {#6-practices}

### 6.1 When starting a new API

1. Create the base structure with `features/`, `shared/`, `middleware/`, `config/`
2. Implement shared modules FIRST:
   - `shared/http/responseHelper.ts` — Standard response format
   - `shared/http/errorHandler.ts` — Centralized error handling
   - `shared/http/httpErrors.ts` — HTTP error classes
   - `shared/types/common.types.ts` — ApiResponse<T>, ErrorResponse
3. Configure CLAUDE.md with the template from Section 5
4. Create barrel files in each folder

### 6.2 When adding a new endpoint

Instruct the model:
```
"Add POST /api/v1/payments endpoint for processing payments.
Follow the architecture: route → controller → service → query.
Use shared/http/responseHelper for responses.
Use shared/http/httpErrors for errors.
Validation goes in payment.validation.ts."
```

### 6.3 Signs of duplication in APIs

Watch for:
- Multiple files with `try/catch` that format errors differently
- Different JSON response structures between endpoints
- Email/phone validations reimplemented per domain
- Similar queries in different features (findByEmail in auth and users)
- Authentication middleware copied in each route group

### 6.4 Periodic review for APIs

```
"Analyze the API and detect:
1. Duplicate data access functions between features
2. Repeated validations that should be in shared/validation/
3. Endpoints that don't use shared/http/responseHelper
4. Duplicate middleware between routes
5. Nearly identical types/DTOs in different features
List findings with file paths."
```

---

## 7. Progressive Refactoring Guide {#7-refactoring}

### For existing APIs

| Phase | Action | Priority |
|---|---|---|
| 1 | Configure CLAUDE.md with API directives | Immediate |
| 2 | Create `shared/http/` with responseHelper and errorHandler | High |
| 3 | Create `shared/types/` with ApiResponse and ErrorResponse | High |
| 4 | New endpoints follow the layered architecture | From now on |
| 5 | When touching an existing endpoint, refactor to the new structure | Gradual |
| 6 | Move common validations to `shared/validation/` | Gradual |
| 7 | Consolidate duplicate queries between features | When detected |

### Refactoring priority in APIs

1. **HTTP Responses** — Unify first, highest visual impact
2. **Error handling** — Centralize, drastically reduces repetitive code
3. **Validations** — Move common ones to shared, reduces inconsistency bugs
4. **Queries** — Consolidate data access, improves maintainability
5. **Types/DTOs** — Unify, prevents silent divergence

---

## 8. Quick Checklist {#8-checklist}

### When creating a new API
- [ ] Create structure with features/, shared/, middleware/, config/
- [ ] Implement shared/http/ (responseHelper, errorHandler, httpErrors)
- [ ] Implement shared/types/ (ApiResponse, ErrorResponse)
- [ ] Configure CLAUDE.md with API template
- [ ] Create barrel files in each folder

### When adding an endpoint
- [ ] Create in the correct feature with the structure: route → controller → service
- [ ] Use shared/http/responseHelper for ALL responses
- [ ] Use shared/http/httpErrors for ALL errors
- [ ] Validation in domain.validation.ts (reusing schemas from shared/ if applicable)
- [ ] Types in domain.types.ts (reusing types from shared/types/ if applicable)
- [ ] Update barrel file (index.ts)
- [ ] Update CLAUDE.md if something new was created in shared/

### When ending a session
- [ ] Verify that all endpoints use responseHelper
- [ ] Update shared modules in CLAUDE.md

### Periodic review
- [ ] Search for duplicate queries between features
- [ ] Search for validations that should be in shared/
- [ ] Verify HTTP response consistency
- [ ] Identify duplicate middleware

---

> **Note:** This document is version 1.0 for APIs. It complements the generic AI-friendly architecture guide. It is designed to improve iteratively with real API development experience.
