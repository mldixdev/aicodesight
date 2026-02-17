# Complementary Strategies: Anti-Duplication + Context Optimization

> **Version:** 1.0 — Analysis document
> **Objective:** Identify additional strategies beyond those already documented for the two main goals:
> 1. Eliminate duplication in AI-generated code
> 2. Optimize the AI's context window usage
>
> **Relationship with existing documents:** Complements `guia-anti-duplicacion-ia.md` and `guia-anti-duplicacion-api.md`. The strategies described here are NOT covered (or are only partially covered) in those documents.

---

## Table of Contents

1. [Axis 1: Reduce duplication (beyond what's documented)](#axis-1-reduce-duplication)
   - [A. Schema-first / Generative Single Source of Truth](#a-schema-first--generative-single-source-of-truth)
   - [B. Linting and automated detection](#b-linting-and-automated-detection)
   - [C. Scaffolding / Code templates](#c-scaffolding--code-templates)
   - [D. Dependency Injection / Explicit composition](#d-dependency-injection--explicit-composition)
2. [Axis 2: Optimize context window (beyond what's documented)](#axis-2-optimize-context-window)
   - [E. `.claudeignore` / File filtering](#e-claudeignore--file-filtering)
   - [F. Tiered documentation (layers of detail)](#f-tiered-documentation-layers-of-detail)
   - [G. Barrel files as enriched semantic indexes](#g-barrel-files-as-enriched-semantic-indexes)
   - [H. Type-driven development](#h-type-driven-development)
   - [I. Compact dependency map](#i-compact-dependency-map)
3. [Axis 3: Strategies that target both goals](#axis-3-strategies-that-target-both-goals)
   - [J. Stricter conventions](#j-stricter-conventions)
   - [K. Prompt engineering in CLAUDE.md](#k-prompt-engineering-in-claudemd)
4. [Summary matrix](#summary-matrix)
5. [Next steps](#next-steps)

---

## Axis 1: Reduce duplication

Strategies that tackle code duplication from angles not covered by the current guides.

### A. Schema-first / Generative Single Source of Truth

**Concept:** Instead of the AI manually writing types, validations, and routes (even if in separate files), a **single schema** is defined from which everything is generated automatically.

**Concrete implementations:**

| Tool | Schema | Generates |
|---|---|---|
| OpenAPI / Swagger | YAML/JSON spec | TypeScript types, Zod/Joi validation, HTTP client, Express routes |
| Prisma | `schema.prisma` | DB types, base queries, DTOs |
| GraphQL Codegen | `.graphql` schema | Types, typed resolvers, frontend hooks |
| tRPC | Router definition | End-to-end types, typed client |
| Zod → OpenAPI | Zod schemas | OpenAPI spec, documentation, types |

**Example schema-first flow with OpenAPI:**

```
openapi.yaml (single source of truth)
    ├── generates → types/api.generated.ts (request/response types)
    ├── generates → validation/api.schemas.ts (validation schemas)
    ├── generates → frontend/apiClient.generated.ts (typed HTTP client)
    └── generates → docs/api.html (documentation)
```

**Example schema-first flow with Prisma:**

```
prisma/schema.prisma (single source of truth)
    ├── generates → @prisma/client (types + queries)
    ├── generates → types/db.generated.ts (DB types)
    └── supplements → common/types/user.types.ts (manually derived DTOs)
```

**Example schema-first flow with Zod:**

```typescript
// common/schemas/user.schema.ts — SINGLE SOURCE
import { z } from 'zod';

export const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  role: z.enum(['admin', 'user', 'viewer']),
});

// TYPES are derived from the schema, not written separately
export type UserCreate = z.infer<typeof userCreateSchema>;

// VALIDATION is the schema itself — there's no separate .validation.ts file
// Backend uses it with middleware: validateBody(userCreateSchema)
// Frontend uses it with react-hook-form: zodResolver(userCreateSchema)
```

**Impact on duplication:**
- Eliminates entire categories of duplication: front/back types, parallel validations, divergent DTOs
- A change in the schema propagates automatically to all derivatives
- The AI cannot create a `UserResponse` type in the frontend that already exists generated from the schema

**Impact on context:**
- The AI doesn't need to read 5 derived files — it reads the schema and knows what exists
- Generated files can be excluded from context (the AI works with the schema, not the output)

**Considerations:**
- Requires initial setup of the generation pipeline
- May be excessive for small projects
- The AI must know that `.generated.ts` files are NOT to be edited manually

---

### B. Linting and automated detection

**Concept:** Use static analysis tools to detect duplication automatically, without consuming AI context. Works as a safety net that catches duplication even when the AI fails.

**Tools and specific rules:**

| Tool | What it detects | Configuration |
|---|---|---|
| `jscpd` | Copied/pasted code blocks | Configurable threshold (e.g., 5+ lines) |
| ESLint custom rules | Prohibited patterns | Project-specific rules |
| `no-restricted-imports` | Direct imports (barrel bypass) | List of prohibited paths |
| Stylelint | Hex colors outside of tokens | Allowed values rule |
| `depcheck` | Unused dependencies | package.json cleanup |

**Recommended custom ESLint rules:**

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    // Force imports from barrel files, not from internal files
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['@/features/*/!(index)'],
          message: 'Import from the barrel file (index.ts), not from internal files.'
        },
        {
          group: ['@/shared/*/!(index)'],
          message: 'Import from the barrel file (index.ts), not from internal files.'
        }
      ]
    }],

    // Prohibit hardcoded colors in style files
    // (requires custom plugin or eslint-plugin-no-hardcoded-colors)
  }
};
```

**jscpd configuration:**

```json
// .jscpd.json
{
  "threshold": 5,
  "reporters": ["console"],
  "ignore": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.generated.ts"
  ],
  "absolute": true
}
```

**Integration in pre-commit hook (with husky + lint-staged):**

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "jscpd --min-lines 5"
    ]
  }
}
```

**Impact on duplication:**
- Automatic detection without human or AI intervention
- Blocks commits with duplicate code before they enter the repo
- Import rules enforce the use of barrel files

**Impact on context:**
- No direct impact (doesn't use the AI's context window)
- Indirect: by preventing duplication, the codebase stays smaller

**Considerations:**
- Requires initial setup and rule maintenance
- False positives can be annoying (adjust thresholds)
- Does not replace directives in CLAUDE.md — it complements them

---

### C. Scaffolding / Code templates

**Concept:** Generators that create the structure of a new feature with all files pre-wired. The AI doesn't have to "remember" the structure — the scaffolding enforces it.

**Tools:**
- `plop.js` — Generator based on Handlebars templates
- `hygen` — Generator with in-project templates
- Custom Node.js script — Maximum flexibility

**Example with plop.js:**

```javascript
// plopfile.js
module.exports = function(plop) {
  plop.setGenerator('feature', {
    description: 'Create new feature with complete structure',
    prompts: [
      { type: 'input', name: 'name', message: 'Domain name (e.g., orders):' },
      { type: 'list', name: 'package', choices: ['backend', 'frontend'], message: 'Package:' }
    ],
    actions: function(data) {
      const base = `packages/${data.package}/src/features/{{camelCase name}}`;

      if (data.package === 'backend') {
        return [
          { type: 'add', path: `${base}/{{camelCase name}}.service.ts`, templateFile: 'templates/backend/service.ts.hbs' },
          { type: 'add', path: `${base}/{{camelCase name}}.controller.ts`, templateFile: 'templates/backend/controller.ts.hbs' },
          { type: 'add', path: `${base}/{{camelCase name}}.routes.ts`, templateFile: 'templates/backend/routes.ts.hbs' },
          { type: 'add', path: `${base}/{{camelCase name}}.validation.ts`, templateFile: 'templates/backend/validation.ts.hbs' },
          { type: 'add', path: `${base}/{{camelCase name}}.types.ts`, templateFile: 'templates/backend/types.ts.hbs' },
          { type: 'add', path: `${base}/{{camelCase name}}.queries.ts`, templateFile: 'templates/backend/queries.ts.hbs' },
          { type: 'add', path: `${base}/index.ts`, templateFile: 'templates/backend/index.ts.hbs' },
        ];
      }
      // ... frontend templates
    }
  });
};
```

**Example template (service.ts.hbs):**

```handlebars
// {{camelCase name}}.service.ts
import { responseHelper } from '@/shared/http';
import { {{pascalCase name}}Create } from './{{camelCase name}}.types';
import { {{camelCase name}}Queries } from './{{camelCase name}}.queries';

export async function create{{pascalCase name}}(data: {{pascalCase name}}Create) {
  // TODO: implement business logic
  const result = await {{camelCase name}}Queries.create(data);
  return result;
}
```

**Usage:**

```bash
npm run generate:feature -- --name=orders
# Creates:
#   packages/backend/src/features/orders/
#     ├── orders.service.ts      (already imports shared/http)
#     ├── orders.controller.ts   (already uses asyncWrapper)
#     ├── orders.routes.ts       (already registers routes)
#     ├── orders.validation.ts   (base structure)
#     ├── orders.types.ts        (base interfaces)
#     ├── orders.queries.ts      (base structure)
#     └── index.ts               (pre-configured barrel)
```

**Impact on duplication:**
- Templates come pre-wired to shared modules (shared/http, shared/types, etc.)
- The structure is identical for every feature — impossible for the AI to invent a variant
- The AI only needs to implement business logic, not the structure

**Impact on context:**
- Medium: the AI doesn't need to explore to know what structure to use
- The template implicitly documents conventions

**Considerations:**
- Requires creating and maintaining templates
- Templates must evolve with the project
- Works best if you tell the AI: "Run `npm run generate:feature -- --name=X` and then implement the logic"

---

### D. Dependency Injection / Explicit composition

**Concept:** Instead of each service instantiating or importing its dependencies directly (which the AI tends to duplicate), use an injection pattern that centralizes composition.

**Without DI (prone to duplication):**

```typescript
// features/users/createUser.service.ts
import { db } from '@/shared/database/connection';         // direct import
import { hashPassword } from '@/shared/auth/hashPassword'; // direct import
import { validateEmail } from '@/shared/validation';       // direct import

export async function createUser(data: UserCreate) {
  const valid = validateEmail(data.email);  // the AI may reimplement this
  const hashed = hashPassword(data.password); // the AI may reimplement this
  return db.user.create({ data: { ...data, password: hashed } });
}
```

**With DI / Factory (explicit composition):**

```typescript
// features/users/createUser.service.ts
import type { UserServiceDeps } from './user.types';

export function createUserService(deps: UserServiceDeps) {
  return async function createUser(data: UserCreate) {
    const valid = deps.validateEmail(data.email);
    const hashed = deps.hashPassword(data.password);
    return deps.db.user.create({ data: { ...data, password: hashed } });
  };
}

// Composition in one place (composition root)
// src/composition.ts
import { createUserService } from '@/features/users';
import { db } from '@/shared/database';
import { hashPassword } from '@/shared/auth';
import { validateEmail } from '@/shared/validation';

export const userService = createUserService({ db, hashPassword, validateEmail });
```

**Impact on duplication:**
- Dependencies are injected, not re-imported/re-instantiated in each file
- Composition happens in ONE place — the AI cannot duplicate dependencies
- Facilitates testing (inject mocks)

**Impact on context:**
- Low directly, but the composition root acts as a dependency map
- The AI can read `composition.ts` to understand what services exist and what they use

**Considerations:**
- Adds architectural complexity
- May be excessive for small projects
- Frameworks like NestJS already implement native DI

---

## Axis 2: Optimize context window

Strategies that reduce the AI's context consumption, allowing it to "see" more of the relevant project.

### E. `.claudeignore` / File filtering

**Concept:** Exclude files and directories from the AI's context that it doesn't need to read or modify.

**`.claudeignore` file:**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
build/
.next/
out/

# Generated files (schema-first)
**/*.generated.ts
**/*.generated.js

# Old migrations (keep only recent ones)
database/migrations/

# Static assets
public/images/
public/fonts/
**/*.png
**/*.jpg
**/*.svg
**/*.ico

# Heavy test fixtures
tests/fixtures/
tests/__snapshots__/

# Tool configuration
.husky/
.github/
.vscode/
*.config.js
*.config.ts

# Lock files
package-lock.json
pnpm-lock.yaml
yarn.lock

# Extensive documentation (consult on demand)
docs/
*.md
!CLAUDE.md
!packages/*/CLAUDE.md
```

**Impact on context:**
- High: eliminates significant noise (node_modules, dist, locks, assets)
- The AI only "sees" relevant source code
- Drastically reduces Glob and Grep results

**Impact on duplication:**
- No direct impact
- Indirect: with more context available, the AI can discover more existing code

**Considerations:**
- Be careful not to exclude files the AI actually needs
- Keep updated when the structure changes
- Excluded files are still accessible if the path is explicitly requested

---

### F. Tiered documentation (layers of detail)

**Concept:** Instead of a single CLAUDE.md that tries to cover everything (consuming a lot of context), organize information in depth levels.

**Level structure:**

| Level | File | Content | When it's read | Ideal size |
|---|---|---|---|---|
| 1 | `CLAUDE.md` (root) | Behavioral directives + minimal project map | Always (automatic) | < 80 lines |
| 2 | `packages/*/CLAUDE.md` | Package-specific conventions, available modules in that package | When working in that package | < 50 lines |
| 3 | `docs/architecture.md` | Deep architecture detail, design decisions, diagrams | Only on explicit demand | No limit |
| 4 | Barrel files (`index.ts`) | Export inventory with comments | When exploring a module | Variable |

**Example root CLAUDE.md (Level 1 — compact):**

```markdown
# Project Directives

<protocolo_anti_duplicacion>
Before creating new code:
1. Glob("**/*[keyword]*") in the current package
2. Read index.ts of shared/ and common/
3. Grep("[similar_name]") in src/
4. Similar exists → extend. Only if not → create new.
</protocolo_anti_duplicacion>

<regla_de_variacion>
Always parameterize the existing one before creating a new variant.
</regla_de_variacion>

## Structure
- packages/backend/ → API (features/, shared/, middleware/)
- packages/frontend/ → UI (features/, shared/ui/, shared/hooks/, shared/styles/)
- packages/common/ → Shared front+back (types/, validation/, constants/)

## For more detail
- Backend conventions: packages/backend/CLAUDE.md
- Frontend conventions: packages/frontend/CLAUDE.md
- Full architecture: docs/architecture.md
```

**Example packages/backend/CLAUDE.md (Level 2):**

```markdown
# Backend — Conventions

## Layers: route → controller → service → query
- Controllers NEVER contain business logic
- Services NEVER access req/res
- Responses ALWAYS via shared/http/responseHelper

## Available modules in shared/
- http/ → responseHelper, errorHandler, asyncWrapper, httpErrors
- database/ → connection, queryBuilder, pagination
- auth/ → tokenService, hashPassword
```

**Impact on context:**
- High: the root CLAUDE.md goes from ~140 lines to ~30 lines
- Detailed information is only loaded when needed
- Reduces the "fixed cost" of context per session

**Impact on duplication:**
- Low directly, but by freeing context, the AI has more room to discover existing code

**Considerations:**
- Requires maintaining consistency between levels
- The AI must know other levels exist (mention them in level 1)
- The CLAUDE.md for the active package is naturally read when navigating the structure

---

### G. Barrel files as enriched semantic indexes

**Concept:** Transform barrel files from simple export lists into **semantic indexes** that the AI can use as compact documentation.

**Standard barrel file (current):**

```typescript
// src/shared/http/index.ts
export { responseHelper } from './responseHelper';
export { asyncWrapper } from './asyncWrapper';
export { httpErrors } from './httpErrors';
export { errorHandler } from './errorHandler';
```

**Enriched barrel file (proposed):**

```typescript
// src/shared/http/index.ts
// HTTP module — helpers for controllers and error handling

export { responseHelper } from './responseHelper';   // success(data) | error(code, message) → format { success, data?, error? }
export { asyncWrapper } from './asyncWrapper';       // Wrap async controller → try/catch + next(error) automatic
export { httpErrors } from './httpErrors';            // NotFoundError(msg), UnauthorizedError(msg), ValidationError(msg, fields)
export { errorHandler } from './errorHandler';       // Global middleware: catches errors → responseHelper.error()
```

**Barrel file with inline types (alternative):**

```typescript
// src/shared/formatting/index.ts
// Formatting utilities for UI presentation

export { formatCurrency } from './formatCurrency';
// formatCurrency(value: number, opts?: { decimals?: number, symbol?: string, locale?: string }): string

export { formatDate } from './formatDate';
// formatDate(date: Date | string, format?: 'short' | 'long' | 'iso'): string

export { formatPhone } from './formatPhone';
// formatPhone(phone: string, countryCode?: 'CL' | 'US' | 'ES'): string
```

**Impact on context:**
- High: the AI reads ONE file and gets what exists + what it does + what parameters it accepts
- Avoids opening individual files just to understand their API
- Comments act as mini-documentation that costs very few tokens

**Impact on duplication:**
- Medium: by knowing what parameters a function accepts, the AI can reuse it instead of creating a variant
- The comment "formatCurrency accepts { decimals, symbol }" prevents creating `formatCurrencyNoDecimals()`

**Considerations:**
- Comments must be kept in sync with the implementation
- Don't overload: one line per export is sufficient
- Compatible with the existing `<auto_mantenimiento>` directive

---

### H. Type-driven development

**Concept:** Use TypeScript's type system as the primary documentation. Explicit and expressive types reduce the need for the AI to read full implementations.

**Example — Types as documentation:**

```typescript
// shared/http/responseHelper.types.ts
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;        // e.g.: 'VALIDATION_ERROR', 'NOT_FOUND'
    message: string;     // Human-readable message for the user
    fields?: Record<string, string>; // Field-level errors (validation)
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

With these types, the AI knows the exact response structure without reading `responseHelper.ts`.

**Example — Functions with expressive signatures:**

```typescript
// In the barrel file or a .d.ts file
export function formatCurrency(
  value: number,
  options?: {
    decimals?: number;     // default: 2
    symbol?: string;       // default: '$'
    locale?: string;       // default: 'es-CL'
    thousandsSeparator?: string; // default: '.'
  }
): string;
```

**Example — Enums as state documentation:**

```typescript
// common/constants/orderStatus.ts
export const OrderStatus = {
  DRAFT: 'draft',           // Order created, not confirmed
  PENDING: 'pending',       // Awaiting payment
  PAID: 'paid',             // Payment received
  PROCESSING: 'processing', // In preparation
  SHIPPED: 'shipped',       // Shipped
  DELIVERED: 'delivered',   // Delivered
  CANCELLED: 'cancelled',   // Cancelled (by customer or system)
} as const;

export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];
```

**Impact on context:**
- High: types are more compact than implementations and contain the essential information
- The AI can work with interfaces without reading source code
- Automatically generated `.d.ts` files serve as zero-cost documentation

**Impact on duplication:**
- Medium: well-defined types prevent the AI from creating parallel types
- If `ApiResponse<T>` is clear and discoverable, another response format won't be created

**Considerations:**
- Requires discipline in maintaining expressive types
- Types that are too generic (`any`, `Record<string, unknown>`) negate the benefit
- Works best with `strict: true` in tsconfig

---

### I. Compact dependency map

**Concept:** An automatically generated file that shows the project topology — what depends on what — in a compact format the AI can consult.

**Generated file: `dependency-map.md`**

```markdown
# Dependency Map (auto-generated)
<!-- Generated by: npm run deps:map -->
<!-- Last updated: 2025-01-30 -->

## Backend Features
| Feature | Uses from shared/ | Uses from common/ |
|---|---|---|
| auth | http, auth | types/auth, validation/email |
| users | http, database, auth | types/user, validation/email, validation/phone |
| payments | http, database | types/payment, constants/statusCodes |

## Frontend Features
| Feature | Uses from shared/ | Uses from common/ |
|---|---|---|
| auth | hooks/useAuth, ui/Form, http/apiClient | types/auth |
| users | hooks/usePagination, ui/Table, formatting/formatDate | types/user |
| payments | hooks/usePayments, ui/Modal, formatting/formatCurrency | types/payment |

## Shared Backend
| Module | Used by |
|---|---|
| http/responseHelper | auth, users, payments |
| http/errorHandler | auth, users, payments |
| database/pagination | users, payments |
| auth/tokenService | auth |
| auth/hashPassword | auth, users |

## Shared Frontend
| Module | Used by |
|---|---|
| ui/Button | auth, users, payments |
| ui/Table | users, payments |
| hooks/useAuth | auth, users |
| formatting/formatCurrency | payments |
```

**Generator script (example with madge):**

```bash
# Using madge to generate dependencies
npx madge --json packages/backend/src > deps-backend.json
npx madge --json packages/frontend/src > deps-frontend.json

# Or a custom script that parses imports and generates the markdown table
node scripts/generate-dependency-map.js > dependency-map.md
```

**Impact on context:**
- High: the AI understands the project topology with ONE compact file
- Knows which shared modules each feature uses without exploring
- Can infer what to reuse before creating something new

**Impact on duplication:**
- Low directly, but informs the AI about what already exists and where
- If the AI sees that `auth` and `users` both use `hashPassword`, it won't create it again

**Considerations:**
- Requires a generation script and a hook (pre-commit or CI) to keep it updated
- Can become outdated if not automated
- Complements CLAUDE.md, doesn't replace it

---

## Axis 3: Strategies that target both goals

### J. Stricter conventions

**Concept:** The more things are "by convention" (don't require documentation or exploration), the less context is consumed and the fewer decisions the AI can make inconsistently.

**Cognitive/contextual cost spectrum:**

```
Convention        → Zero-cost: the AI knows it without searching
  > Configuration → Low-cost: the AI reads a config file
    > Documentation → Medium-cost: the AI reads CLAUDE.md or docs
      > Exploration → High-cost: the AI searches, reads multiple files
```

**Conventions that eliminate decisions:**

| Decision eliminated | Convention | Before (the AI decides) | After (convention) |
|---|---|---|---|
| HTTP response format | Always `responseHelper` | The AI chooses between `res.json()`, helper, custom | No decision |
| Where errors go | Always `httpErrors.ts` | The AI creates ad-hoc error classes | No decision |
| Controller name | `domain.controller.ts` | The AI chooses between handler, controller, route-handler | No decision |
| Input validation | Middleware + Zod schema | The AI validates inline in the controller | No decision |
| Feature structure | Template scaffolding | The AI improvises the structure | No decision |
| CSS colors | Token from `tokens.ts` | The AI picks a hex value | No decision |
| Breakpoints | `media` from `mixins.ts` | The AI writes `@media (max-width: 768px)` | No decision |

**Principle:** Every eliminated decision is context saved and a source of duplication closed.

**Impact on duplication:** High — if there's only one way to do something, there can't be variants.

**Impact on context:** High — the AI doesn't need to search "how to do X" if the convention is strict and in CLAUDE.md.

---

### K. Prompt engineering in CLAUDE.md

**Concept:** Optimize CLAUDE.md directives to convey maximum information with minimum tokens.

**Optimization techniques:**

#### 1. Short but semantic XML tags

```markdown
<!-- Before (verbose) -->
<protocolo_de_busqueda_antes_de_crear_codigo_nuevo>
Before creating ANY new function, component, utility, helper, type, or service,
execute this 4-step search protocol:
...
</protocolo_de_busqueda_antes_de_crear_codigo_nuevo>

<!-- After (compact) -->
<anti_dup>
Before creating new code:
1. Glob("**/*[keyword]*")
2. Read index.ts of shared/ and common/
3. Grep("[similar_name]")
4. Similar exists → extend | Doesn't exist → create
</anti_dup>
```

#### 2. Tables instead of lists

```markdown
<!-- Before (list) -->
- Services are named verbNoun.service.ts, for example createUser.service.ts
- Controllers are named domain.controller.ts, for example user.controller.ts
- Routes are named domain.routes.ts, for example user.routes.ts
- Validations are named domain.validation.ts, for example user.validation.ts

<!-- After (table) -->
| Type | Pattern | Example |
|---|---|---|
| Service | verbNoun.service.ts | createUser.service.ts |
| Controller | domain.controller.ts | user.controller.ts |
| Routes | domain.routes.ts | user.routes.ts |
| Validation | domain.validation.ts | user.validation.ts |
```

#### 3. One good example is worth more than three mediocre ones

```markdown
<!-- Before (3 examples) -->
❌ utils.ts → 400 lines
❌ helpers.ts → 300 lines
❌ common.ts → 250 lines
✅ formatCurrency.ts → 15 lines
✅ validateEmail.ts → 10 lines
✅ hashPassword.ts → 20 lines

<!-- After (1 clear example) -->
❌ utils.ts (400 lines, 20 functions)
✅ formatCurrency.ts (15 lines, 1 function)
```

#### 4. Prioritize rules by usage frequency

The most-used rules should come first in CLAUDE.md (the AI pays more attention to the beginning):

1. Anti-duplication protocol (used in EVERY task)
2. Variation rule (used frequently)
3. Naming conventions (consulted frequently)
4. Available modules (consulted frequently)
5. CSS rules (frontend only)
6. Post-compact (only after summaries)

**Impact on context:** High — a well-written 50-line CLAUDE.md outperforms a verbose 150-line one.

**Impact on duplication:** Low directly, but more compact directives are easier to follow consistently.

---

## Summary matrix

| # | Strategy | Anti-duplication | Optimizes context | Already documented | Implementation complexity |
|---|---|---|---|---|---|
| A | Schema-first (Zod, OpenAPI, Prisma) | **High** | **High** | No | Medium-High |
| B | Linting + automated detection | **High** | None (doesn't use AI) | No | Medium |
| C | Scaffolding / Templates (plop, hygen) | **High** | Medium | No | Medium |
| D | Dependency Injection | Medium | Low | No | Medium-High |
| E | `.claudeignore` | None | **High** | No | Low |
| F | Tiered documentation | Low | **High** | Partial | Low |
| G | Enriched barrel files | Medium | **High** | Partial | Low |
| H | Type-driven development | Medium | **High** | No | Medium |
| I | Compact dependency map | Low | **High** | No | Medium |
| J | Strict conventions | **High** | **High** | Partial | Low |
| K | Prompt engineering in CLAUDE.md | Low | **High** | Partial | Low |

### Recommended prioritization

**High impact + Low complexity (implement first):**
1. **E** — `.claudeignore` (quick setup, immediate context benefit)
2. **J** — Strict conventions (refine existing ones, eliminate more decisions)
3. **G** — Enriched barrel files (add comments to existing index.ts files)
4. **F** — Tiered documentation (reorganize existing CLAUDE.md into levels)
5. **K** — Prompt engineering (compact the current CLAUDE.md)

**High impact + Medium complexity (implement after):**
6. **A** — Schema-first (choose tool: Zod recommended for lower overhead)
7. **B** — Automated linting (configure jscpd + ESLint rules)
8. **C** — Scaffolding (create templates with plop.js)

**Medium impact + Medium-High complexity (evaluate per project):**
9. **H** — Type-driven development (requires ongoing discipline)
10. **I** — Dependency map (requires script + automation)
11. **D** — Dependency Injection (only if the project justifies it)

---

## Next steps

- [ ] Decide which strategies to incorporate into existing documents
- [ ] For each selected strategy, define whether to integrate it into current guides or create a new document
- [ ] Prioritize implementation according to the impact/complexity matrix
- [ ] Update `CLAUDE-TEMPLATE.md` and `CLAUDE-TEMPLATE-COMPACT.md` with incorporated strategies

---

> **Note:** This document is an analysis of alternatives. The strategies described here should be evaluated in the context of each specific project before implementation.
