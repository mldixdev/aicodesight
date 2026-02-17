# Real-World Applicability: When to Use What and How to Migrate Existing Projects

> **Version:** 1.0 — Practical analysis document
> **Context:** The previous guides describe an ideal state. This document addresses two critical questions:
> 1. Is the AI-Friendly architecture always used? Is it a prerequisite?
> 2. How does this apply to an existing project with high duplication, large files, and no structure?

---

## Table of Contents

1. [The Uncomfortable Truth: Architecture Is Not a Prerequisite](#1-the-uncomfortable-truth)
2. [The Three Real Scenarios](#2-the-three-scenarios)
3. [Critical Scenario: The Messy Legacy Project](#3-legacy-project)
4. [Realistic Migration Strategy](#4-migration-strategy)
5. [What Works WITHOUT Changing the Architecture](#5-what-works-without-changing)
6. [What REQUIRES Gradual Changes](#6-what-requires-changes)
7. [The Complete Flow: From Chaos to Order](#7-complete-flow)
8. [Migration Antipatterns](#8-antipatterns)

---

## 1. The Uncomfortable Truth: Architecture Is Not a Prerequisite {#1-the-uncomfortable-truth}

**No.** The AI-Friendly architecture described in the guides is NOT a prerequisite. You don't need to reorganize your entire project to get benefits.

There is a fundamental distinction that the previous guides don't make explicit:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   LAYER 1: Strategies that work on ANY                  │
│            project structure (no changes required)       │
│                                                         │
│   LAYER 2: Conventions that improve the project          │
│            gradually (opportunistic changes)              │
│                                                         │
│   LAYER 3: Ideal architecture for new projects           │
│            or major refactorings                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

The current guides focus almost exclusively on **Layer 3** — the ideal state. But the real value for most projects lies in **Layers 1 and 2**.

### Analogy: The Gym

The AI-Friendly architecture is like an elite training plan: perfect if you're starting from scratch with a personal trainer. But if you haven't exercised in 2 years (legacy project), you don't start with that plan — you start by walking 20 minutes a day.

What we need to define is: **what are the "20 daily minutes" for a messy project?**

---

## 2. The Three Real Scenarios {#2-the-three-scenarios}

### Scenario A: New project from scratch

**Context:** No code exists. Starting from zero.

**Is the AI-Friendly architecture used?** Yes, in full. It's the ideal time to:
- Create the folder structure (`features/`, `shared/`)
- Set up CLAUDE.md with the full template
- Implement `shared/` before features
- Activate detection hooks from day 1

**Documents that apply directly:**
- `guia-anti-duplicacion-ia.md` — Full structure and principles
- `guia-anti-duplicacion-api.md` — If it's an API
- `CLAUDE-TEMPLATE.md` — Copy as CLAUDE.md
- `paradigma-radical.md` — Choose which paradigms to implement

**Effort:** Low (designed correctly from the start)

---

### Scenario B: Reasonably organized existing project

**Context:** Has folder structure, files of moderate size (100-300 lines), some duplication but manageable. Perhaps organized by technical type (`controllers/`, `services/`) instead of by domain.

**Is the AI-Friendly architecture used?** Partially. Layers 1 and 2 are applied:
- **Layer 1 (immediate):** CLAUDE.md with anti-duplication directives, `.claudeignore`, basic hooks
- **Layer 2 (gradual):** When touching code, move it toward the ideal structure. Create barrel files where they don't exist. Extract to `shared/` when duplication is detected.

**Effort:** Medium (gradual improvement)

---

### Scenario C: Messy legacy project

**Context:** The scenario you're asking about. Files of 500-2000+ lines. High duplication. No clear structure. Generic files (`utils.ts`, `helpers.ts`, `common.ts`). Business logic mixed with presentation logic. No types or inconsistent types.

**Is the AI-Friendly architecture used?** NOT directly. It needs a different strategy.

This is the scenario that deserves a deep analysis.

---

## 3. Critical Scenario: The Messy Legacy Project {#3-legacy-project}

### 3.1 Anatomy of the problem

A typical legacy project that the AI struggles with looks like this:

```
legacy-project/
├── src/
│   ├── utils.ts                    ← 800 lines, 40 mixed functions
│   ├── helpers.ts                  ← 600 lines, more mixed functions
│   ├── types.ts                    ← 400 lines, all project types
│   ├── constants.ts                ← 200 lines, all constants
│   ├── api.ts                      ← 1200 lines, all endpoints
│   ├── database.ts                 ← 500 lines, all queries
│   ├── auth.ts                     ← 300 lines, all auth mixed
│   ├── validation.ts               ← 400 lines, all validations
│   ├── components/
│   │   ├── App.tsx                 ← 600 lines
│   │   ├── Dashboard.tsx           ← 800 lines
│   │   ├── UserManagement.tsx      ← 1000 lines
│   │   └── PaymentForm.tsx         ← 500 lines
│   └── styles/
│       ├── global.css              ← 2000 lines, all CSS
│       └── variables.css           ← 50 lines (at least this)
```

### 3.2 Why the AI duplicates more in this scenario

| Problem | Why it causes duplication | Example |
|---|---|---|
| `utils.ts` with 800 lines | The AI won't read 800 lines to check if `formatCurrency()` already exists on line 437 | Creates a new `formatCurrency` in another file |
| No barrel files | The AI has no index of what exists | Cannot discover existing functionality |
| Generic names | `helpers.ts` doesn't say what it contains | The AI doesn't know it should look there |
| A single `types.ts` | 400 lines of mixed types. The AI reads it but compact loses the details | Creates duplicate types after compact |
| Mixed logic | `api.ts` has validation + routes + business logic + queries | The AI doesn't know where to look for what |
| Monolithic CSS | 2000 lines of CSS — the AI won't check if a style already exists | Duplicates selectors, colors, layouts |

### 3.3 The legacy-specific vicious cycle

```
Large files unreadable by the AI
    → The AI can't find what already exists
        → Creates new code (duplicate)
            → Files grow larger
                → Even harder for the AI to find things
                    → Even more duplication
```

**And here's the key insight:** Trying to apply the full AI-Friendly architecture to this project would be counterproductive. If you tell the AI "reorganize the entire project into features/", it will:

1. Consume the ENTIRE context window reading 800+ line files
2. Lose details during compact
3. Introduce bugs when moving code it doesn't fully understand
4. Create a massive migration that nobody can review
5. Probably **duplicate code in the process of "de-duplicating"**

---

## 4. Realistic Migration Strategy {#4-migration-strategy}

### Central Principle: Don't Reorganize. Make Visible.

The mistake is thinking that you must first reorganize and then the AI will stop duplicating. It's the other way around:

```
INCORRECT:
Reorganize project → The AI stops duplicating

CORRECT:
Make what exists visible → The AI stops duplicating → The project reorganizes gradually
```

**The problem is not the folder structure. The problem is VISIBILITY.** If the AI can know what exists without reading 800-line files, it stops duplicating — regardless of whether those files remain 800 lines long.

### The 5 Phases of Migration

```
Phase 0: Diagnosis (understand what's there)                  ← Doesn't touch code
Phase 1: Make visible (CLAUDE.md + registry/manifest)         ← Doesn't touch code
Phase 2: Defend (detection hooks)                             ← Doesn't touch code
Phase 3: Improve opportunistically (when touching, improve)   ← Touches code gradually
Phase 4: Surgically refactor (when convenient)                ← Touches code intentionally
```

**Phases 0, 1, and 2 DO NOT touch the project's code.** They only add metadata and tooling around it. This is critical: you gain value without risking breaking anything.

---

### Phase 0: Diagnosis — Understand What's There

**Objective:** Create a map of the current state, not the ideal state.

**Step 0.1 — Automated inventory**

Ask the AI to analyze the project and generate an inventory:

```
Prompt for the AI:

"Analyze this project and generate a complete inventory:

1. List all .ts/.tsx/.js/.jsx files with their line count
2. For files with more than 150 lines, list ALL exported functions/classes/types
3. Identify duplicate or very similar functions (same name or similar logic)
4. Identify duplicate types/interfaces
5. Identify repeated code patterns (similar code blocks in different files)

Output format: one markdown table per category.
Save the result in .claude/inventory.md"
```

**Result: `.claude/inventory.md`**

```markdown
# Project Inventory — 2025-01-30

## Files by size
| File | Lines | Exports | Status |
|---|---|---|---|
| src/api.ts | 1200 | 28 | Critical — too large |
| src/components/UserManagement.tsx | 1000 | 3 | Critical |
| src/utils.ts | 800 | 40 | Critical |
| src/components/Dashboard.tsx | 800 | 2 | Critical |
| src/helpers.ts | 600 | 25 | High |
| src/components/App.tsx | 600 | 1 | High |
| src/database.ts | 500 | 18 | High |
| src/components/PaymentForm.tsx | 500 | 2 | Medium |
| src/validation.ts | 400 | 15 | Medium |
| src/types.ts | 400 | 35 | Medium |
| src/auth.ts | 300 | 12 | Acceptable |
| src/constants.ts | 200 | 20 | Acceptable |

## Detected duplication
| Function/Pattern | Location 1 | Location 2 | Type |
|---|---|---|---|
| formatCurrency() | utils.ts:437 | helpers.ts:201 | Exact duplicate |
| validateEmail() | validation.ts:15 | auth.ts:180 | Similar (different regex) |
| formatDate() | utils.ts:89 | helpers.ts:340 | Duplicate with variation |
| getUserById() | database.ts:45 | api.ts:234 | Duplicated query |
| try/catch + error response | api.ts (12 occurrences) | — | Repeated pattern |
| pagination logic | database.ts:100, api.ts:500 | — | Duplicated logic |

## Functions in utils.ts (excerpt)
| Function | Line | Inferred description |
|---|---|---|
| formatCurrency | 437 | Formats number as currency |
| formatDate | 89 | Formats date |
| formatPhone | 112 | Formats phone number |
| debounce | 156 | Generic debounce |
| throttle | 178 | Generic throttle |
| deepClone | 203 | Deep clone of object |
| ... 34 more functions | ... | ... |
```

**Step 0.2 — Dependency map**

```
Prompt for the AI:

"Based on the inventory, generate a dependency map:
- Which file imports from which other file?
- Which functions from utils.ts and helpers.ts are used by which files?
- Which types from types.ts are used in which places?

Save in .claude/dependency-map.md"
```

**Cost of this phase:** One analysis session. Doesn't touch code. Produces 2 metadata files.

---

### Phase 1: Make Visible — CLAUDE.md for Legacy

**Objective:** Create a CLAUDE.md that reflects the REALITY of the project, not the ideal state.

**This is the most important thing to understand:** The CLAUDE.md for a legacy project should NOT describe the ideal architecture. It should describe **where things are right now**, however messy that may be.

**File: `CLAUDE.md` (legacy version)**

```markdown
# Project Directives

<protocolo_anti_duplicacion>
MANDATORY: Before creating ANY new function, type, or component:

1. This project has large files with many functions.
   BEFORE creating something new, search if it already exists:
   - Grep("[function_name]") in src/
   - Grep("[keyword]") in src/ (e.g.: if you need formatting → Grep("format"))

2. Key files to search (contain reusable functionality):
   - src/utils.ts → formatting functions, general helpers (800 lines, 40 functions)
   - src/helpers.ts → more helpers, some formatting (600 lines, 25 functions)
   - src/validation.ts → all validations (400 lines, 15 functions)
   - src/types.ts → all project types (400 lines, 35 types)
   - src/database.ts → all queries (500 lines, 18 functions)
   - src/auth.ts → authentication and authorization (300 lines, 12 functions)

3. READ the file .claude/inventory.md to see the complete inventory
   of available functions before creating something new.

4. If you don't find anything reusable → create new code,
   but REPORT that something new is being created.
</protocolo_anti_duplicacion>

<duplicacion_conocida>
WARNING: The project has existing duplication that hasn't been cleaned up yet.
Functions that exist in MULTIPLE places (use the first one):
- formatCurrency → use src/utils.ts:437, IGNORE src/helpers.ts:201
- validateEmail → use src/validation.ts:15, IGNORE src/auth.ts:180
- formatDate → use src/utils.ts:89, IGNORE src/helpers.ts:340
- getUserById → use src/database.ts:45, IGNORE src/api.ts:234

DO NOT create new versions of these functions.
</duplicacion_conocida>

<regla_de_variacion>
If you need functionality similar to something existing (e.g., formatCurrency but without decimals),
EXTEND the existing function by adding optional parameters.
DO NOT create a new variant.
</regla_de_variacion>

<archivos_grandes>
This project has large files. When modifying files with 300+ lines:
- Read the entire file before modifying.
- Don't add new functions to files that already have 10+ exported functions.
- If you need to create something new, create a SEPARATE file with a descriptive name.
- Gradually, new functions will go in their own files.
</archivos_grandes>

## Current project structure
<!-- This describes the REAL state, not the ideal one -->
- src/utils.ts → Formatting functions, general helpers
- src/helpers.ts → More helpers (there is overlap with utils.ts)
- src/types.ts → All types/interfaces
- src/constants.ts → All constants
- src/api.ts → All API endpoints
- src/database.ts → All queries
- src/auth.ts → Authentication
- src/validation.ts → Validations
- src/components/ → React components

## Detailed inventory
See .claude/inventory.md for the complete list of available functions.

## Known duplication
See <duplicacion_conocida> section above.
```

### Why This Works Without Changing Architecture

The AI now knows:
- **Where to look:** The large files are listed with their summarized contents
- **What's duplicated:** The `<duplicacion_conocida>` section is an explicit map
- **What NOT to do:** Don't create variants, don't add more functions to bloated files
- **Where the inventory is:** `.claude/inventory.md` has the complete catalog

**Not a single line of code was moved. Only visibility was added.**

---

### Phase 2: Defend — Hooks for Legacy

**Objective:** Prevent duplication from GROWING while working on the project.

The hooks from `paradigma-radical.md` (Immune System) work **regardless of the project structure**. They don't care whether the code is in `features/users/` or in an 800-line `utils.ts`.

**Simplified hook for legacy:**

```javascript
// scripts/legacy-guard.js
/**
 * Pre-creation hook adapted for legacy projects.
 * More permissive than the standard guard, but detects the most obvious cases.
 */

const { execSync } = require('child_process');

const content = process.argv[2]; // Proposed content

// Extract names of functions/types being created
const newExports = [...content.matchAll(/export\s+(function|const|class|type|interface)\s+(\w+)/g)]
  .map(m => m[2]);

if (newExports.length === 0) process.exit(0);

const warnings = [];

for (const name of newExports) {
  try {
    // Search if something with the same name already exists
    const results = execSync(
      `rg "(?:function|const|class|type|interface)\\s+${name}\\b" src/ --files-with-matches 2>/dev/null`,
      { encoding: 'utf-8' }
    ).trim();

    if (results) {
      const files = results.split('\n');
      warnings.push(`"${name}" already exists in: ${files.join(', ')}`);
    }
  } catch (e) {
    // Not found, ok
  }
}

if (warnings.length > 0) {
  console.error('⚠️  POSSIBLE DUPLICATION:');
  warnings.forEach(w => console.error(`   ${w}`));
  console.error('   Verify if you can reuse the existing one.');
  // In legacy, warn but DO NOT block (exit 0)
  // When the project matures, change to exit 1 to block
}

process.exit(0);
```

**Key difference from the hook for a new project:** In legacy, the hook **warns but does not block**. Blocking would be counterproductive because:
- There may be false positives (similar names that do different things)
- The project already has duplication — blocking everything would paralyze development
- The goal is to make duplication visible, not to forcefully prevent it

As the project gets cleaned up, the hook can become stricter.

---

### Phase 3: Improve Opportunistically

**Objective:** Every time a file is touched for any reason, improve it a little.

**Rule: "Boy Scout Rule" adapted for AI**

```markdown
<!-- Add to CLAUDE.md -->
<mejora_oportunista>
When you modify an existing file for a task:
1. If the function you're modifying could live in its own file →
   PROPOSE (don't do it automatically) extracting it to a separate file
2. If you detect duplicate code in the file → INFORM the user
3. If the file has functions you don't use that could be extracted → INFORM
4. DO NOT reorganize the entire file. Only improve what you touch.

Example: If asked to modify formatCurrency() in utils.ts:
- Modify formatCurrency() as requested
- PROPOSE: "formatCurrency could be extracted to src/formatCurrency.ts to improve
  discoverability. Would you like me to do it?"
- If the user accepts, extract ONLY that function, update imports
- DO NOT touch the other 39 functions in utils.ts
</mejora_oportunista>

<convenciones_naming_minimas>
When creating new files (whether by extraction or for new functionality),
use these conventions so that everything new is consistent and discoverable:

File naming:
| Type | Pattern | Example |
|---|---|---|
| Function/utility | verbNoun.ts | formatCurrency.ts, validateEmail.ts |
| Backend service | verbNoun.service.ts | createUser.service.ts |
| Query | domain.queries.ts | user.queries.ts |
| Controller | domain.controller.ts | user.controller.ts |
| Routes | domain.routes.ts | user.routes.ts |
| Validation | domain.validation.ts | user.validation.ts |
| Types | domain.types.ts | payment.types.ts |
| React component | PascalCase.tsx | UserCard.tsx |
| React hook | useName.ts | useAuth.ts |
| Test | [original].test.ts | formatCurrency.test.ts |

Function naming:
| Type | Pattern | Example |
|---|---|---|
| Action | verbNoun | createUser(), formatCurrency() |
| Boolean | is/has/can + Adjective | isValidEmail(), hasPermission() |
| Get data | get/fetch/find + Noun | getUserById(), fetchPayments() |
| Constant | UPPER_SNAKE_CASE | MAX_RETRY_COUNT |
| Type/Interface | PascalCase | UserProfile, PaymentRequest |

Location for new files:
- Functions extracted from utils/helpers → src/shared/[category]/ or src/[name].ts
- Extracted components → src/components/[ComponentName].tsx
- New endpoint → src/api/[name].ts (don't add to api.ts)
- When a folder accumulates 3+ related files → create index.ts (barrel)
</convenciones_naming_minimas>
```

### Concrete flow of opportunistic improvement (with conventions)

```
Session 1: "Add RUT formatting"
  → AI searches inventory.md → formatRut doesn't exist
  → AI applies convention: utility function → verbNoun.ts
  → AI creates src/formatRut.ts (not src/rut-formatter.ts, doesn't add to utils.ts)
  → AI proposes: "Should I extract formatCurrency from utils.ts to src/formatCurrency.ts?"
  → User accepts → AI extracts following convention: formatCurrency.ts
  → AI updates imports in the 18 files that used utils.formatCurrency
  → RESULT: utils.ts -20 lines. 2 discoverable functions with consistent naming.

Session 2: "Fix bug in email validation"
  → AI searches inventory.md → validateEmail exists in validation.ts:15 AND auth.ts:180
  → AI fixes in validation.ts:15 (the "canonical" version per CLAUDE.md)
  → AI proposes: "auth.ts has another validateEmail. Should I replace it with an import?"
  → User accepts → AI removes duplicate, adds import
  → AI proposes: "Should I extract validateEmail to src/shared/validation/validateEmail.ts?"
  → User: "Not yet, there's only one extracted validation. When there are 3 we'll create shared/"
  → RESULT: One less duplication. The function stays in validation.ts for now.

Session 5: "Add phone validation"
  → AI searches → validatePhone doesn't exist
  → AI remembers convention: validation → domain.validation.ts or validateName.ts
  → AI creates src/validatePhone.ts (own file)
  → There are already 2 extracted validations (validateEmail pending + validatePhone new)
  → Not yet reaching 3, shared/validation/ is not created yet.

Session 7: "Add RUT validation"
  → AI creates src/validateRut.ts
  → There are already 3 loose validation files: validateEmail (in validation.ts),
    validatePhone.ts, validateRut.ts
  → AI proposes: "There are 3 validations. Should I create src/shared/validation/ with index.ts?"
  → User accepts → AI creates:
      src/shared/validation/
      ├── validatePhone.ts    (moved)
      ├── validateRut.ts      (moved)
      └── index.ts            (barrel: export { validatePhone } ...)
  → validateEmail stays in the legacy validation.ts for now (will be moved when touched)

Session 10: "Add create orders endpoint"
  → AI sees that api.ts has 1200 lines
  → AI applies convention: service → verbNoun.service.ts
  → AI creates src/api/createOrder.service.ts (not "order-creation.js")
  → AI proposes: "Should I create a separate createOrder.routes.ts too?"
  → RESULT: The new code is born organized and with consistent naming.

Session 20:
  - utils.ts dropped from 800 to 400 lines
  - src/shared/formatting/ exists with formatCurrency.ts, formatDate.ts, formatRut.ts
  - src/shared/validation/ exists with validatePhone.ts, validateRut.ts
  - 5 new endpoints live in src/api/ with consistent naming
  - Everything new follows the same conventions → discoverable by Glob

Session 30:
  - utils.ts has 100 lines (5 very generic functions)
  - The project has a hybrid structure: legacy (reduced) + new (organized)
  - Naming conventions make Glob("**/*format*") find EVERYTHING
  - Conventions make Glob("**/*validate*") find EVERYTHING
```

**Migration happens as a side effect of normal work.** There is no "refactoring day". Each session improves the project a little.

---

### Phase 4: Surgical Refactoring

**Objective:** When a large file has been reduced enough by opportunistic improvement, do an intentional refactoring to complete the transition.

**When to activate this phase:**
- A file has dropped from 800 to 200 lines through opportunistic extraction
- A large change in a domain is coming (complete new feature)
- There's a sprint/period dedicated to tech debt

**Prompt for surgical refactoring:**

```
"Refactor src/utils.ts:

1. Read the entire file
2. Group the remaining functions by category (formatting, validation, calculation, etc.)
3. Extract each group to its own file: src/shared/[category]/[function].ts
4. Create barrel files (index.ts) for each folder
5. Update ALL imports in the project
6. Verify nothing breaks
7. Update .claude/inventory.md and CLAUDE.md

Do NOT do everything at once. Do ONE category at a time and verify after each one."
```

---

## 5. What Works WITHOUT Changing the Architecture {#5-what-works-without-changing}

This section is key. These strategies deliver **immediate** results without moving a single line of code:

### 5.1 CLAUDE.md describing the real state

| Component | Requires changing code? | Impact |
|---|---|---|
| `<protocolo_anti_duplicacion>` with real files listed | No | High |
| `<duplicacion_conocida>` with mapped duplicates | No | High |
| `<regla_de_variacion>` | No | Medium |
| `<archivos_grandes>` with specific directives | No | High |
| Inventory in `.claude/inventory.md` | No | Very high |

### 5.2 Registry / Codebase inventory

The `codebase-registry.json` or `inventory.md` works just as well for a legacy project:

```json
{
  "modules": {
    "utils.ts": {
      "description": "Legacy file with mixed functions",
      "exports": {
        "formatCurrency": { "signature": "(value: number) => string", "line": 437 },
        "formatDate": { "signature": "(date: Date) => string", "line": 89 },
        "formatPhone": { "signature": "(phone: string) => string", "line": 112 },
        "debounce": { "signature": "(fn: Function, ms: number) => Function", "line": 156 }
      }
    },
    "helpers.ts": {
      "description": "WARNING: has duplicate functions with utils.ts",
      "exports": {
        "formatCurrency": { "signature": "(amount: number) => string", "line": 201, "duplicate_of": "utils.ts:437" },
        "formatDate": { "signature": "(d: Date) => string", "line": 340, "duplicate_of": "utils.ts:89" }
      }
    }
  }
}
```

The AI reads this file and knows exactly what exists and what's duplicated — without reading the 800-line files.

### 5.3 `.claudeignore`

Works the same in legacy. Exclude node_modules, dist, locks, etc.

### 5.4 Warning hooks

Work regardless of the structure. They only search for duplicate names.

### 5.5 Session handoff

Works the same. At the end of each session, document what was discovered and what's still pending.

### Summary: Zero-code-change toolkit

```
.claude/
├── inventory.md              ← Inventory of everything that exists
├── dependency-map.md         ← Who uses what
├── session-handoff.md        ← Continuity between sessions
└── hooks/
    └── legacy-guard.js       ← Duplicate warning hook

CLAUDE.md                     ← Describes reality + anti-duplication directives
.claudeignore                 ← Excludes noise

Total cost: 0 lines of project code modified.
Benefit: The AI stops duplicating (or duplicates significantly less).
```

---

## 6. What REQUIRES Gradual Changes {#6-what-requires-changes}

These strategies require touching code, but are done **gradually**:

### 6.1 Extract functions to their own files

```
utils.ts (800 lines, 40 functions)
    ↓ gradual extraction (1-2 functions per session)
utils.ts (200 lines, 10 functions) + 30 files of 15-25 lines
```

**When:** Every time a function in utils.ts is touched
**How:** Extract to `src/[name].ts` or `src/shared/[category]/[name].ts`
**Rule:** The original file doesn't grow. It only shrinks.

### 6.2 Create barrel files

```
src/shared/
├── formatCurrency.ts
├── formatDate.ts
├── formatPhone.ts
└── index.ts          ← NEW: barrel that exports everything
```

**When:** When there are already 3+ extracted files in a folder
**How:** Create `index.ts` that exports all public items

### 6.3 Eliminate duplicates

```
Before:
  utils.ts:437 → formatCurrency()
  helpers.ts:201 → formatCurrency()  (duplicate)

After:
  shared/formatCurrency.ts → formatCurrency()  (canonical function)
  utils.ts → import { formatCurrency } from './shared/formatCurrency'
  helpers.ts → import { formatCurrency } from './shared/formatCurrency'
```

**When:** When touching either of the two files that have the duplicate
**How:** Extract the "canonical" version, replace both with imports

### 6.4 Split monolithic files

```
Before:
  api.ts (1200 lines, 28 endpoints)

After (gradual):
  api.ts (400 lines, 10 legacy endpoints)
  api/createOrder.ts (40 lines)
  api/processPayment.ts (50 lines)
  api/listUsers.ts (30 lines)
  ... new endpoints in their own files
```

**When:** When creating new endpoints or modifying existing endpoints
**How:** New ones go in their own files. Existing ones are extracted when touched.
**Rule:** api.ts only shrinks, never grows.

---

## 7. The Complete Flow: From Chaos to Order {#7-complete-flow}

### Realistic timeline for a legacy project

```
DAY 1 — Phase 0+1 (Diagnosis + Visibility)
├── Generate inventory with the AI (.claude/inventory.md)
├── Generate dependency map (.claude/dependency-map.md)
├── Create CLAUDE.md that describes reality
├── Create .claudeignore
└── Result: The AI already knows what exists and where

DAY 2 — Phase 2 (Defense)
├── Set up legacy-guard.js hook
├── Verify the hook warns correctly
└── Result: New duplication is detected

WEEKS 1-4 — Phase 3 (Opportunistic improvement)
├── Each session extracts 1-2 functions from large files
├── Duplicates are resolved when touched
├── The inventory is updated
├── Large files shrink gradually
└── Result: The most-touched files start becoming organized

MONTH 2-3 — Phase 3 continues + selective Phase 4
├── utils.ts already dropped from 800 to 300 lines
├── helpers.ts was eliminated (everything extracted or deduplicated)
├── shared/ folders with barrel files start appearing
├── Surgical refactoring is done on the first module (e.g., auth)
└── Result: Parts of the project already have modern structure

MONTH 4-6 — Consolidation
├── 70% of code is in files with < 150 lines
├── Monolithic files only contain rarely-used functions
├── New features are born with the correct architecture
├── CLAUDE.md now describes a cleaner real structure
└── Result: The project increasingly resembles the ideal state
```

### Progress metrics

| Metric | Initial state | Month 1 goal | Month 3 goal | Month 6 goal |
|---|---|---|---|---|
| Files > 500 lines | 6 | 4 | 1 | 0 |
| Files > 150 lines | 12 | 10 | 5 | 2 |
| Known duplicates | 15 | 12 | 5 | 0 |
| Functions with own file | 0 | 15 | 40 | 60+ |
| Barrel files | 0 | 2 | 6 | 10+ |
| % code in features/ | 0% | 10% | 40% | 70%+ |

---

## 8. Migration Antipatterns {#8-antipatterns}

### What NOT to do with a legacy project

#### Antipattern 1: "Big Bang Refactor"

```
❌ "Reorganize the entire project according to the AI-Friendly architecture"

Problems:
- The AI consumes the entire context window reading large files
- High probability of introducing bugs
- Impossible to review (PR with 200 changed files)
- If it fails midway, the project ends up worse than before
```

#### Antipattern 2: "Ideal architecture from day 1"

```
❌ Create empty features/shared/common structure and start moving everything

Problems:
- Empty folders add no value
- Moving code without understanding it introduces bugs
- Imports break in cascade
- The team doesn't understand the new structure
```

#### Antipattern 3: "Duplicate to avoid touching legacy"

```
❌ Create new modern files without eliminating the legacy ones

Problems:
- Now there are TWO versions of everything: legacy and "new"
- The AI doesn't know which to use
- The project doubles in size
- Worse than the initial state
```

#### Antipattern 4: "Idealistic CLAUDE.md"

```
❌ Write a CLAUDE.md that describes the ideal architecture, not the real one

Problems:
- The AI looks in features/users/ but it doesn't exist
- The AI doesn't look in utils.ts because it's not mentioned
- The directives don't match reality
- The AI gets confused and duplicates more
```

#### Antipattern 5: "Automate everything before having anything"

```
❌ Create scripts for registry generation, manifests, dynamic CLAUDE.md
   before having a basic inventory

Problems:
- Over-engineering on a project that doesn't even have a CLAUDE.md
- The scripts assume a structure that doesn't exist
- Wasted effort if the project changes direction
```

### The golden rule of migration

**First make it visible. Then make it better. Never the other way around.**

```
Visible:  CLAUDE.md + inventory + hooks              → The AI stops duplicating
Better:   Small files + barrel files                   → The AI discovers faster
Ideal:    features/ + shared/ + conventions            → The AI almost never needs to search
```

Each stage provides value on its own. You don't need to reach "Ideal" to get 80% of the benefit. "Visible" alone already solves most of the duplication.

---

## Decision Diagram: What Should I Do with My Project?

```
Is it a new project?
├── YES → Use the full AI-Friendly architecture (existing guides)
│         + Choose paradigms from paradigma-radical.md
│         + Set up hooks from day 1
│
└── NO → Does the project follow some domain-based structure?
         ├── YES → Scenario B: gradual improvement
         │         Phase 1: CLAUDE.md describing the real structure
         │         Phase 2: Detection hooks
         │         Phase 3: Opportunistic improvement when touching code
         │
         └── NO → Are the files > 300 lines with mixed functions?
                  ├── YES → Scenario C: messy legacy project
                  │         Phase 0: Diagnosis (inventory)
                  │         Phase 1: Legacy CLAUDE.md + inventory
                  │         Phase 2: Warning hooks
                  │         Phase 3: Opportunistic extraction
                  │         Phase 4: Surgical refactoring (when convenient)
                  │
                  └── NO → Scenario B: gradual improvement (see above)
```

---

> **Conclusion:** The AI-Friendly architecture is NOT a prerequisite. It's a destination. The path to get there depends on where you are. For a legacy project, the first step is not to reorganize — it's to make visible what already exists. The tools (CLAUDE.md, inventory, hooks) work on any project structure. Reorganization happens naturally as a side effect of daily work.
