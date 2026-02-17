# Radical Rethinking: Beyond Conventions

> **Version:** 0.1 — Speculative / exploratory document
> **Premise:** Everything documented so far is **defensive** — we tell the AI "don't duplicate" through rules, structure, and naming. What if the problem isn't that the AI needs better rules, but that the interaction paradigm itself is wrong?

---

## The Uncomfortable Diagnostic

Current guidelines assume that duplication is solved with:
1. Small, well-named files -> the AI discovers by name
2. Barrel files as a map -> the AI reads an index
3. CLAUDE.md with rules -> the AI obeys instructions
4. Strict conventions -> the AI doesn't improvise

This works. But it has a ceiling: **it depends on the AI reading, searching, remembering, and obeying**. Each of those verbs consumes context and is probabilistic — the AI *might* not search, *might* forget after a compact, *might* interpret the rule differently.

**Radical question:** What if we stop relying on the AI to "do the right thing" and instead design a system where **doing the wrong thing is structurally impossible or immediately detectable**?

---

## Table of Contents

1. [Paradigm 1: The Codebase as an Immune System](#1-immune-system)
2. [Paradigm 2: Progressive Disclosure — The Codebase with Zoom Levels](#2-progressive-disclosure)
3. [Paradigm 3: Session Handoff Protocol — Persistent Memory Between Sessions](#3-session-handoff)
4. [Paradigm 4: The Codebase as a Registry, Not a Filesystem](#4-registry)
5. [Paradigm 5: Generative Architecture — Code that Writes Code](#5-generative)
6. [Paradigm 6: Context Budget — Context as a Managed Finite Resource](#6-context-budget)
7. [Paradigm 7: Dynamic CLAUDE.md — Instructions that Mutate](#7-dynamic-claudemd)
8. [Paradigm 8: Codebase Knowledge Graph](#8-knowledge-graph)
9. [Paradigm Comparison](#comparison)
10. [Synergistic Combinations](#combinations)

---

## 1. Paradigm: The Codebase as an Immune System {#1-immune-system}

### The Idea

An immune system doesn't depend on viruses "deciding" not to attack. It detects invaders and neutralizes them automatically. Applied to code: we don't depend on the AI deciding not to duplicate — the system **detects and rejects** duplication in real time.

### How It Works

Claude Code supports **hooks** — shell commands that run automatically before or after certain AI actions. This allows building a reactive layer:

```
The AI attempts to create a file
    -> Pre-creation hook fires
        -> Script analyzes the proposed content
            -> Searches for similar functions/types in the codebase
                -> If potential duplication detected:
                    -> BLOCKS the creation
                    -> Returns message: "formatCurrency already exists in shared/formatting/. Use or extend that one."
                -> If no duplication detected:
                    -> Allows the creation
```

### Concrete Implementation

**File: `.claude/hooks.json`**

```json
{
  "hooks": {
    "preToolExecution": [
      {
        "tools": ["write", "edit"],
        "command": "node scripts/duplication-guard.js \"$FILE_PATH\" \"$CONTENT\""
      }
    ],
    "postToolExecution": [
      {
        "tools": ["write"],
        "command": "node scripts/post-create-audit.js \"$FILE_PATH\""
      }
    ]
  }
}
```

**File: `scripts/duplication-guard.js` (concept)**

```javascript
#!/usr/bin/env node
/**
 * Pre-creation hook: analyzes proposed content and searches for duplicates.
 * Runs BEFORE the AI writes the file.
 *
 * Strategy:
 * 1. Extract function/class/type names from the proposed content
 * 2. Search for similar names in the codebase (fuzzy matching)
 * 3. If match > threshold -> block with informative message
 * 4. If no match -> allow
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const [filePath, content] = process.argv.slice(2);

// 1. Extract exports/functions from proposed content
const exportPattern = /export\s+(function|const|class|type|interface)\s+(\w+)/g;
const proposedNames = [...content.matchAll(exportPattern)].map(m => m[2]);

if (proposedNames.length === 0) process.exit(0); // No exports, allow

// 2. For each name, search for similar ones in the codebase
for (const name of proposedNames) {
  try {
    // Exact search
    const exactResults = execSync(
      `rg "export (function|const|class|type|interface) ${name}[^a-zA-Z]" src/ --files-with-matches`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (exactResults) {
      const existingFiles = exactResults.split('\n').filter(f => f !== filePath);
      if (existingFiles.length > 0) {
        console.error(`DUPLICATION DETECTED: "${name}" already exists in:`);
        existingFiles.forEach(f => console.error(`   -> ${f}`));
        console.error(`   Reuse or extend the existing one instead of creating a new one.`);
        process.exit(1); // Block creation
      }
    }

    // Fuzzy search (similar names)
    const fuzzyPattern = name.replace(/([A-Z])/g, '.*$1').toLowerCase();
    const fuzzyResults = execSync(
      `rg -i "export (function|const|class|type|interface) .*${fuzzyPattern}" src/ --files-with-matches`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (fuzzyResults) {
      const similarFiles = fuzzyResults.split('\n').filter(f => f !== filePath);
      if (similarFiles.length > 0) {
        console.error(`POSSIBLE DUPLICATION: "${name}" is similar to something in:`);
        similarFiles.forEach(f => console.error(`   -> ${f}`));
        console.error(`   Check if you can extend/parameterize the existing one.`);
        // Don't block, just warn (exit 0)
      }
    }
  } catch (e) {
    // rg found nothing, ok
  }
}

process.exit(0); // Allow
```

**File: `scripts/post-create-audit.js` (concept)**

```javascript
#!/usr/bin/env node
/**
 * Post-creation hook: verifies that the new file follows conventions.
 * Runs AFTER the AI writes the file.
 *
 * Checks:
 * - Does the file exceed 150 lines?
 * - Does it have more than 1 main export?
 * - Was the barrel file updated?
 * - Does it use direct imports instead of barrel?
 */

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');
const warnings = [];

// Check 1: Lines
if (lines.length > 150) {
  warnings.push(`The file has ${lines.length} lines (recommended max: 150). Consider splitting.`);
}

// Check 2: Multiple main exports
const exports = content.match(/^export (function|const|class|type|interface) /gm);
if (exports && exports.length > 3) {
  warnings.push(`The file has ${exports.length} exports. Consider splitting into more specific files.`);
}

// Check 3: Barrel file updated
const dir = path.dirname(filePath);
const barrelPath = path.join(dir, 'index.ts');
if (fs.existsSync(barrelPath)) {
  const barrel = fs.readFileSync(barrelPath, 'utf-8');
  const fileName = path.basename(filePath, path.extname(filePath));
  if (!barrel.includes(fileName)) {
    warnings.push(`The barrel file ${barrelPath} doesn't export this module. Update index.ts.`);
  }
}

if (warnings.length > 0) {
  console.error('\nPost-creation audit:');
  warnings.forEach(w => console.error(`   ${w}`));
}
```

### Why It's Radical

- **Doesn't depend on the AI's willingness.** The hook always runs, regardless of whether the AI read the CLAUDE.md, whether the context was compacted, or whether it forgot to search.
- **Zero context cost.** Hooks do NOT consume context window. They are external processes.
- **Immediate feedback.** The AI receives the rejection in the moment, not at the end of a review.
- **Scalable.** Scripts can become more sophisticated without changing the directives.

### Limitations

- Claude Code hooks have specific capabilities and limitations — verify the available API
- Textual analysis (regex) doesn't understand deep semantics
- Can generate false positives that disrupt the flow
- Doesn't prevent conceptual duplication (same algorithm, different name)

---

## 2. Paradigm: Progressive Disclosure — The Codebase with Zoom Levels {#2-progressive-disclosure}

### The Idea

Maps don't show everything at once. At country level you see cities, at city level you see streets, at street level you see buildings. What if the codebase worked the same way? The AI starts with a high-level view (domains) and only "zooms in" where it needs to work.

### The Problem It Solves

The current approach treats all context as flat: the CLAUDE.md lists everything, barrels list everything, the AI must mentally filter what's relevant. This wastes context on information that doesn't apply to the current task.

**Example:** If the AI is working on `features/payments/`, it doesn't need to know that `shared/formatting/formatPhone.ts` exists. But the current CLAUDE.md lists all shared modules indiscriminately.

### How It Works

**Level 0 — World map (always visible):**

The root CLAUDE.md is an ultra-compact map that only shows domains and their relationships:

```markdown
# Project

## Domains
- auth -> login, registration, tokens
- users -> CRUD users, profiles
- payments -> processing, refunds, webhooks

## To work on a domain
Read the MANIFEST.md file inside the feature before writing code.
```

**Level 1 — Domain map (on demand):**

Each feature has a `MANIFEST.md` that serves as its "smart table of contents":

```markdown
# payments — Manifest

## Available operations
- processPayment(data: PaymentCreate): PaymentResponse — Processes a new payment
- refundPayment(paymentId: string, reason: string): RefundResponse — Refunds a payment
- getPaymentStatus(paymentId: string): PaymentStatus — Queries status

## Dependencies from shared/
- http/responseHelper -> format responses
- http/httpErrors -> NotFoundError, ValidationError
- database/pagination -> for listings

## Dependencies from common/
- types/payment.types -> PaymentCreate, PaymentResponse, RefundResponse
- constants/statusCodes -> PaymentStatus enum

## Validation
- paymentCreateSchema -> amount > 0, currency in ['CLP','USD'], method in ['card','transfer']
- refundSchema -> reason required, max 500 chars

## DO NOT duplicate (already exists)
- Email validation -> common/validation/validateEmail
- Currency formatting -> shared/formatting/formatCurrency (accepts { decimals, symbol, locale })
- Sensitive data hashing -> shared/auth/hashPassword
```

**Level 2 — Source code (only when implementing):**

The actual code files. The AI only opens them when it needs to implement or modify.

### The Innovation: MANIFEST.md as a Smart Contract

The MANIFEST.md is not passive documentation. It's a **contract** that:

1. **Declares what exists** -> the AI doesn't need to explore
2. **Declares what is reused** -> the AI knows which imports to use
3. **Declares what NOT to duplicate** -> explicit and contextual prevention
4. **Includes function signatures** -> the AI can use without reading the source code

**Context cost:** A ~30-line MANIFEST.md vs reading 6-8 code files (~500+ lines). Compression ratio ~15:1.

### Automatic MANIFEST.md Generation

So it's not a maintenance burden, the MANIFEST is generated automatically:

```javascript
// scripts/generate-manifest.js
/**
 * Reads the files of a feature and generates its MANIFEST.md
 * Extracts: exports, parameter types, imports from shared/ and common/
 *
 * Usage: node scripts/generate-manifest.js packages/backend/src/features/payments
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function generateManifest(featurePath) {
  const files = fs.readdirSync(featurePath).filter(f => f.endsWith('.ts') && f !== 'index.ts');
  const featureName = path.basename(featurePath);

  let manifest = `# ${featureName} — Manifest\n\n`;

  // Section: Operations
  manifest += '## Available operations\n';
  for (const file of files) {
    if (file.includes('.service.') || file.includes('.queries.')) {
      const content = fs.readFileSync(path.join(featurePath, file), 'utf-8');
      const exportFns = content.match(/export\s+(async\s+)?function\s+(\w+)\(([^)]*)\):\s*(\S+)/g);
      if (exportFns) {
        exportFns.forEach(fn => manifest += `- ${fn.replace('export ', '').replace('async ', '')}\n`);
      }
    }
  }

  // Section: Dependencies
  manifest += '\n## Dependencies from shared/\n';
  const sharedImports = new Set();
  for (const file of files) {
    const content = fs.readFileSync(path.join(featurePath, file), 'utf-8');
    const imports = content.match(/from\s+['"]@\/shared\/([^'"]+)['"]/g);
    if (imports) imports.forEach(imp => sharedImports.add(imp.replace(/from\s+['"]@\/shared\//, '').replace(/['"]/, '')));
  }
  sharedImports.forEach(imp => manifest += `- ${imp}\n`);

  // Section: Dependencies from common/
  manifest += '\n## Dependencies from common/\n';
  const commonImports = new Set();
  for (const file of files) {
    const content = fs.readFileSync(path.join(featurePath, file), 'utf-8');
    const imports = content.match(/from\s+['"]@proyecto\/common['"]/g);
    if (imports) commonImports.add('common');
  }
  // ... extract specific imported types

  fs.writeFileSync(path.join(featurePath, 'MANIFEST.md'), manifest);
  return manifest;
}
```

**Auto-generation hook:**

```json
// package.json
{
  "scripts": {
    "manifest:generate": "node scripts/generate-manifest.js",
    "manifest:all": "node scripts/generate-all-manifests.js"
  }
}
```

### Workflow with Progressive Disclosure

```
1. The AI reads CLAUDE.md (Level 0)           -> 20 lines, knows which domains exist
2. User: "Add Stripe webhook to payments"
3. The AI reads payments/MANIFEST.md (Level 1) -> 30 lines, knows what exists, what to reuse
4. The AI opens only the files it needs to modify (Level 2) -> minimal context
5. Total context: ~60 lines of "map" + only the files it touches
   vs current: ~140 lines of CLAUDE.md + exploration of multiple files
```

---

## 3. Paradigm: Session Handoff Protocol {#3-session-handoff}

### The Idea

In a hospital, when a doctor finishes their shift, they don't leave the next doctor guessing what happened. There's a **handoff protocol**: which patients there are, what treatment they're on, what's pending. What if every Claude Code session ended with a structured handoff for the next one?

### The Problem It Solves

Root cause #1 of duplication: **loss of context between sessions**. The CLAUDE.md is static — it doesn't know what happened in the last session. After a compact, the AI loses all discovered context.

### How It Works

**At the end of each session (or before a compact), the AI generates:**

```markdown
<!-- .claude/session-handoff.md — Auto-generated at the end of each session -->

# Session Handoff — 2025-01-30 14:32

## Last work performed
- Created: features/payments/stripeWebhook.handler.ts
- Modified: features/payments/payment.routes.ts (added /webhook route)
- Modified: features/payments/index.ts (export of new handler)

## Code discovered during session
- shared/http/asyncWrapper already handles Stripe errors (don't create a new wrapper)
- features/payments/payment.types.ts has StripeEvent but is missing RefundEvent
- common/constants/statusCodes.ts does NOT have webhook states — they're needed

## Pending work
- [ ] Add RefundEvent to payment.types.ts
- [ ] Add webhook states to statusCodes.ts
- [ ] Tests for stripeWebhook.handler.ts
- [ ] Update payments MANIFEST.md

## Warnings for the next session
- The webhook handler uses crypto.timingSafeEqual to validate signatures — DO NOT reimplement
- The /webhook route must NOT have authMiddleware (Stripe doesn't send JWT)
```

### The Innovation: Handoff as Part of the CLAUDE.md

The CLAUDE.md could include a directive:

```markdown
<session_handoff>
When starting a session, if .claude/session-handoff.md exists, read it BEFORE any task.
When ending a session or before compact, generate/update .claude/session-handoff.md with:
1. Which files were created/modified
2. What existing code was discovered (to avoid re-discovering it)
3. What's pending
4. Specific warnings for the next session
</session_handoff>
```

### Implementation with Hooks

```json
{
  "hooks": {
    "sessionEnd": [
      {
        "command": "node scripts/generate-handoff.js"
      }
    ],
    "sessionStart": [
      {
        "command": "cat .claude/session-handoff.md 2>/dev/null || echo 'No previous handoff.'"
      }
    ]
  }
}
```

### Evolution: Cumulative Handoff

Not just the last handoff — a compact history of the last N sessions:

```markdown
# Session History (last 5 sessions, most recent first)

## 2025-01-30 — Stripe webhooks
Created: stripeWebhook.handler.ts | Pending: tests, RefundEvent type

## 2025-01-29 — Refund flow
Created: refundPayment.service.ts | Discovered: asyncWrapper handles Stripe errors

## 2025-01-28 — Payment processing
Created: processPayment.service.ts, payment.validation.ts | Note: Zod validation in common/
```

**Cost:** ~20-30 lines. Contains the essentials of 5 work sessions.

---

## 4. Paradigm: The Codebase as a Registry {#4-registry}

### The Idea

npm doesn't search for packages by guessing file paths. It has a **registry** — a centralized index where each package has a name, version, description, and API. What if the codebase had its own internal registry?

### The Problem It Solves

The current approach (barrel files + naming conventions) is an **implicit registry**. The AI must reconstruct the inventory by reading multiple index.ts files. An explicit registry is a pre-built inventory that the AI reads in one go.

### How It Works

**Auto-generated file: `codebase-registry.json`**

```json
{
  "version": "2025-01-30T14:32:00Z",
  "modules": {
    "shared/http": {
      "description": "Helpers for controllers and HTTP error handling",
      "exports": {
        "responseHelper": {
          "type": "object",
          "methods": {
            "success": "(data: T, meta?: PaginationMeta) => ApiSuccessResponse<T>",
            "error": "(code: string, message: string, fields?: Record<string,string>) => ApiErrorResponse"
          }
        },
        "asyncWrapper": {
          "type": "function",
          "signature": "(fn: AsyncRequestHandler) => RequestHandler",
          "description": "Wrap async controller with automatic try/catch"
        },
        "NotFoundError": {
          "type": "class",
          "extends": "HttpError",
          "constructor": "(message?: string)"
        },
        "UnauthorizedError": {
          "type": "class",
          "extends": "HttpError",
          "constructor": "(message?: string)"
        },
        "ValidationError": {
          "type": "class",
          "extends": "HttpError",
          "constructor": "(message: string, fields?: Record<string,string>)"
        }
      }
    },
    "shared/formatting": {
      "description": "Data formatting for UI presentation",
      "exports": {
        "formatCurrency": {
          "type": "function",
          "signature": "(value: number, opts?: { decimals?: number, symbol?: string, locale?: string }) => string",
          "description": "Currency formatting. Supports any currency via parameters."
        },
        "formatDate": {
          "type": "function",
          "signature": "(date: Date | string, format?: 'short' | 'long' | 'iso') => string"
        },
        "formatPhone": {
          "type": "function",
          "signature": "(phone: string, countryCode?: 'CL' | 'US' | 'ES') => string"
        }
      }
    },
    "features/payments": {
      "description": "Payment processing, refunds, and webhooks",
      "exports": {
        "processPayment": {
          "type": "function",
          "signature": "(data: PaymentCreate) => Promise<PaymentResponse>"
        },
        "refundPayment": {
          "type": "function",
          "signature": "(paymentId: string, reason: string) => Promise<RefundResponse>"
        }
      },
      "depends_on": ["shared/http", "shared/database", "common/types/payment"]
    }
  }
}
```

### The Innovation: The AI Reads the Registry, Not the Filesystem

```markdown
<!-- In CLAUDE.md -->
<registry>
Before creating new code, read codebase-registry.json.
This file contains the complete codebase inventory with function signatures.
If what you need already exists in the registry, use it directly.
The registry is automatically updated with each build.
</registry>
```

**Flow:**

```
1. The AI needs to format currency
2. Reads codebase-registry.json (1 file, ~200 lines)
3. Finds: formatCurrency(value, { decimals, symbol, locale })
4. Knows the parameters without opening the source file
5. Uses directly: import { formatCurrency } from '@/shared/formatting'
```

**vs current approach:**

```
1. The AI needs to format currency
2. CLAUDE.md says "search in shared/"
3. Glob("**/*format*") -> finds formatCurrency.ts
4. Reads formatCurrency.ts to see what parameters it accepts
5. Uses the function
-> 3 operations that consume context vs 1 registry read
```

### Automatic Generation

```javascript
// scripts/generate-registry.js
/**
 * Generates codebase-registry.json by analyzing barrel files (index.ts)
 * and extracting type signatures from each export.
 *
 * Requires: typescript compiler API to extract types
 * Runs: as pre-commit hook or in CI
 */

const ts = require('typescript');
const fs = require('fs');
const glob = require('glob');

function extractExports(filePath) {
  const program = ts.createProgram([filePath], { target: ts.ScriptTarget.ES2020 });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filePath);
  const exports = {};

  ts.forEachChild(sourceFile, node => {
    if (ts.isExportDeclaration(node) || (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))) {
      const name = node.name?.text;
      const type = checker.getTypeAtLocation(node);
      exports[name] = {
        type: type.getCallSignatures().length > 0 ? 'function' : 'object',
        signature: checker.typeToString(type),
      };
    }
  });

  return exports;
}

// Find all index.ts (barrels)
const barrels = glob.sync('src/**/index.ts');
const registry = { version: new Date().toISOString(), modules: {} };

for (const barrel of barrels) {
  const modulePath = barrel.replace('/index.ts', '').replace('src/', '');
  registry.modules[modulePath] = {
    exports: extractExports(barrel),
  };
}

fs.writeFileSync('codebase-registry.json', JSON.stringify(registry, null, 2));
```

### Key Difference from Enriched Barrel Files

Enriched barrel files (complementary-strategies.md, section G) are comments in code that a human maintains. The registry is an **automatically generated artifact** that:

- Requires no manual maintenance
- Includes exact type signatures (not approximations in comments)
- Is a single file vs N distributed barrel files
- Is JSON, so the AI can parse it semantically

---

## 5. Paradigm: Generative Architecture {#5-generative}

### The Idea

What if the AI didn't write implementation code but **intent declarations**, and a system generated the implementation?

### Concept: Declare, Don't Implement

Instead of the AI writing:

```typescript
// createUser.service.ts — The AI writes ALL this implementation
import { responseHelper } from '@/shared/http';
import { hashPassword } from '@/shared/auth';
import { db } from '@/shared/database';
import { UserCreate, UserResponse } from './user.types';
import { userCreateSchema } from './user.validation';

export async function createUser(data: UserCreate): Promise<UserResponse> {
  const validated = userCreateSchema.parse(data);
  const hashedPassword = await hashPassword(validated.password);
  const user = await db.user.create({
    data: { ...validated, password: hashedPassword },
  });
  return responseHelper.success(user);
}
```

The AI writes a **declaration**:

```typescript
// createUser.declaration.ts — The AI only declares intent
import { defineOperation } from '@/core/defineOperation';

export const createUser = defineOperation({
  name: 'createUser',
  domain: 'users',
  type: 'mutation',

  input: 'UserCreate',          // type from common/
  output: 'UserResponse',       // type from common/
  validation: 'userCreateSchema', // schema from the feature

  steps: [
    { action: 'validate', schema: 'userCreateSchema' },
    { action: 'transform', field: 'password', using: 'hashPassword' },
    { action: 'persist', model: 'user' },
  ],

  errorCases: [
    { when: 'emailAlreadyExists', throw: 'ConflictError', message: 'Email already registered' },
  ],
});
```

And `defineOperation` generates the implementation:

```typescript
// core/defineOperation.ts — Framework that generates implementations
export function defineOperation<TInput, TOutput>(config: OperationConfig<TInput, TOutput>) {
  return async function(data: TInput): Promise<ApiResponse<TOutput>> {
    // 1. Automatic validation
    if (config.validation) {
      const schema = resolveSchema(config.validation);
      schema.parse(data);
    }

    // 2. Automatic transformations
    let transformed = { ...data };
    for (const step of config.steps.filter(s => s.action === 'transform')) {
      transformed[step.field] = await resolveTransform(step.using)(transformed[step.field]);
    }

    // 3. Automatic persistence
    const persistStep = config.steps.find(s => s.action === 'persist');
    if (persistStep) {
      const result = await db[persistStep.model].create({ data: transformed });
      return responseHelper.success(result);
    }
  };
}
```

### Why It's Radical

- **Duplication is structurally impossible.** `defineOperation` always uses `responseHelper`, always validates, always handles errors — the AI can't "forget".
- **The AI writes ~15 declarative lines instead of ~30 imperative lines.** Less code = less context = less opportunity to duplicate.
- **Conventions are codified, not documented.** They don't depend on the AI reading CLAUDE.md.

### Limitations

- Requires a custom framework (`defineOperation`)
- Complex operations may not fit the declarative model
- Learning curve for the human team
- The AI must learn the declarative DSL

### More Pragmatic Variant: Builders

If `defineOperation` is too opinionated, a more flexible version:

```typescript
// core/operationBuilder.ts
export function operation(name: string) {
  return {
    input: <T>(schema: ZodSchema<T>) => ({
      handler: (fn: (validated: T, ctx: OperationContext) => Promise<any>) => {
        return asyncWrapper(async (req, res) => {
          const validated = schema.parse(req.body);
          const result = await fn(validated, { db, services });
          return responseHelper.success(res, result);
        });
      }
    })
  };
}

// Usage — the AI only writes the business logic
export const createUser = operation('createUser')
  .input(userCreateSchema)
  .handler(async (data, { db, services }) => {
    const hashed = await services.hashPassword(data.password);
    return db.user.create({ data: { ...data, password: hashed } });
  });
```

The builder ensures that validation always happens, responseHelper is always used, asyncWrapper always wraps — without depending on the AI remembering it.

---

## 6. Paradigm: Context Budget {#6-context-budget}

### The Idea

The AI's context is a finite resource, like RAM. But nobody manages it as such. What if we treated context as an explicit budget?

### Concept: Context Budget Manager

A system that monitors how much context has been consumed and optimizes what information to load:

```
Total Context Window:     200K tokens
+-- System/instructions:   ~10K (fixed)
+-- CLAUDE.md:              ~2K (fixed)
+-- Conversation:          ~20K (grows)
+-- Files read:            ~30K (controllable)
+-- Available:            ~138K
```

### Implementation: Smart Loading

Instead of the AI reading complete files, a script pre-processes and delivers only what's relevant:

```javascript
// scripts/context-optimizer.js
/**
 * Given a work domain, generates an optimized "context pack"
 * that contains only the relevant information.
 *
 * Usage: node scripts/context-optimizer.js payments
 * Output: .claude/context-pack.md
 */

function generateContextPack(domain) {
  const pack = [];

  // 1. Domain manifest (if it exists)
  const manifest = readIfExists(`features/${domain}/MANIFEST.md`);
  if (manifest) pack.push(manifest);

  // 2. Domain types (signatures only, not implementation)
  const types = extractTypeSignatures(`features/${domain}/${domain}.types.ts`);
  pack.push(`## ${domain} types\n${types}`);

  // 3. Direct dependencies (signatures only)
  const deps = getDependencies(`features/${domain}/`);
  for (const dep of deps) {
    const signatures = extractExportSignatures(dep);
    pack.push(`## ${dep} (dependency)\n${signatures}`);
  }

  // 4. Unrelated modules (names only, to avoid duplication)
  const otherModules = getAllModules().filter(m => !deps.includes(m));
  pack.push(`## Other modules (do not duplicate)\n${otherModules.map(m => `- ${m}`).join('\n')}`);

  return pack.join('\n\n---\n\n');
}
```

**Result: a ~100-line "context pack" that replaces the manual exploration of ~20 files.**

### The Metaphor: Context Budget as Memory Management

| Memory Concept | Context Equivalent |
|---|---|
| Total RAM | Total context window |
| Resident program | CLAUDE.md + system instructions |
| Heap allocation | Files read by the AI |
| Garbage collection | Compact / session summary |
| Memory leak | Files read that aren't used |
| Page file / swap | Session handoff (context persisted to disk) |
| Memory-mapped file | Registry / context pack (efficient access) |
| Cache hit | Barrel file that resolves without opening source file |
| Cache miss | Glob + Read of complete file to find a signature |

Thinking about context as memory changes design decisions: **optimize for cache hits (barrels, registry, manifests) and minimize page faults (source file reads).**

---

## 7. Paradigm: Dynamic CLAUDE.md {#7-dynamic-claudemd}

### The Idea

Why is CLAUDE.md a static file written by humans? What if it were a **dynamically generated** file that adapts to the current project state?

### Concept: CLAUDE.md as a Build Artifact

```
Codebase state (source code)
    -> generation script
CLAUDE.md (auto-generated, always up-to-date)
```

### Implementation

```javascript
// scripts/generate-claude-md.js
/**
 * Generates CLAUDE.md from the current codebase state.
 * Runs as pre-commit hook or in CI.
 *
 * Generated sections:
 * 1. Behavioral directives (static template)
 * 2. Architecture (detected from filesystem)
 * 3. Available modules (extracted from barrel files)
 * 4. Technology stack (extracted from package.json)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

function generateClaudeMd() {
  let md = '';

  // --- Part 1: Directives (static, from a template) ---
  md += fs.readFileSync('.claude/directives-template.md', 'utf-8');
  md += '\n\n---\n\n';

  // --- Part 2: Detected structure ---
  md += '## Project structure\n\n';

  const packages = glob.sync('packages/*/').map(p => path.basename(p));
  if (packages.length > 0) {
    md += `Monorepo with packages: ${packages.join(', ')}\n\n`;
  }

  for (const pkg of packages) {
    const features = glob.sync(`packages/${pkg}/src/features/*/`).map(f => path.basename(f));
    if (features.length > 0) {
      md += `### ${pkg}\n`;
      md += `Features: ${features.join(', ')}\n\n`;
    }
  }

  // --- Part 3: Available modules (auto-detected) ---
  md += '## Available shared modules\n\n';

  // Read barrel files from shared/ and common/
  const sharedBarrels = glob.sync('packages/*/src/shared/*/index.ts');
  for (const barrel of sharedBarrels) {
    const content = fs.readFileSync(barrel, 'utf-8');
    const exports = content.match(/export\s+\{[^}]+\}/g) || [];
    const moduleName = barrel.replace('/index.ts', '').replace('packages/', '').replace('/src/', '/');

    md += `### ${moduleName}\n`;
    const exportNames = content.match(/export\s+\{?\s*(\w+)/g)?.map(e => e.replace(/export\s+\{?\s*/, '')) || [];
    md += exportNames.map(e => `- ${e}`).join('\n');
    md += '\n\n';
  }

  // common/
  const commonBarrel = glob.sync('packages/common/src/*/index.ts');
  if (commonBarrel.length > 0) {
    md += '### common/\n';
    for (const barrel of commonBarrel) {
      const content = fs.readFileSync(barrel, 'utf-8');
      const category = path.basename(path.dirname(barrel));
      const exportNames = content.match(/export\s+\{?\s*(\w+)/g)?.map(e => e.replace(/export\s+\{?\s*/, '')) || [];
      md += `**${category}:** ${exportNames.join(', ')}\n`;
    }
    md += '\n';
  }

  // --- Part 4: Stack (from package.json) ---
  md += '## Technology stack\n\n';
  const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  const allDeps = {};
  for (const pkg of packages) {
    const pkgJson = JSON.parse(fs.readFileSync(`packages/${pkg}/package.json`, 'utf-8'));
    Object.assign(allDeps, pkgJson.dependencies || {});
  }

  const keyDeps = ['express', 'fastify', 'react', 'next', 'vue', 'prisma', '@prisma/client',
                   'zod', 'joi', 'vitest', 'jest', 'tailwindcss', 'styled-components'];
  const detected = keyDeps.filter(d => allDeps[d]);
  md += detected.map(d => `- ${d}: ${allDeps[d]}`).join('\n');

  return md;
}

fs.writeFileSync('CLAUDE.md', generateClaudeMd());
console.log('CLAUDE.md regenerated from the current codebase state.');
```

**Auto-generation hook:**

```json
// package.json
{
  "scripts": {
    "claude:generate": "node scripts/generate-claude-md.js"
  },
  "husky": {
    "hooks": {
      "pre-commit": "npm run claude:generate && git add CLAUDE.md"
    }
  }
}
```

### Why It's Radical

- **The CLAUDE.md never becomes outdated.** It's regenerated from the source code.
- **The "Available modules" section is always accurate.** It doesn't depend on someone (human or AI) updating it.
- **The technology stack is detected automatically.** No need to write it manually.
- **The behavioral directives remain human-written.** Only the reference part is auto-generated.

### Separation: Human vs Machine

```
.claude/directives-template.md    <- Written by humans (behavioral directives)
                                     Rarely changes
                                     XML tags: anti_dup, variacion, ubicacion, etc.

CLAUDE.md                          <- Auto-generated (merge of template + codebase state)
                                     Regenerated on each commit
                                     Always reflects reality
```

---

## 8. Paradigm: Codebase Knowledge Graph {#8-knowledge-graph}

### The Idea

Current documents treat the codebase as a folder structure. But code isn't a tree — it's a **graph**. Functions call other functions, types are used by multiple modules, services depend on other services. What if we represented this as a knowledge graph that the AI can query?

### Concept: Nodes and Edges

```
Nodes:
  - Function: { name, signature, module, file }
  - Type: { name, fields, module, file }
  - Module: { name, description, exports }
  - Domain: { name, features, dependencies }

Edges:
  - IMPORTS: Module A imports from Module B
  - USES_TYPE: Function X uses Type Y
  - CALLS: Function X calls Function Y
  - VALIDATES_WITH: Function X validates with Schema Z
  - BELONGS_TO: Function X belongs to Domain D
```

### Compact Representation for the AI

We don't need a graph database. A compact readable format:

```yaml
# codebase-graph.yaml (auto-generated)

domains:
  payments:
    operations:
      - processPayment: { in: PaymentCreate, out: PaymentResponse, validates: paymentCreateSchema }
      - refundPayment: { in: [paymentId, reason], out: RefundResponse }
    uses:
      - shared/http: [responseHelper, asyncWrapper, ValidationError]
      - shared/database: [pagination]
      - common/types: [PaymentCreate, PaymentResponse, RefundResponse]
    types:
      - StripeEvent: { fields: [type, data, signature] }
      - WebhookPayload: { fields: [eventType, paymentId, status] }

  users:
    operations:
      - createUser: { in: UserCreate, out: UserResponse, transforms: [hashPassword] }
      - updateUser: { in: UserUpdate, out: UserResponse }
      - deleteUser: { in: userId, out: void }
      - listUsers: { in: PaginatedRequest, out: PaginatedResponse<UserResponse> }
    uses:
      - shared/http: [responseHelper, asyncWrapper, NotFoundError]
      - shared/database: [pagination, queryBuilder]
      - shared/auth: [hashPassword]
      - common/types: [UserCreate, UserUpdate, UserResponse]

shared:
  http:
    responseHelper: { methods: [success, error], format: "{ success, data?, error? }" }
    asyncWrapper: "(AsyncHandler) => RequestHandler — auto try/catch"
    errors: [NotFoundError, UnauthorizedError, ValidationError, ConflictError]

  formatting:
    formatCurrency: "(value, { decimals?, symbol?, locale? }) => string"
    formatDate: "(date, format?: 'short'|'long'|'iso') => string"
    formatPhone: "(phone, country?: 'CL'|'US') => string"

  database:
    pagination: "(query, { page, pageSize }) => PaginatedResponse<T>"
    queryBuilder: "Fluent API for building filtered queries"

cross_references:
  hashPassword:
    defined_in: shared/auth
    used_by: [users/createUser, auth/register]
  validateEmail:
    defined_in: common/validation
    used_by: [users/createUser, users/updateUser, auth/register, auth/resetPassword]
  responseHelper:
    defined_in: shared/http
    used_by: [ALL_CONTROLLERS]
```

### The `cross_references` Section is the Key

It's the most powerful section for anti-duplication. It tells the AI:
- `hashPassword` is already used in `users` and `auth` -> don't create another
- `validateEmail` is used in 4 places -> definitely don't duplicate
- `responseHelper` is used by ALL controllers -> it's mandatory

**A human looks at folders. The AI should look at connections.**

### Graph Querying by the AI

```markdown
<!-- In CLAUDE.md -->
<knowledge_graph>
The file codebase-graph.yaml contains the project's dependency map.
Before creating new code:
1. Consult the section of the domain where you'll be working
2. Review cross_references for functionality that's already reused
3. If what you need appears in cross_references, USE IT
</knowledge_graph>
```

### Automatic Generation

Similar to the registry (Paradigm 4) but in YAML format oriented toward relationships, not inventory. Generated by analyzing imports and exports with the TypeScript compiler API.

---

## Paradigm Comparison {#comparison}

| # | Paradigm | Metaphor | Anti-dup | Context | Automation | Risk |
|---|---|---|---|---|---|---|
| 1 | Immune System | Antibodies that block viruses | **Very high** | Zero-cost | High (hooks) | False positives |
| 2 | Progressive Disclosure | Map with zoom | High | **Very high** | Medium (MANIFESTs) | Manifest maintenance |
| 3 | Session Handoff | Medical shift change | High | High | Low-Medium | Depends on discipline |
| 4 | Codebase Registry | npm registry | **Very high** | **Very high** | High (generated) | Generator complexity |
| 5 | Generative Architecture | Rails generators | **Maximum** | High | High (framework) | Over-engineering, rigidity |
| 6 | Context Budget | Memory management | Medium | **Maximum** | Medium | Conceptual complexity |
| 7 | Dynamic CLAUDE.md | Build artifacts | High | High | **Maximum** | Generation script |
| 8 | Knowledge Graph | Graph database | **Very high** | **Very high** | High (generated) | Generator complexity |

---

## Synergistic Combinations {#combinations}

The paradigms are not mutually exclusive. The most powerful combinations:

### Combo A: "The Autopilot" (1 + 7 + 4)

```
Detection hooks (Immune System)
  + Auto-generated CLAUDE.md (Dynamic)
    + Registry as source of truth (Registry)

Result: A system that self-documents, self-defends,
and the AI has an accurate inventory always up-to-date.
The AI can't duplicate because:
- The registry tells it what exists (prevention)
- The hooks block it if it tries (detection)
- The CLAUDE.md updates itself (zero maintenance)
```

### Combo B: "The Navigator" (2 + 8 + 6)

```
Progressive disclosure (zoom levels)
  + Knowledge graph (relationship map)
    + Context budget (resource management)

Result: The AI navigates the codebase like an interactive map.
Starts with a high-level view (domains),
zooms into the relevant domain (manifest),
queries relationships (graph) only when needed,
and everything is managed to not exceed the context budget.
```

### Combo C: "The Factory" (5 + 1 + 3)

```
Generative architecture (declarations)
  + Validation hooks (immune system)
    + Session handoff (continuity)

Result: The AI declares intentions instead of writing implementation.
The framework generates code that by design cannot be duplicated.
The hooks validate that declarations don't conflict with existing ones.
The handoff ensures continuity between sessions.
```

### Combo D: "The Effective Minimalist" (7 + 2 + 1)

```
Dynamic CLAUDE.md (always up-to-date)
  + MANIFEST.md per feature (local zoom)
    + A single pre-creation hook (basic guard)

Result: Minimal complexity, maximum pragmatic impact.
Doesn't require custom frameworks or complex generators.
Just: a script that regenerates CLAUDE.md, a manifest per feature,
and a hook that searches for duplicate names before creating files.
```

---

## Which One to Choose?

There's no universal answer. It depends on:

| Factor | Favors | Avoid |
|---|---|---|
| New project, small team | Combo C or D | Over-engineering with Combo A |
| Large existing project | Combo A or B | Radical changes like Combo C |
| Context as main bottleneck | Combo B | Paradigms that don't optimize context |
| Duplication as main problem | Combo A or C | Context-only paradigms |
| Minimum setup effort | Combo D | Any combo requiring custom framework |
| Maximum automation | Combo A | Paradigms requiring manual discipline |

---

> **Note:** This document is exploratory. The ideas here are deliberate provocations — not all are immediately practical, but all question assumptions of the current approach. The value lies in identifying which underlying principles are most powerful, not in implementing everything literally.
