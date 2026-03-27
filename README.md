<p align="center">
  <img src="logo/aicodesight-logo-v10-static.png" alt="AICodeSight" width="360" />
</p>

<h3 align="center">AI code duplication stops here.</h3>
<p align="center"><strong>Built for <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a></strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/aicodesight"><img src="https://img.shields.io/npm/v/aicodesight?color=0891b2&label=npm" alt="npm version" /></a>
  <a href="https://github.com/mldixdev/aicodesight/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-d97706" alt="license" /></a>
  <img src="https://img.shields.io/node/v/aicodesight?color=0891b2" alt="node version" />
</p>

---

## The Problem

AI coding assistants are powerful — but they're **blind to your codebase**. They can't see your existing utilities, your naming conventions, or the function you wrote last week that does exactly what they're about to create from scratch.

The result? **Duplicate code. Everywhere.**

- A new `formatDate()` when one already exists in `src/utils/`
- A second `UserService` because the AI didn't know about the first
- Inconsistent naming, broken conventions, growing entropy

This isn't an AI problem. It's a **visibility** problem.

## The Solution

**AICodeSight** generates an architectural metadata layer that makes your codebase visible to AI assistants. It scans your project, catalogs every export, maps dependencies, and produces machine-readable artifacts that AI assistants consult before writing a single line of code.

```
Your Code → aicodesight init → AI can see everything → No more duplicates
```

It also installs **runtime guards** — hooks that intercept AI actions in real-time and block duplication before it happens.

## Features

- **Inventory & Registry** — Catalogs every file, export, and type signature in your project
- **Capability Index** — Enriched descriptions of what each function does and why it exists
- **Duplicate Detection** — Finds existing duplicates and resolves canonical locations
- **Dependency Mapping** — Tracks who imports what, identifies critical files
- **Guard Pipeline** — Runtime hooks that detect and prevent duplication as AI writes code
- **Convention Enforcement** — Validates naming patterns, file sizes, and structural rules
- **Session Memory** — Persists context across AI session compactions
- **Pattern Modules** — Stack-specific best practices (Expo/React Native, Supabase BaaS, shadcn/Tailwind, .NET Minimal API, TanStack Query)
- **CLAUDE.md Generation** — Produces structured directives tailored to your project

## Quick Start

### Step 1: Initialize

```bash
npx aicodesight init
```

AICodeSight detects your project type, analyzes the codebase, and generates the architectural layer. After init, your CLAUDE.md has structure, conventions, and guards — but module descriptions are empty.

### Step 2: Enrich

Run an enrichment session: the AI reads your source code, understands each function's purpose, and writes a description for every entry in the capability index. These descriptions are then included in CLAUDE.md, giving Claude full visibility into what your codebase does — not just where things are, but why they exist — **reducing the chance of creating duplicate functionality.**

```bash
claude -m sonnet "Follow the instructions in .claude/enrich-capability-index.md"
```

Sonnet is recommended for this task — it's cost-effective and the instructions are self-contained.

### Step 3 (optional): Semantic Duplication Guard

Install semantic duplication detection — catches similar functions even with different names, using AI embeddings:

```bash
npm install @xenova/transformers
```

Requires enriched descriptions (Step 2) — entries without descriptions are skipped.

### Step 4: Update

Regenerate CLAUDE.md so it includes the enriched module descriptions:

```bash
npx aicodesight update              # without semantic guard
npx aicodesight update --embeddings  # with semantic guard (requires step 3)
```

### Ongoing

As your code evolves, run `aicodesight update` periodically to keep artifacts in sync. New entries will appear without descriptions — run another enrichment session to describe them, then update again to include them in CLAUDE.md.

## CLI Commands

### `aicodesight init`

Diagnose the project and generate the full architectural layer.

```bash
aicodesight init [directory]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--type <type>` | Project type: `auto`, `new`, `legacy` | `auto` |
| `--hooks <mode>` | Guard mode: `yes` (block), `warn` (advise), `no` | `warn` |
| `--dry-run` | Preview without writing files | `false` |
| `--no-blueprint` | Skip architectural blueprint | — |
| `--no-interactive` | Skip prompts, use auto-detection | — |
| `--embeddings` | Enable semantic duplication guard (requires `@xenova/transformers` and enriched descriptions) | `false` |

### `aicodesight audit`

Deep analysis of duplication, size, conventions, and progress.

```bash
aicodesight audit [directory]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--focus <focus>` | What to analyze: `duplication`, `size`, `naming`, `all` | `all` |
| `--format <format>` | Output: `console`, `md`, `json` | `console` |
| `--output <file>` | Save result to file | — |

### `aicodesight update`

Regenerate artifacts from the current code state.

```bash
aicodesight update [directory]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--only <target>` | What to update: `claude-md`, `inventory`, `duplicates`, `hooks`, `registry`, `memory`, `all` | `all` |
| `--dry-run` | Preview without writing files | `false` |
| `--embeddings` | Enable semantic duplication guard (requires `@xenova/transformers` and enriched descriptions) | `false` |

## What Gets Generated

After running `aicodesight init`, you'll find a `.claude/` directory with:

```
.claude/
├── inventory.json          # Every file, its exports, line counts
├── inventory.md            # Human-readable inventory
├── registry.json           # Module-organized export catalog with type signatures
├── capability-index.json   # Enriched function descriptions with intent metadata
├── capability-index.md     # Human-readable capability index
├── duplicates.json         # Known duplicates with canonical resolution
├── duplicates.md           # Human-readable duplicate report
├── dependency-map.json     # Import/export dependency graph
├── dependency-map.md       # Human-readable dependency map
├── hooks/                  # Guard pipeline
│   ├── runner.js           # Guard orchestrator
│   ├── guard-config.json   # Guard configuration
│   ├── duplication.js      # Blocks duplicate exports
│   ├── convention.js       # Enforces naming conventions
│   ├── structural.js       # Detects structural duplication
│   ├── dependency.js       # Detects circular imports
│   ├── coherence.js        # Validates file coherence
│   ├── intent-*.js         # Intent declaration & similarity guards
│   ├── size.js             # File size alerts
│   └── ...
├── settings.json           # Hook configuration
├── working-memory.json     # Session persistence
├── aicodesight-meta.json   # Init metadata
├── enrich-capability-index.md  # Enrichment session instructions
└── embeddings-cache.json   # BGE-small embeddings (if --embeddings enabled)

CLAUDE.md                   # AI directives (project root)
.claudeignore               # Patterns to exclude from AI context
```

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                   aicodesight init                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. DETECT        Scan project structure            │
│     ↓             Identify language, framework      │
│                                                     │
│  2. ANALYZE       Build inventory of all exports    │
│     ↓             Map dependencies between files    │
│                   Detect existing duplicates        │
│                                                     │
│  3. GENERATE      Create registry & capability      │
│     ↓             index (descriptions empty until   │
│                   enrichment session)               │
│                                                     │
│  4. GUARD         Install runtime hooks that        │
│     ↓             intercept AI actions in real-time │
│                                                     │
│  5. TEMPLATE      Generate CLAUDE.md with project-  │
│                   specific directives & conventions  │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Result: AI sees structure, exports, and guards.    │
│  Run enrichment session to add descriptions.        │
└─────────────────────────────────────────────────────┘
```

## Supported Stacks

- **Languages:** TypeScript, JavaScript, C#
- **Frameworks:** React, Expo/React Native, Next.js, Vue, Angular, .NET (ASP.NET Core)
- **Backend/BaaS:** Supabase, Firebase, Express, Fastify, NestJS
- **Libraries:** TanStack Query, Zustand, shadcn/ui, Tailwind CSS, React Hook Form, Zod, Prisma, EF Core

Pattern modules provide stack-specific guidance for: **Expo/React Native**, **Supabase BaaS**, **shadcn/Tailwind**, **.NET Minimal API**, and **TanStack Query**.

## Requirements

- **Node.js** >= 18
- **Built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — generates CLAUDE.md, hooks, and guards designed for the Claude Code ecosystem

## Contributing

Contributions are welcome! This project is in early development — if you find a bug or have an idea, please [open an issue](https://github.com/mldixdev/aicodesight/issues).

## License

[Apache License 2.0](LICENSE) — Use it freely. Keep the attribution. Indicate changes. Don't use the name to sell your fork.

Copyright 2025-2026 AICodeSight Contributors.

---

<p align="center">
  Built by <a href="https://github.com/mldixdev">mldix</a><br/>
  <sub>detect &middot; prevent &middot; deduplicate</sub>
</p>
