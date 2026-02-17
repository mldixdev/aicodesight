# AI-Friendly Architecture Guide: Eliminating Duplicate Code

> **Version:** 1.0 — Iterative base document
> **Goal:** Practices, conventions, and configuration so that Claude Code generates code without duplication or redundancy.

---

## Table of Contents

1. [The Problem: Why AI Duplicates Code](#1-the-problem)
2. [AI-Friendly Architecture Principles](#2-principles)
3. [Recommended Folder Structure](#3-structure)
4. [Naming Conventions](#4-naming)
5. [CLAUDE.md Configuration](#5-claudemd)
6. [Working Practices](#6-practices)
7. [Progressive Refactoring Guide](#7-refactoring)
8. [Quick Checklist](#8-checklist)

---

## 1. The Problem: Why AI Duplicates Code {#1-the-problem}

### 1.1 Root causes

AI-generated code duplication is not a model defect but a consequence of how it operates. Understanding the causes allows designing effective countermeasures.

#### A. Context loss between sessions

Each Claude Code session starts without memory. The model doesn't know which utilities, helpers, or services already exist in the project. When summarizing long sessions (compact), the detail of previous implementations is lost.

**Impact:** The AI reimplements functionality that already exists because it doesn't "remember" it.

#### B. Local problem resolution

The model optimizes for completing the immediate task. It prefers writing self-contained code over searching for existing dependencies. If the functionality it needs isn't in its current context, it creates it anew.

**Impact:** Each task generates its own version of common utilities.

#### C. Large files as black boxes

A 500+ line file is hard to process efficiently. Useful functions get "buried" and are not discovered by searches. If the file is called `utils.ts` or `helpers.ts`, the model cannot infer its content from the name.

**Impact:** Existing functionality is not discovered and gets rewritten.

#### D. Lack of explicit directives

Without instructions in CLAUDE.md about reuse, the model doesn't prioritize searching for existing code. Without naming conventions or structure, it doesn't know where to look. Without a project "map", each task starts from scratch.

**Impact:** The model has no guidance on how to interact with existing code.

#### E. Ambiguity in requests

"Add validation to the form" doesn't indicate whether a validation system already exists. The model doesn't proactively ask "does something similar already exist?" unless explicitly instructed to do so.

**Impact:** Parallel implementations are created unnecessarily.

#### F. Finite context as a scarce resource

The AI's context window has a limit. Every file read, every search result, every CLAUDE.md instruction consumes a portion of that resource. When a task requires reading many files to understand the full context, the window gets saturated. When compacted (compact/summary), details of what was already read are lost — and the AI loses visibility of existing code it had previously discovered.

**Impact:** Paradoxically, a project with many small, well-named files is more discoverable but also more expensive to explore in its entirety. The AI can discover a file by name but not know its content without reading it, consuming context.

**Countermeasure:** Compact barrel files and a concise CLAUDE.md that serve as an efficient index — the AI gets maximum information with minimum context consumption.

#### G. Duplication by variation ("almost the same")

When the AI needs functionality similar but not identical to something existing, the tendency is to create a new function instead of extending the existing one. For example: `formatCurrency()` exists and formats with 2 decimals, but format without decimals is needed. Instead of parameterizing (`formatCurrency(value, { decimals: 0 })`), the AI creates `formatCurrencyCompact()`.

**Impact:** Proliferation of "almost identical" functions — `formatCurrency()`, `formatCurrencyCLP()`, `formatCurrencyNoDecimals()`, `formatCurrencyShort()` — that do variations of the same thing.

**Countermeasure:** Explicit directive: "If similar functionality exists, extend/parameterize the existing one before creating something new."

### 1.2 The vicious cycle

```
More duplicate code
    → Larger project
        → More context consumption per session
            → Less existing code visible to the AI
                → More duplicate code
```

This cycle accelerates as the project grows. The solution must attack the root: making existing code **discoverable** by the AI.

---

## 2. AI-Friendly Architecture Principles {#2-principles}

These 6 principles transform the project structure so that the AI can discover and reuse existing code.

### Principle 1: One file, one responsibility

Each file should do exactly one thing. Not a file with "all utilities" but one file per utility.

```
❌ utils.ts          → 400 lines, 20 mixed functions
✅ formatCurrency.ts → 15 lines, one clear function
✅ formatDate.ts     → 20 lines, one clear function
✅ validateEmail.ts  → 10 lines, one clear function
```

**Why it works:** The AI searches for files with Glob before writing code. `formatCurrency.ts` is discovered instantly; a `formatCurrency()` function inside `utils.ts` is not.

### Principle 2: Self-documenting names

The file name should describe its content with enough precision so that the AI (and humans) know what it contains without opening it.

```
❌ service.ts            → What service?
❌ handler.ts            → What does it handle?
❌ utils.ts              → What utilities?

✅ createUser.service.ts → Creates users
✅ paymentWebhook.handler.ts → Handles payment webhooks
✅ formatCurrency.ts     → Formats currency
```

**Why it works:** Glob results become a semantic map of the project. The AI can decide "formatCurrency.ts already exists, I don't need to create something new" without reading the file.

### Principle 3: Maximum file size (~100-150 lines) and one main export

A file that exceeds ~150 lines probably has more than one responsibility and should be split.

**Complementary rule: one main public export per file.** It's not just the number of lines that matters but the number of exports. A 120-line file with 8 exported functions is still a "mini black box" because the file name can't describe 8 things. The file can have private internal helpers, but should have one main export that matches its name.

```
❌ formatters.ts → exports formatCurrency, formatDate, formatPhone, formatRut
✅ formatCurrency.ts → exports formatCurrency (can have internal helpers)
```

**Valid exceptions:**
- UI components with extensive but cohesive markup
- Configuration files
- Database migrations
- Type files (`*.types.ts`) that group types of a domain
- Constants files (`*.constants.ts`) that group constants of a domain

**Why it works:** Small files with one main export fit entirely in the AI's context, are read quickly, their purpose is clear, and their name describes exactly what they contain.

### Principle 4: Predictable structure by convention

The AI should be able to infer where to look for something based on convention, without needing to explore the entire project.

```
Need a formatting utility?     → shared/formatting/
Need user logic?               → features/users/
Need a UI component?           → shared/ui/
Need payment validation?       → features/payments/payment.validation.ts
```

**Why it works:** Reduces the search space. Instead of searching the entire project, the AI goes directly to the right place.

### Principle 5: Barrel files as a map

Each folder has an `index.ts` that exports everything public and serves as a table of contents.

```typescript
// src/shared/formatting/index.ts
// Data formatting utilities for user presentation
export { formatCurrency } from './formatCurrency';
export { formatDate } from './formatDate';
export { formatPhone } from './formatPhone';
export { formatRut } from './formatRut';
```

**Why it works:** The AI only needs to read ONE file (the index) to know everything that exists in a module. It's a compact, context-efficient map.

### Principle 6: Grouping by domain/feature, not by technical type

```
❌ Grouping by technical type:
src/
  controllers/    → all controllers mixed together
  services/       → all services mixed together
  models/         → all models mixed together

✅ Grouping by domain:
src/
  features/
    auth/         → everything authentication-related together
    users/        → everything user-related together
    payments/     → everything payment-related together
```

**Why it works:** When the AI works on a feature, all related code is in one folder. It doesn't need to search across 5 different folders to understand a domain.

---

## 3. Recommended Folder Structure {#3-structure}

### 3.1 Full-Stack Monorepo (Frontend + Backend)

The recommended structure is a **monorepo** where frontend and backend are independent packages, each with its own `package.json`, `tsconfig.json`, and build process. A third `common` package contains code shared between both (types, validations, constants).

```
project/
├── CLAUDE.md                              ← Global instructions for the AI
├── package.json                           ← Workspace root (npm workspaces)
├── turbo.json                             ← (Optional) Turborepo config
│
├── packages/
│   ├── backend/                           ← BACKEND PACKAGE (API)
│   │   ├── package.json                   ← Backend dependencies and scripts
│   │   ├── tsconfig.json                  ← Independent backend compilation
│   │   ├── CLAUDE.md                      ← (Optional) Backend-specific instructions
│   │   ├── src/
│   │   │   ├── features/                  ← Business domains (API)
│   │   │   │   ├── auth/
│   │   │   │   │   ├── login.service.ts
│   │   │   │   │   ├── register.service.ts
│   │   │   │   │   ├── resetPassword.service.ts
│   │   │   │   │   ├── auth.validation.ts
│   │   │   │   │   ├── auth.types.ts
│   │   │   │   │   ├── auth.constants.ts
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   └── index.ts           ← Barrel
│   │   │   │   │
│   │   │   │   ├── users/
│   │   │   │   │   ├── createUser.service.ts
│   │   │   │   │   ├── updateUser.service.ts
│   │   │   │   │   ├── deleteUser.service.ts
│   │   │   │   │   ├── user.queries.ts
│   │   │   │   │   ├── user.validation.ts
│   │   │   │   │   ├── user.types.ts
│   │   │   │   │   ├── user.routes.ts
│   │   │   │   │   ├── user.controller.ts
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   └── payments/
│   │   │   │       ├── processPayment.service.ts
│   │   │   │       ├── refundPayment.service.ts
│   │   │   │       ├── payment.queries.ts
│   │   │   │       ├── payment.validation.ts
│   │   │   │       ├── payment.types.ts
│   │   │   │       ├── payment.routes.ts
│   │   │   │       ├── payment.controller.ts
│   │   │   │       └── index.ts
│   │   │   │
│   │   │   ├── shared/                    ← Code shared ONLY within the backend
│   │   │   │   ├── http/
│   │   │   │   │   ├── responseHelper.ts  ← Standard response format
│   │   │   │   │   ├── errorHandler.ts    ← Centralized error handling
│   │   │   │   │   ├── asyncWrapper.ts    ← Async wrapper for controllers
│   │   │   │   │   ├── httpErrors.ts      ← HTTP error classes
│   │   │   │   │   └── index.ts
│   │   │   │   ├── database/
│   │   │   │   │   ├── connection.ts
│   │   │   │   │   ├── queryBuilder.ts
│   │   │   │   │   ├── pagination.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── auth/
│   │   │   │       ├── tokenService.ts
│   │   │   │       ├── hashPassword.ts
│   │   │   │       └── index.ts
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   ├── authMiddleware.ts
│   │   │   │   ├── roleMiddleware.ts
│   │   │   │   ├── errorMiddleware.ts
│   │   │   │   ├── loggingMiddleware.ts
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │   ├── database.ts
│   │   │   │   ├── environment.ts
│   │   │   │   ├── cors.ts
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── routes/
│   │   │   │   └── index.ts              ← Main router
│   │   │   │
│   │   │   ├── app.ts                    ← App configuration
│   │   │   └── server.ts                 ← Entry point
│   │   │
│   │   └── tests/
│   │       ├── features/
│   │       │   ├── auth/
│   │       │   │   └── login.service.test.ts
│   │       │   └── users/
│   │       │       └── createUser.service.test.ts
│   │       └── shared/
│   │           └── http/
│   │               └── responseHelper.test.ts
│   │
│   ├── frontend/                          ← FRONTEND PACKAGE (UI)
│   │   ├── package.json                   ← Frontend dependencies and scripts
│   │   ├── tsconfig.json                  ← Independent frontend compilation
│   │   ├── CLAUDE.md                      ← (Optional) Frontend-specific instructions
│   │   ├── src/
│   │   │   ├── features/                  ← UI features (pages/views)
│   │   │   │   ├── auth/
│   │   │   │   │   ├── LoginPage.tsx
│   │   │   │   │   ├── RegisterPage.tsx
│   │   │   │   │   ├── useAuth.ts         ← Authentication hook
│   │   │   │   │   ├── auth.store.ts      ← Auth state/store
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   ├── users/
│   │   │   │   │   ├── UserListPage.tsx
│   │   │   │   │   ├── UserDetailPage.tsx
│   │   │   │   │   ├── UserForm.tsx
│   │   │   │   │   ├── useUsers.ts
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   └── payments/
│   │   │   │       ├── PaymentPage.tsx
│   │   │   │       ├── PaymentHistory.tsx
│   │   │   │       ├── usePayments.ts
│   │   │   │       └── index.ts
│   │   │   │
│   │   │   ├── shared/                    ← Code shared ONLY within the frontend
│   │   │   │   ├── ui/                    ← Reusable UI components
│   │   │   │   │   ├── Button/
│   │   │   │   │   │   ├── Button.tsx
│   │   │   │   │   │   ├── Button.styles.ts
│   │   │   │   │   │   └── index.ts
│   │   │   │   │   ├── Modal/
│   │   │   │   │   ├── Form/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useDebounce.ts
│   │   │   │   │   ├── usePagination.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── formatting/            ← Formatting for UI presentation
│   │   │   │   │   ├── formatCurrency.ts
│   │   │   │   │   ├── formatDate.ts
│   │   │   │   │   ├── formatPhone.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── styles/               ← Design tokens and base styles
│   │   │   │   │   ├── tokens.ts         ← Colors, spacing, breakpoints, typography
│   │   │   │   │   ├── globalStyles.ts   ← Reset/global styles
│   │   │   │   │   ├── mixins.ts         ← Reusable style functions
│   │   │   │   │   ├── animations.ts     ← Shared keyframes and transitions
│   │   │   │   │   └── index.ts
│   │   │   │   └── http/
│   │   │   │       ├── apiClient.ts       ← Configured HTTP client
│   │   │   │       ├── interceptors.ts
│   │   │   │       └── index.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │   ├── environment.ts
│   │   │   │   ├── routes.ts              ← Frontend route configuration
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   └── App.tsx                    ← Root component
│   │   │
│   │   └── tests/
│   │       ├── features/
│   │       └── shared/
│   │
│   └── common/                            ← SHARED PACKAGE (Front + Back)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types/                     ← Shared types/DTOs
│           │   ├── user.types.ts          ← UserCreate, UserUpdate, UserResponse
│           │   ├── payment.types.ts       ← PaymentCreate, PaymentResponse
│           │   ├── auth.types.ts          ← LoginRequest, TokenResponse
│           │   ├── api.types.ts           ← ApiResponse<T>, PaginatedResponse<T>
│           │   └── index.ts
│           ├── validation/                ← Validations that apply on both sides
│           │   ├── validateEmail.ts
│           │   ├── validatePhone.ts
│           │   ├── validateRequired.ts
│           │   └── index.ts
│           ├── constants/                 ← Shared constants
│           │   ├── roles.ts
│           │   ├── statusCodes.ts
│           │   └── index.ts
│           └── index.ts                   ← Root barrel for common
│
├── database/
│   ├── migrations/
│   └── seeds/
│
└── docs/
    └── architecture.md
```

### 3.2 Independent compilation

Each package compiles and runs independently. The root `package.json` configures the workspaces:

```json
// package.json (root)
{
  "name": "project",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:backend": "npm run dev -w packages/backend",
    "dev:frontend": "npm run dev -w packages/frontend",
    "build:backend": "npm run build -w packages/backend",
    "build:frontend": "npm run build -w packages/frontend",
    "build:common": "npm run build -w packages/common",
    "build:all": "npm run build:common && npm run build:backend && npm run build:frontend",
    "test": "npm run test --workspaces"
  }
}
```

Each package references `common` as an internal dependency:

```json
// packages/backend/package.json
{
  "name": "@project/backend",
  "dependencies": {
    "@project/common": "*"
  }
}

// packages/frontend/package.json
{
  "name": "@project/frontend",
  "dependencies": {
    "@project/common": "*"
  }
}
```

This allows importing shared types without duplication:

```typescript
// In the backend
import { UserCreate, ApiResponse } from '@project/common';

// In the frontend
import { UserCreate, ApiResponse } from '@project/common';
```

### 3.3 Three levels of shared/

The monorepo structure defines three levels of shared code. It's critical to understand when to use each one:

| Level | Location | Contains | Example |
|---|---|---|---|
| **Global shared** | `packages/common/` | Code used by frontend AND backend | API types, validations, constants |
| **Backend shared** | `packages/backend/src/shared/` | Code used by 2+ backend features | responseHelper, errorHandler, pagination |
| **Frontend shared** | `packages/frontend/src/shared/` | Code used by 2+ frontend features | UI components, hooks, formatters |

### 3.4 Location rule: where does each thing go?

```
Is it needed by BOTH (frontend and backend)?
  → YES → Goes in packages/common/
         (shared types, common validations, constants)
  → NO → Is it backend code?
    → YES → Is it used by only 1 backend feature?
      → YES → Goes in packages/backend/src/features/[domain]/
      → NO → Goes in packages/backend/src/shared/
    → NO → Is it frontend code?
      → YES → Is it used by only 1 frontend feature?
        → YES → Goes in packages/frontend/src/features/[domain]/
        → NO → Goes in packages/frontend/src/shared/
```

**Golden rule:** Never create something in `shared/` or `common/` preventively. Only move when it's confirmed that 2+ consumers need it.

**Key anti-duplication rule:** If the backend defines a type like `UserResponse` and the frontend needs that same type, it MUST go in `common/`. If the AI creates a `UserResponse` type in the frontend that already exists in the backend, it's a sign it should be in `common/`.

### 3.5 CSS Styles: Anti-Duplication Architecture

CSS styles are one of the most common sources of duplication in frontend. Repeated colors across multiple files, breakpoints defined with magic values, inconsistent spacing — all of this multiplies quickly with AI. The solution is to centralize design decisions in **design tokens** and organize styles by layers.

#### Principle: Design Tokens as Single Source of Truth

A **design token** is a design value with a semantic name. Instead of writing `#1B3A5C` or `16px` directly in components, centralized tokens are referenced.

```typescript
// packages/frontend/src/shared/styles/tokens.ts
// Centralized design tokens — SINGLE source of design values

export const colors = {
  // Primary palette
  primary:    '#1B3A5C',
  primaryLight: '#2A5580',
  primaryDark:  '#0F2440',
  secondary:  '#E8913A',
  secondaryLight: '#F0A85C',

  // Semantic
  success:  '#2D8A4E',
  warning:  '#D4A017',
  error:    '#C0392B',
  info:     '#2980B9',

  // Neutrals
  text:       '#1A1A2E',
  textMuted:  '#6B7280',
  background: '#FFFFFF',
  surface:    '#F8F9FA',
  border:     '#E5E7EB',
} as const;

export const spacing = {
  xs:  '4px',
  sm:  '8px',
  md:  '16px',
  lg:  '24px',
  xl:  '32px',
  xxl: '48px',
} as const;

export const breakpoints = {
  mobile:  '480px',
  tablet:  '768px',
  desktop: '1024px',
  wide:    '1280px',
} as const;

export const typography = {
  fontFamily: {
    heading: "'Georgia', serif",
    body:    "'Calibri', 'Segoe UI', sans-serif",
    mono:    "'Consolas', 'Fira Code', monospace",
  },
  fontSize: {
    xs:   '0.75rem',   // 12px
    sm:   '0.875rem',  // 14px
    base: '1rem',      // 16px
    lg:   '1.125rem',  // 18px
    xl:   '1.25rem',   // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
  },
  fontWeight: {
    normal:   '400',
    medium:   '500',
    semibold: '600',
    bold:     '700',
  },
} as const;

export const shadows = {
  sm:  '0 1px 2px rgba(0, 0, 0, 0.05)',
  md:  '0 4px 6px rgba(0, 0, 0, 0.1)',
  lg:  '0 10px 15px rgba(0, 0, 0, 0.15)',
} as const;

export const borderRadius = {
  sm:   '4px',
  md:   '8px',
  lg:   '12px',
  full: '9999px',
} as const;

export const transitions = {
  fast:   '150ms ease',
  normal: '250ms ease',
  slow:   '400ms ease-in-out',
} as const;
```

#### Style file structure

```
packages/frontend/src/shared/styles/
├── tokens.ts           ← Centralized values (colors, spacing, breakpoints, etc.)
├── globalStyles.ts     ← CSS reset, base body/html styles, global typography
├── mixins.ts           ← Reusable functions that generate styles
├── animations.ts       ← Shared keyframes and transitions
└── index.ts            ← Barrel that exports everything
```

#### Adaptation by CSS technology

Design tokens are applied differently depending on the project's CSS technology. Here's how to adapt to the three most common:

**CSS Modules / Plain CSS (native CSS variables):**

```typescript
// mixins.ts — Generates a :root with CSS custom properties from the tokens
import { colors, spacing, breakpoints, typography } from './tokens';

export function generateCSSVariables(): string {
  return `
    :root {
      --color-primary: ${colors.primary};
      --color-secondary: ${colors.secondary};
      --color-error: ${colors.error};
      --spacing-sm: ${spacing.sm};
      --spacing-md: ${spacing.md};
      --spacing-lg: ${spacing.lg};
      --font-heading: ${typography.fontFamily.heading};
      --font-body: ${typography.fontFamily.body};
    }
  `;
}
```

```css
/* Components use variables, never hardcoded values */
.button {
  background-color: var(--color-primary);        /* ✅ */
  padding: var(--spacing-sm) var(--spacing-md);  /* ✅ */
  /* background-color: #1B3A5C;  ❌ NEVER */
  /* padding: 8px 16px;          ❌ NEVER */
}
```

**CSS-in-JS (styled-components, Emotion, Stitches):**

```typescript
// Components import tokens directly
import { colors, spacing, borderRadius } from '@/shared/styles';

const StyledButton = styled.button`
  background-color: ${colors.primary};
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${borderRadius.md};
`;
```

**Tailwind CSS (theme configuration):**

```javascript
// tailwind.config.js — Extends the theme with the project's tokens
const { colors, spacing, typography, breakpoints } = require('./src/shared/styles/tokens');

module.exports = {
  theme: {
    extend: {
      colors: {
        primary:   colors.primary,
        secondary: colors.secondary,
        error:     colors.error,
      },
      fontFamily: {
        heading: [typography.fontFamily.heading],
        body:    [typography.fontFamily.body],
      },
      spacing: spacing,
      screens: {
        mobile:  breakpoints.mobile,
        tablet:  breakpoints.tablet,
        desktop: breakpoints.desktop,
      },
    },
  },
};
```

#### Mixins: Reusable style functions

Mixins centralize style patterns that repeat across components. Without mixins, the AI generates the same set of CSS properties in each component.

```typescript
// packages/frontend/src/shared/styles/mixins.ts

import { breakpoints, typography, spacing } from './tokens';

// Consistent media queries
export const media = {
  mobile:  `@media (max-width: ${breakpoints.mobile})`,
  tablet:  `@media (max-width: ${breakpoints.tablet})`,
  desktop: `@media (min-width: ${breakpoints.desktop})`,
} as const;

// Common layout patterns
export const flexCenter = `
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const flexBetween = `
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

// Text truncation (repeats a lot without centralization)
export const textTruncate = `
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const textTruncateMultiline = (lines: number) => `
  display: -webkit-box;
  -webkit-line-clamp: ${lines};
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

// Typography styles by level
export const heading = (level: 1 | 2 | 3 | 4) => {
  const sizes = {
    1: typography.fontSize['3xl'],
    2: typography.fontSize['2xl'],
    3: typography.fontSize.xl,
    4: typography.fontSize.lg,
  };
  return `
    font-family: ${typography.fontFamily.heading};
    font-size: ${sizes[level]};
    font-weight: ${typography.fontWeight.bold};
    line-height: 1.3;
  `;
};
```

#### Shared animations

```typescript
// packages/frontend/src/shared/styles/animations.ts

import { transitions } from './tokens';

export const fadeIn = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

export const slideUp = `
  @keyframes slideUp {
    from { transform: translateY(10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;

export const spin = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// Predefined transitions for interactive states
export const hoverTransition = `transition: all ${transitions.fast}`;
export const pageTransition = `transition: all ${transitions.normal}`;
```

#### Anti-duplication rules for styles

1. **Never hardcode design values** — Every color, spacing, breakpoint, font-size, and shadow must come from `tokens.ts`. If a value doesn't exist in tokens, add it there first.
2. **One repeated pattern = one mixin** — If a set of 3+ CSS properties appears in 2+ components, extract to `mixins.ts`.
3. **Breakpoints only from media** — Don't write `@media (max-width: 768px)` directly. Use the `media` object from mixins.
4. **Shared animations** — Don't redefine `@keyframes` in each component. Import from `animations.ts`.
5. **Component styles alongside the component** — Styles specific to a component live in `ComponentName.styles.ts`, not in global CSS files.
6. **Minimal global styles** — Only CSS reset, base body typography, and CSS custom properties in `globalStyles.ts`.

#### CSS duplication signals for the AI

If the AI detects any of these patterns, it should alert and refactor:

| Duplication signal | Correct action |
|---|---|
| A hex/rgb color appears in 2+ files | Add to `tokens.ts` as a semantic token |
| `@media` with the same breakpoint in 3+ files | Use `media` from `mixins.ts` |
| Same set of flexbox properties in multiple components | Extract to a mixin in `mixins.ts` |
| `@keyframes` defined in more than one file | Move to `animations.ts` |
| Font-size or font-family written as a literal value | Reference `typography` from `tokens.ts` |
| Spacing with magic values (`padding: 17px`) | Use tokens from `spacing` |

---

## 4. Naming Conventions {#4-naming}

### 4.1 Files

| File type | Pattern | Example |
|---|---|---|
| Service (business logic) | `verbNoun.service.ts` | `createUser.service.ts` |
| Query/data query | `verbNoun.query.ts` | `getUserById.query.ts` |
| Domain validations | `domain.validation.ts` | `user.validation.ts` |
| Types/interfaces | `domain.types.ts` | `payment.types.ts` |
| Constants | `domain.constants.ts` | `auth.constants.ts` |
| Routes/endpoints | `domain.routes.ts` | `user.routes.ts` |
| Shared utility | `verbNoun.ts` | `formatCurrency.ts` |
| UI component (React) | `PascalCase.tsx` | `Button.tsx` |
| Component styles | `PascalCase.styles.ts` | `Button.styles.ts` |
| Design tokens | `tokens.ts` | `tokens.ts` |
| Style mixins | `mixins.ts` | `mixins.ts` |
| CSS animations | `animations.ts` | `animations.ts` |
| Global styles | `globalStyles.ts` | `globalStyles.ts` |
| Hook (React) | `useNoun.ts` | `useAuth.ts` |
| Middleware | `nameMiddleware.ts` | `authMiddleware.ts` |
| Configuration | `name.ts` | `database.ts` |
| Test | `*.test.ts` or `*.spec.ts` | `createUser.service.test.ts` |
| Barrel/index | `index.ts` | `index.ts` |

### 4.2 Functions and variables

| Element | Pattern | Example |
|---|---|---|
| Action function | `verbNoun` | `createUser()`, `formatCurrency()` |
| Boolean function | `is/has/can + Adjective` | `isValidEmail()`, `hasPermission()` |
| Data retrieval function | `get/fetch/find + Noun` | `getUserById()`, `fetchPayments()` |
| Constant | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Type/Interface | `PascalCase` | `UserProfile`, `PaymentRequest` |
| Enum | `PascalCase` | `UserRole`, `PaymentStatus` |

### 4.3 Folders

- **features/**: camelCase, plural noun → `users/`, `payments/`, `notifications/`
- **shared/**: camelCase, descriptive category → `formatting/`, `validation/`, `http/`
- **UI Components**: PascalCase → `Button/`, `Modal/`, `UserCard/`

---

## 5. CLAUDE.md Configuration {#5-claudemd}

### 5.1 Ready-to-use template (Full-Stack Monorepo)

The following template is placed as `CLAUDE.md` at the monorepo root. Adapt the sections marked with `[ADAPT]`.

The complete template is in the **CLAUDE-TEMPLATE.md** file included alongside this guide. It uses XML tags (`<tag>`) for behavioral directives (anti-duplication protocol, variation rule, transparency, self-maintenance, post-compact, CSS rules) and standard markdown for reference information (architecture, naming, available modules).

**Why XML tags for behavioral directives?** XML tags have explicit scope (opening and closing), which eliminates ambiguity about where a rule starts and ends. Additionally, Claude tends to treat content within XML tags as more atomic and self-contained instructions — similar to the format of internal system prompts.

**Why markdown for reference information?** The project structure, naming conventions, and module list are data the AI consults as reference. Markdown is more readable, renders well in editors, and doesn't need the semantic "weight" of a tag.

Template structure:

```
Behavioral directives (XML tags):
  <protocolo_anti_duplicacion>  ← 4-step search protocol
  <regla_de_variacion>          ← Parameterize vs create new
  <regla_de_ubicacion>          ← Where each type of code goes
  <regla_de_transparencia>      ← Inform, ask, report
  <auto_mantenimiento>          ← Update CLAUDE.md and barrels
  <post_compact>                ← What to do after a session summary
  <reglas_css>                  ← Style anti-duplication

Reference information (Markdown):
  ## Project architecture          ← Structure, compilation, conventions
  ## Available modules             ← Updatable inventory of shared/ and common/
  ## Technology stack              ← Technologies and versions
  ## Additional rules              ← Complementary general rules
```

> **Available template files:**
> - `CLAUDE-TEMPLATE.md` — Full version (~140 lines) with detailed naming
> - `CLAUDE-TEMPLATE-COMPACT.md` — Minimalist version (~45 lines) for projects where context is a critical resource

### 5.2 Complementary directives for global CLAUDE.md

These directives go in the global CLAUDE.md (`~/.claude/CLAUDE.md`) and apply to all projects. XML tags are used because they are behavioral directives:

```markdown
<habitos_anti_duplicacion>
Applies to all projects:
- Before creating new code, search if similar functionality already exists in the project.
- If you find something similar but not identical, extend/parameterize instead of creating a new variant.
- Prioritize reuse over recreation.
- If a file exceeds ~150 lines, suggest splitting it.
- If you detect duplicate code between files, inform the user.
- Review the index.ts/barrel files of relevant folders before creating new functionality.
- If the user requests functionality without mentioning existing code, ask if something similar already exists.
- After a compact/summary, re-read the barrels of the modules you're working on.
</habitos_anti_duplicacion>
```

### 5.3 Compact version of CLAUDE.md (projects with limited context)

For projects where context is a critical resource (large projects, sessions with many open files), use the minimalist version in **CLAUDE-TEMPLATE-COMPACT.md** (~45 lines vs ~140 of the full version). It sacrifices naming detail for brevity but maintains all essential behavioral XML tags:

- `<protocolo_anti_duplicacion>` — Condensed 4-step protocol
- `<regla_de_variacion>` — Parameterize vs create new
- `<auto_mantenimiento>` — Update CLAUDE.md and barrels
- `<post_compact>` — Post-session summary
- `<reglas_css>` — Style anti-duplication

Reference information (structure, location, files, modules) is maintained in markdown but condensed to the essentials.

---

## 6. Working Practices {#6-practices}

### 6.1 When starting a new project (Monorepo)

1. Create the monorepo structure with `packages/backend/`, `packages/frontend/`, `packages/common/`
2. Configure root `package.json` with npm workspaces
3. Configure root CLAUDE.md with the template from Section 5
4. Implement `packages/common/` FIRST with base types and validations
5. Create empty barrel files (index.ts) in each folder of each package
6. Verify that independent compilation works: `build:common`, `build:backend`, `build:frontend`

### 6.2 When starting a development session

Claude Code reads CLAUDE.md automatically. If the file lists the available modules in shared/ and common/, the AI already "knows" what exists without searching.

**Tip:** When giving instructions, specify which package you're working in and include context:
```
❌ "Add RUT formatting to the form"
✅ "In packages/frontend, add RUT formatting. We already have formatting utilities in shared/formatting/"
✅ "In packages/backend, create user endpoint. The UserCreate and UserResponse types already exist in @project/common"
```

### 6.3 When requesting new functionality

- **Specify the package:** Indicate whether the work is in backend, frontend, or common
- If you know related code already exists, mention it with its exact location
- If you're unsure: "Before implementing, search if something similar already exists in common/ and in the package's shared/"
- For shared types: "This type is needed on both sides, create it in packages/common/"
- For cross-domain functionality within a package: "Create this in the current package's shared/"

### 6.4 Periodic duplication review

Periodically (or when finishing a large feature), run this request:

```
"Analyze the complete monorepo and detect:
1. Duplicate types or interfaces between packages/backend/ and packages/frontend/ that should be in common/
2. Duplicate or very similar functions between features within each package
3. Code that should be in shared/ because it's used in 2+ features of the same package
4. Duplicate validations between backend and frontend that should be in common/
5. Files that exceed 150 lines and should be split
6. Barrel files (index.ts) that are not up to date
List findings with file paths."
```

### 6.5 CLAUDE.md maintenance

Update the "Available shared modules" section whenever:
- A new module is created in `packages/common/`
- Something is created in any package's `shared/`
- Code is moved from features/ to shared/ or from a package to common/
- Shared functionality is renamed or removed

This is the most important step for long-term prevention: it keeps the "map" updated so the AI knows what exists and where.

---

## 7. Progressive Refactoring Guide {#7-refactoring}

For existing projects that don't follow this architecture, do NOT try to migrate everything at once. Follow this incremental approach:

### Phase 1: Set up the monorepo and CLAUDE.md (immediate)
- Create package structure: `packages/backend/`, `packages/frontend/`, `packages/common/`
- Configure npm workspaces in root `package.json`
- Add root CLAUDE.md with anti-duplication directives
- Document the current project structure (even if it's not ideal)
- List the modules/utilities that already exist in each package

### Phase 2: Create packages/common/ with shared types (high priority)
- Identify types used in both frontend AND backend
- Move those types to `packages/common/src/types/`
- Move common validations to `packages/common/src/validation/`
- Configure imports from `@project/common`

### Phase 3: New features with new structure (from now on)
- All NEW code follows the conventions in this guide
- Each new feature is created with small files and barrel files
- Shared types are created directly in common/

### Phase 4: Refactor on touch (gradual)
- When modifying an existing file, evaluate if it can be split
- When finding duplication between front and back, move to common/
- When finding duplication within a package, move to its shared/
- Only move code to shared/ that is confirmed to be reused

### Phase 5: Cleanup by domain (when opportunity arises)
- Choose one domain/feature at a time
- Split large files into small files
- Create barrel files
- Update imports
- Update CLAUDE.md

### What NOT to do
- Do not try to migrate the entire project at once
- Do not create shared/ or common/ preventively with code that "might" be reused
- Do not move code used by only 1 feature to shared/
- Do not duplicate types between frontend and backend (they must go in common/)
- Do not create premature abstractions to "prevent" future duplication

---

## 8. Quick Checklist {#8-checklist}

### When creating a new project (Monorepo)
- [ ] Create monorepo structure: packages/backend/, packages/frontend/, packages/common/
- [ ] Configure npm workspaces in root package.json
- [ ] Implement packages/common/ with base types and validations
- [ ] Configure root CLAUDE.md with anti-duplication template
- [ ] Verify independent compilation of each package
- [ ] Create initial barrel files in each folder

### When working on a feature
- [ ] Check in common/ if related types or validations already exist
- [ ] Check in the current package's shared/ if similar functionality already exists
- [ ] Create small files (max ~150 lines) with descriptive names
- [ ] Update the barrel file (index.ts) when creating new files
- [ ] If a type is needed in both front and back, create it in common/
- [ ] If code is used in 2+ features of the same package, move to shared/
- [ ] In frontend: use tokens from shared/styles/ for colors, spacing, and breakpoints (never hardcode)

### When ending a session
- [ ] Update shared modules in CLAUDE.md if something new was created in shared/ or common/
- [ ] Verify that duplicate types were not created between frontend and backend

### Periodic review
- [ ] Search for duplicate types between packages/backend/ and packages/frontend/ → move to common/
- [ ] Search for duplicate code between features within each package
- [ ] Identify files that exceed 150 lines
- [ ] Verify that barrel files are up to date across all packages
- [ ] Confirm that CLAUDE.md reflects the current state of the project
- [ ] Search for hardcoded colors, breakpoints, or spacing in components → replace with tokens

---

> **Note:** This document is a base version v1.0. It is designed to improve iteratively with real development experience. After applying it on 2-3 projects, review what works, what doesn't, and update accordingly.
