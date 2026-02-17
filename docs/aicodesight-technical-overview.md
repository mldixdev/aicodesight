# AICodeSight — Technical Overview

> **Version:** 2.0
> **Status:** Reference Document
> **Scope:** Architecture, objectives, internals, and design rationale of the AICodeSight CLI tool

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem: Why AI Duplicates Code](#2-the-problem)
3. [The Solution: Making Code Discoverable](#3-the-solution)
4. [Architecture Overview](#4-architecture-overview)
5. [CLI Commands](#5-cli-commands)
6. [Analysis Pipeline](#6-analysis-pipeline)
7. [Artifact Generation](#7-artifact-generation)
8. [The Guard System](#8-the-guard-system)
9. [Session Memory & Context Persistence](#9-session-memory)
10. [The CLAUDE.md Template Engine](#10-claudemd-template-engine)
11. [Pattern Modules & Blueprint System](#11-pattern-modules)
12. [Semantic Embeddings (Optional)](#12-semantic-embeddings)
13. [Theoretical Foundations](#13-theoretical-foundations)
14. [Design Principles & Key Patterns](#14-design-principles)
15. [Internal Architecture Patterns](#15-internal-architecture)
16. [Technology Stack](#16-technology-stack)
17. [Supported Project Types](#17-supported-project-types)
18. [Workflows](#18-workflows)
19. [Glossary](#19-glossary)

---

## 1. Executive Summary {#1-executive-summary}

**AICodeSight** is a CLI tool that diagnoses software projects and generates an AI-friendly architectural layer — a set of metadata files, directives, and runtime guards — designed to prevent code duplication when working with AI coding assistants (primarily Claude Code).

It operates on a core insight: **AI duplicates code not because it wants to, but because it cannot see what already exists.** The solution is not better rules for the AI, but better visibility into the codebase.

### What it does

```
Source Code (any project)
    ↓ aicodesight init
Architectural Layer (.claude/ directory)
    ├── Inventory        — What files exist, what they export, how large they are
    ├── Registry         — Module-organized export catalog with type signatures
    ├── Capability Index — Enriched function/type descriptions with intent metadata
    ├── Duplicate Map    — Known duplicates with canonical resolution
    ├── Dependency Graph — Who imports from whom
    ├── Guard Pipeline   — Runtime hooks that detect and prevent duplication
    ├── Working Memory   — Session state persistence across compactions
    └── CLAUDE.md        — Project directives tailored to the codebase's reality
```

### What it is not

- Not a linter or formatter — it doesn't enforce code style
- Not a refactoring tool — it doesn't move or restructure code
- Not a code generator — it doesn't write application logic
- Not a replacement for good architecture — it makes existing architecture visible to AI

---

## 2. The Problem: Why AI Duplicates Code {#2-the-problem}

Code duplication by AI assistants is not a model deficiency. It is a structural consequence of how large language models interact with codebases. AICodeSight identifies seven root causes:

### 2.1 Context Loss Between Sessions

Each session starts without memory. After auto-compaction (summary), implementation details from prior work are lost. The AI re-implements functionality it previously discovered because it no longer "remembers" it exists.

### 2.2 Local Problem Resolution

The model optimizes for completing the immediate task. It prefers writing self-contained code over searching for existing dependencies. If the needed functionality isn't in the current context window, it creates it again.

### 2.3 Large Files as Black Boxes

A file with 500+ lines is expensive to process. Useful functions get buried and are not discovered by searches. Files named `utils.ts` or `helpers.ts` give no semantic signal about their contents.

### 2.4 Missing Explicit Directives

Without instructions in `CLAUDE.md` about reuse, the model doesn't prioritize searching for existing code. Without naming conventions or structure guidelines, it doesn't know where to look.

### 2.5 Ambiguous Requests

"Add validation to the form" doesn't indicate whether a validation system already exists. The model doesn't proactively ask "does something similar exist?" unless explicitly instructed.

### 2.6 Finite Context as Scarce Resource

Every file read, every search result, every instruction consumes context. When a task requires reading many files, the window saturates. Upon compaction, the AI loses visibility of code it had previously discovered.

### 2.7 Duplication by Variation

When the AI needs functionality similar but not identical to something existing, it creates a new function instead of extending the existing one. This produces proliferations like `formatCurrency()`, `formatCurrencyCLP()`, `formatCurrencyNoDecimals()`.

### The Vicious Cycle

```
More duplicated code
    → Larger project
        → More context consumed per session
            → Less existing code visible to the AI
                → More duplicated code
```

This cycle accelerates as the project grows. AICodeSight breaks it by making existing code **discoverable** without consuming context.

---

## 3. The Solution: Making Code Discoverable {#3-the-solution}

AICodeSight's approach is structured in three layers, each independent and additive:

### Layer 1 — Visibility (no code changes)

Make the codebase's contents visible to the AI through metadata:

| Artifact | Purpose |
|----------|---------|
| `CLAUDE.md` | Project directives: what exists, where to find it, what not to duplicate |
| `inventory.json/.md` | Complete file catalog with exports, sizes, classifications |
| `registry.json` | Module-organized export registry with type signatures |
| `capability-index.json` | Enriched function descriptions with intent metadata |
| `dependency-map.json/.md` | Import graph showing what depends on what |
| `duplicates.json/.md` | Known duplicates with canonical resolution |

### Layer 2 — Defense (no code changes)

Prevent duplication from growing through runtime guards:

| Mechanism | Function |
|-----------|----------|
| Duplication guard | Blocks creation of exports whose names already exist in the inventory |
| Convention guard | Validates naming conventions for new files and exports |
| Size guard | Warns when files exceed configurable thresholds |
| Intent similarity guard | Detects when new `@intent` headers match existing ones |
| Structural duplication guard | Identifies repeated code patterns within files |
| Dependency guard | Detects circular imports and zone violations |

### Layer 3 — Gradual Improvement (touches code opportunistically)

Improve the codebase incrementally through directives:

- **Boy Scout Rule**: Leave code a little better than you found it
- **Opportunistic extraction**: When modifying a function in a large file, propose extracting it to its own file
- **Barrel creation**: When 3+ files accumulate in a directory, create an `index.ts`
- **Parametrization over variation**: Extend existing functions instead of creating variants

### Key Insight: Visibility First, Structure Second

```
INCORRECT:
Reorganize project → AI stops duplicating

CORRECT:
Make existing code visible → AI stops duplicating → Project reorganizes gradually
```

The problem is not folder structure. The problem is **visibility**. If the AI can know what exists without reading 800-line files, it stops duplicating — regardless of whether those files remain 800 lines.

---

## 4. Architecture Overview {#4-architecture-overview}

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CLI Layer                          │
│  src/index.ts (Commander.js)                            │
│  Commands: init │ audit │ update                        │
└──────────┬──────────┬──────────┬────────────────────────┘
           │          │          │
┌──────────▼──────────▼──────────▼────────────────────────┐
│                   Command Layer                         │
│  src/commands/                                          │
│  init.ts │ audit.ts │ update.ts │ commandPipeline.ts    │
└──────────┬──────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│                   Analysis Pipeline                     │
│  src/analyzers/                                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐      │
│  │  Project   │  │ Inventory  │  │  Duplicate   │      │
│  │  Detector  │  │ Generator  │  │  Detector    │      │
│  └────────────┘  └────────────┘  └──────────────┘      │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐      │
│  │ Dependency │  │  Module    │  │  Registry    │      │
│  │  Mapper    │  │  Detector  │  │  Generator   │      │
│  └────────────┘  └────────────┘  └──────────────┘      │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐      │
│  │ Capability │  │ Canonical  │  │ Tech Stack   │      │
│  │  Indexer   │  │  Resolver  │  │  Profiler    │      │
│  └────────────┘  └────────────┘  └──────────────┘      │
│  ┌────────────┐                                         │
│  │  Domain    │                                         │
│  │  Context   │                                         │
│  └────────────┘                                         │
└──────────┬──────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│                   Generator Layer                       │
│  src/generators/                                        │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐      │
│  │ CLAUDE.md  │  │ Blueprint  │  │   Guard      │      │
│  │ Template   │  │ Generator  │  │  Pipeline    │      │
│  └────────────┘  └────────────┘  └──────────────┘      │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐      │
│  │  Markdown  │  │  Pattern   │  │  Hooks &     │      │
│  │  Writer    │  │  Modules   │  │  Memory      │      │
│  └────────────┘  └────────────┘  └──────────────┘      │
└──────────┬──────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│                    Output Layer                         │
│  .claude/ directory                                     │
│  ┌───────────────┐  ┌───────────────┐                   │
│  │  JSON + MD    │  │    Hooks      │                   │
│  │  Artifacts    │  │   Pipeline    │                   │
│  └───────────────┘  └───────────────┘                   │
│  CLAUDE.md (project root)                               │
└─────────────────────────────────────────────────────────┘
```

### Source Code Structure

```
src/
├── index.ts                    CLI entry point (Commander.js)
├── types.ts                    All type definitions (603 lines, 75 exports)
├── analyzers/                  Static analysis modules (18 files, 4088 lines)
├── commands/                   Command handlers (4 files, 891 lines)
├── generators/                 Output generators (11 files, 2894 lines)
│   ├── guards/                 Guard source generators (10 files, 2026 lines)
│   └── patterns/               Tech-stack-specific patterns (6 files, 701 lines)
├── templates/                  CLAUDE.md template system (2 files, 1468 lines)
├── embeddings/                 Semantic duplication (3 files, 301 lines)
├── reporters/                  Console + audit output formatting (3 files, 490 lines)
├── prompts/                    Interactive CLI prompts (1 file, 150 lines)
└── shared/                     Shared utilities (2 files, 58 lines)
```

### Data Flow

```
init command
  ├─→ detectProject()           → ProjectProfile
  ├─→ generateInventory()       → InventoryData
  ├─→ detectDuplicates()        → DuplicateData
  ├─→ mapDependencies()         → DependencyData
  ├─→ detectModules()           → ModuleMapData
  ├─→ generateRegistry()        → RegistryData
  ├─→ generateCapabilityIndex() → CapabilityIndexData
  ├─→ profileTechStack()        → TechStackProfile
  ├─→ analyzeDomainContext()    → DomainContext
  ├─→ resolveCanonicals()       → ResolvedDuplicate[]
  │
  ├─→ Write JSON + Markdown artifacts to .claude/
  ├─→ Generate CLAUDE.md via unified template
  ├─→ Generate guard pipeline (runner + 9 guards + config + memory)
  └─→ Configure hooks in .claude/settings.json
```

### Command Layer Internals

The `commandPipeline.ts` module provides shared infrastructure used by both `init` and `update`:

| Function | Purpose |
|----------|---------|
| `runAnalysisPipeline()` | Orchestrates the 6-step analysis (detect → inventory → duplicates → dependencies → modules → registry) |
| `readExistingJson<T>()` | Safe JSON file reading with fallback to `undefined` |
| `writeDualArtifact()` | Writes paired JSON + Markdown files with optional custom serializers |
| `serializeCapabilityIndex()` | One-entry-per-line serialization for capability-index.json |
| `serializeRegistry()` | One-export-per-line serialization for registry.json |
| `generateAndWriteCapabilityIndex()` | Generates capability index with merge preservation and writes JSON + MD |
| `setupHookPipeline()` | Configures guard pipeline + memory hooks + settings.json + aicodesight-settings.json |

---

## 5. CLI Commands {#5-cli-commands}

### `aicodesight init [directory]`

Full project diagnosis and architectural layer generation.

| Option | Default | Description |
|--------|---------|-------------|
| `--type <type>` | `auto` | Project type: `auto` (detected), `new`, `legacy` |
| `--hooks <mode>` | `warn` | Guard behavior: `yes` (block), `warn` (advise), `no` (disabled) |
| `--dry-run` | `false` | Preview without writing files |
| `--no-blueprint` | `false` | Skip architectural blueprint generation |
| `--no-interactive` | `false` | Skip interactive stack selection prompts |
| `--embeddings` | `false` | Enable semantic duplication guard (requires `@xenova/transformers`) |

**Output**: 25+ files in `.claude/` directory + `CLAUDE.md` at project root.

### `aicodesight update [directory]`

Incremental refresh of analysis artifacts. Preserves user customizations.

| Option | Default | Description |
|--------|---------|-------------|
| `--only <target>` | `all` | Selective update: `claude-md`, `inventory`, `duplicates`, `hooks`, `registry`, `memory`, `all` |
| `--dry-run` | `false` | Preview changes without writing |
| `--embeddings` | `false` | Enable/refresh semantic embeddings |

**Behavior**:
- Compares current state with previous analysis
- Reports new duplicates, resolved duplicates, file growth/shrinkage
- Preserves CLAUDE.md content outside `<!-- aicodesight:start/end -->` markers
- Merges guard configuration (adds new guards, preserves user-customized severities)
- Merges capability-index (preserves `enriched` and `declared` entries — see [Enrichment Merge Preservation](#enrichment-merge-preservation))
- Evolves section flags for growing `new` projects (see [Flag Evolution](#flag-evolution))

### `aicodesight audit [directory]`

Read-only analysis with reporting. Does not modify any files.

| Option | Default | Description |
|--------|---------|-------------|
| `--focus <focus>` | `all` | Analysis focus: `duplication`, `size`, `naming`, `all` |
| `--format <format>` | `console` | Output: `console` (colored terminal), `md` (markdown), `json` |
| `--output <file>` | (stdout) | Write report to file |

**Report sections**:
- **Duplication**: Duplicate exports, files with most duplicates
- **Size**: Oversized files (>350 lines), heavy exporters (>5 exports)
- **Conventions**: Naming violations, missing barrel files, compliance percentage
- **Progress**: Delta since last analysis (if previous data exists)

#### Audit Internals

The audit command runs its own analysis pipeline independently of stored artifacts, generating a fresh `InventoryData` on each run. The report is built as an `AuditReport` containing four sub-analyses (`duplication`, `size`, `conventions`, `progress`) and then formatted by one of two dedicated reporters:

| Reporter | File | Output |
|----------|------|--------|
| `formatConsole()` | `auditConsoleFormatter.ts` | Colored terminal output with chalk icons grouped by section, top-N limiting per section |
| `formatMarkdown()` | `auditMarkdownFormatter.ts` | Markdown tables and lists suitable for file export or AI consumption |

Both formatters respect the `--focus` flag, rendering only the requested section(s). The `--format json` option bypasses formatters entirely and serializes the raw `AuditReport` object.

The **progress** section is only available when previous `inventory.json` and `duplicates.json` exist in `.claude/` — it compares current vs stored data to detect new duplicates, resolved duplicates, file growth/shrinkage, and new/removed files.

Note: the `consoleReporter.ts` module (separate from `auditConsoleFormatter.ts`) handles init/update console output — spinners, summaries, and progress display during the analysis pipeline. The `createSpinner()` factory from this module is shared by all commands.

---

## 6. Analysis Pipeline {#6-analysis-pipeline}

The analysis pipeline is a six-step sequential process orchestrated by `runAnalysisPipeline()`.

### Step 1: Project Detection

Determines project metadata through heuristic analysis:

| Property | Detection Method |
|----------|-----------------|
| **Type** | `new` (<20 files), `legacy` (>30% generic names or avg >300 lines), `organized` (otherwise) |
| **Structure** | Monorepo (`packages/`, `lerna.json`, `pnpm-workspace.yaml`, `workspaces` in package.json, multiple `.csproj`) or single-package |
| **Language** | File extension ratio: TypeScript, JavaScript, C#, or mixed |
| **Frameworks** | `package.json` dependencies (React, Next, Vue, Express, etc.) and `.csproj` packages (.NET, EF Core, MediatR) |

### Step 2: Inventory Generation

Deep code analysis using `ts-morph` (TypeScript AST parser):

- **Exports**: Functions, classes, types, interfaces, enums, constants with full type signatures
- **Metrics**: Line count per file, export count
- **Classification**: `critical` (>800 lines), `high` (501–800), `medium` (351–500), `ok` (≤350)
- **Flags**: Generic file names (`utils`, `helpers`, `common`, `shared`, `misc`, `tools`, `lib`, `functions`, `utilities`, `helper`, `extensions`, `constants`, `globals`, `basecontroller`)
- **Fallback**: Regex-based extraction when ts-morph fails; custom C# parser for `.cs` files

### Step 3: Duplicate Detection

Identifies duplicate export names with intelligent categorization:

| Category | Criteria | Action |
|----------|----------|--------|
| `accidental` | Same name, same/similar signature, same stack | Reported — genuine duplicate to consolidate |
| `cross-stack` | Same name across .cs and .ts files | Reported separately as API mirror — not a bug |
| `polymorphic` | Same name, different signatures | Detected but **not reported** — different functions sharing a name |
| `barrel` | Re-export from `index.ts` | Filtered out — not reported |

The detector groups exports by name, deduplicates by file, separates barrel from non-barrel locations, and only reports groups with 2+ non-barrel locations. Cross-stack mirrors are routed to a separate `crossStackMirrors` array.

### Step 4: Dependency Mapping

Tracks import relationships:

- **JS/TS**: Parses `import` and `require` statements, resolves relative paths
- **C#**: Maps `using` directives to project-internal namespaces
- **Output**: Top-30 most-imported files with their importers

### Step 5: Module Detection

Identifies reusable code units:

| Module Type | Detection |
|-------------|-----------|
| `barrel` | Directory with `index.ts/js` exporting 3+ names |
| `csproj` | Each `.csproj` file with its public types |
| `package` | Each directory under `packages/` in monorepo |
| `directory` | Directory with 3+ files and 3+ exports (fallback) |

### Step 6: Registry Generation

Creates a module-organized export catalog:

```
modules[modulePath] → {
  type: 'barrel' | 'csproj' | 'package' | 'directory',
  description?: string,
  exports: { [name]: { type, file, line, signature } },
  dependsOn?: string[]
}
```

### Post-Pipeline: Capability Indexing

Enriches registry exports with semantic metadata:

- **Effect detection**: Scans for filesystem, HTTP, database, console, process side effects
- **Dependency extraction**: Identifies which project exports each function uses
- **`@intent` parsing**: Extracts structured metadata from JSDoc/XML doc comments
- **Entry states**: `extracted` (from AST), `enriched` (AI-enriched), `declared` (from `@intent` headers)

### Post-Pipeline: Canonical Resolution

For duplicate exports, determines which location is "canonical" using 9 weighted scoring signals:

| Signal | Weight | Logic |
|--------|--------|-------|
| S1: Semantic name match | +15 to +40 | Filename contains export name (+40 exact, +15 per semantic hit) |
| S2: Directory match | +12 | Folder name matches export keywords |
| S3: Shared/common location | +15 | Path includes `/shared/` or `/common/` |
| S4: Dependency relationship | +25 / −15 | This file is imported by the duplicate's file (+25), or imports from it (−15) |
| S5: Popularity | 0 to +18 | `min(importedByCount * 3, 18)` — established if 3+ importers |
| S6: Generic file penalty | −25 | `utils.ts`, `helpers.ts` penalized |
| S7: File focus (lines) | −12 to +10 | >500 lines: −12, >300: −6, ≤80: +10 |
| S7: File focus (exports) | −12 to +8 | >10 exports: −12, ≤3: +8 |
| S8: Cluster detection | 0 to +15 | Related exports in same file (+5 each, max 15) |
| S9: Signature awareness | +5 / −10 | Unique signature when others lack one: +5; divergent signatures: −10 |

**Confidence levels** based on score gap between top two candidates:
- `high` (gap ≥20): Clear winner — use directly
- `medium` (gap 10–19): Likely canonical, but mention uncertainty
- `low` (gap <10): Ambiguous — ask user

**Tiebreakers** when scores are equal: more importers wins, then fewer lines wins.

---

## 7. Artifact Generation {#7-artifact-generation}

AICodeSight produces artifacts in paired JSON + Markdown format (dual artifact pattern):

| Artifact | JSON | Markdown | Consumer |
|----------|------|----------|----------|
| Inventory | `inventory.json` | `inventory.md` | Guards (runtime) / Claude (readable) |
| Duplicates | `duplicates.json` | `duplicates.md` | Guards / Claude |
| Dependencies | `dependency-map.json` | `dependency-map.md` | Guards / Claude |
| Registry | `registry.json` | — | Guards / Claude (compact format) |
| Capability Index | `capability-index.json` | `capability-index.md` | Guards / Claude (compact format) |
| Pattern Index | `pattern-index.json` | `pattern-index.md` | Structural duplication guard |
| Structural Duplicates | — | `structural-duplicates.md` | Claude |
| Blueprint | — | `blueprint.md` | Claude |
| Enrichment Prompt | — | `enrich-capability-index.md` | User/Claude |

### Compact Serialization

Two files require special serialization to stay within Claude's Read tool limits (2,000 lines, 2,000 characters per line):

- **`capability-index.json`**: One entry per line (~1 line per entry, supports ~1,900 entries)
- **`registry.json`**: Compact format (~1.3 lines per export, supports ~1,500 exports)

This ensures Claude can read these files directly without truncation.

### Configuration & Metadata

| File | Purpose |
|------|---------|
| `aicodesight-meta.json` | Initialization metadata (type, frameworks, sections, timestamps) — used by `update` to know what to regenerate |
| `settings.json` | Claude Code hook configuration |
| `aicodesight-settings.json` | Source of truth for hook settings — used by `restore-settings.js` for recovery (see [Hook Recovery](#hook-recovery)) |
| `guard-config.json` | Guard severity configuration |
| `guard-memory.json` | Warning suppression tracking |
| `working-memory.json` | Session state for context persistence |

---

## 8. The Guard System {#8-the-guard-system}

The guard system implements the **Codebase as Immune System** paradigm: it doesn't depend on the AI "deciding" not to duplicate — it **detects and rejects** duplication in real time.

### Architecture

Guards are triggered exclusively on **PreToolUse** events for `Edit` and `Write` operations. The `--hooks` mode (`yes`/`warn`/`no`) controls **severity** — whether guards block or warn — not when they execute.

```
Claude Code attempts Edit/Write on a source file
    ↓
PreToolUse hook fires (settings.json)
    ↓
runner.js receives tool context via stdin (JSON, 5-second timeout)
    ↓
Filters: only .ts/.tsx/.js/.jsx/.cs files proceed
    ↓
Builds proposed content (simulates Edit/Write result)
    ↓
Extracts exports from proposed content
    ↓
Discovers and runs all guards/*.js in alphabetical order
    ↓
Results aggregated by severity (from guard-config.json)
    ↓
exit 0: Feedback message to AI (non-blocking, warn/info)
exit 2: Reject the operation (blocking)
```

**Content simulation**: For `Write`, the runner uses the full new content. For `Edit`, it simulates `old_string → new_string` replacement on the current file content, supporting both single replacement and `replace_all`. Guards always evaluate the **proposed** post-modification state, not the current file.

The runner also performs **inventory auto-sync** on every invocation: it updates `inventory.json` with the proposed file's exports and line count, and periodically cleans up entries for deleted files (throttled to every 5 minutes).

### Guard Catalog

| Guard | Trigger | Detection Method |
|-------|---------|-----------------|
| **duplication** | New exported name | Builds in-memory map from `inventory.json` exports; exact match (severity: block) + fuzzy bigram similarity (severity: info) |
| **convention** | New file or export | Validates naming: camelCase for functions/constants, PascalCase for types/classes, C# `IInterface` prefix requirement, file-class name matching |
| **size** | File modification | Warns when file exceeds line or export thresholds (defaults: 350 lines / 5 exports; C# override: 500 lines / 8 exports; configurable per-extension) |
| **coherence** | File modification | Tokenizes file name and export names; warns when export names have no semantic overlap with the file's domain (skips generic files) |
| **dependency** | Import statement | 1-hop circular import detection (TS/JS: import/require; C#: using directives) + zone violation checking |
| **structural-duplication** | File modification | 7 pattern detectors: useQuery, className, httpCalls, formFields, endpoints, switchBranches, tryCatch. Normalizes code blocks and compares structural similarity (≥0.7 ratio). Also cross-file fingerprinting via pattern-index |
| **intent-similarity** | New file (Write) | Compares file against capability-index entries using name substring matching, word overlap, and domain/action/entity field matching. Advisory only — never blocks |
| **intent-declaration** | New file with exports | Blocks new files with functional exports (functions/classes) that lack `@intent` header comment. Excludes index, test, types, config, .claude/ files |
| **semantic-duplication** | New file (optional) | BGE-small embeddings + cosine similarity. Warn at ≥0.66, block at ≥0.85 (configurable thresholds) |

9 guards total: 8 in `src/generators/guards/` + 1 semantic guard in `src/embeddings/`.

### Guard Configuration

Each guard has a configurable severity in `.claude/hooks/guard-config.json`:

| Severity | Behavior |
|----------|----------|
| `block` | Rejects the operation — AI must change approach |
| `warn` | Shows warning — AI can proceed but is informed |
| `info` | Informational message — logged but not prominent |
| `off` | Guard disabled |

**Default severities** at generation time:

| Guard | Default Severity | Key Settings |
|-------|-----------------|--------------|
| duplication | `warn` | fuzzyThreshold: 0.8 |
| size | `warn` | maxLines: 350, maxExports: 5, C# override: 500/8 |
| convention | `info` | — |
| coherence | `info` | — |
| dependency | `off` | — |
| structural-duplication | `warn` | 7 detector thresholds (3–4 each) |
| intent-similarity | `info` | — |
| intent-declaration | `warn` | — |
| semantic-duplication | `off` | similarityThreshold: 0.66, blockThreshold: 0.85 |

The `--hooks` CLI flag sets the **default** severity mode at generation time. When `--hooks yes`, guards that would normally `warn` are escalated to `block`. When `--hooks no`, all guards are set to `off`. Users can fine-tune individual guard severities in `guard-config.json` after initialization.

### Memory-Based Throttling

Guards use `guard-memory.json` to prevent warning fatigue:
- Warnings tracked per guard + identifier combination
- After 10 occurrences of the same warning, shown every 5th time only
- Timestamps recorded for recency tracking
- Entries older than 30 days are pruned automatically

### Zero Context Cost

Guards execute as external Node.js processes via Claude Code's hook system. They consume **zero context tokens** — the AI receives only the result message, not the analysis process.

---

## 9. Session Memory & Context Persistence {#9-session-memory}

AICodeSight addresses context loss between sessions through two lifecycle hooks, each bound to a different Claude Code event:

| Hook | Event | Matcher | Trigger |
|------|-------|---------|---------|
| `pre-compact-save.js` | `PreCompact` | `auto\|manual` | Before auto-compaction or manual compact |
| `compact-restore.js` | `SessionStart` | `compact` | After compaction completes |
| `compact-restore.js` | `SessionStart` | `resume` | When resuming a previous session |

### PreCompact Hook (`pre-compact-save.js`)

Executes before Claude Code's auto-compaction. Parses the conversation transcript (JSONL format) to capture:

| Captured State | Source | Purpose |
|---------------|--------|---------|
| Modified files | `write` and `edit` tool uses | What was created/modified with timestamps |
| Bash commands | `bash` tool uses | Terminal operations executed (truncated to 200 chars) |
| Read files | `read` tool uses | What was investigated |
| Search patterns | `grep` and `glob` tool uses | Patterns searched (truncated to 80 chars) |
| Todo/task state | `todowrite` tool uses | Current progress on structured tasks |
| Decisions | Assistant text blocks (regex) | Key decisions and observations |

This state is persisted to `working-memory.json` and survives the compaction event.

### Pre-Compact Registry Sync

The pre-compact hook also updates:
- **`registry.json`**: Extracts exports from recently modified files via regex patterns (processes last 30 modified files)
- **`pattern-index.json`**: Computes 4-line window hashes of normalized code for structural fingerprinting
- **`capability-index.json`**: Reconciles `@intent` declarations extracted from the transcript

### SessionStart Hook (`compact-restore.js`)

Executes when a session resumes after compaction or when resuming a previous session. Reads `working-memory.json` and injects a context restoration prompt via Claude Code's `additionalContext` mechanism, allowing the AI to resume with awareness of:

- What it was working on (current task and progress)
- What files it recently changed
- What decisions it made
- Which modules are relevant (with a registry slice of active modules)
- Bash commands executed
- Files investigated
- Rejected approaches to avoid repeating
- Stale artifact warnings

### Hook Verification

On every `SessionStart`, the compact-restore hook verifies that AICodeSight hooks still exist in `.claude/settings.json`. If missing (e.g., overwritten by another tool), it automatically triggers `restore-settings.js` to recover them from the backup. See [Hook Recovery](#hook-recovery).

---

## 10. The CLAUDE.md Template Engine {#10-claudemd-template-engine}

AICodeSight generates a `CLAUDE.md` tailored to the project's reality through a unified template system.

### Template Adaptation by Project Type

The template adapts based on `TemplateSectionFlags` (22 flags), which vary by project type. The table below shows what each project type includes at initialization:

| Section | New Project | Organized | Legacy |
|---------|-------------|-----------|--------|
| 6 AI-Friendly Principles | Yes | No | No |
| Recommended Structure | Yes | No | No |
| Blueprint Reference | Yes | No | No |
| Full Naming Conventions | Yes | No | No |
| CSS Rules | Yes | No | No |
| Anti-Duplication Protocol | Medium | Medium | Verbose |
| Variation Rule | Medium | Medium | Verbose |
| Location Rule | Medium | Medium | Verbose |
| Duplicate Listing | Conditional | With canonical scoring | Confidence tiers |
| Large File Listing | Conditional | Flat list | Split by severity |
| Opportunistic Improvement | None | Proactive | Cautious |
| Capability Index Reference | No | Yes | Yes |
| Intent Protocol | Yes | Yes | Yes |
| Naming Minimas | No | Yes | Yes |
| Auto-Maintenance | Standard | Standard | Extended |
| Post-Compact Instructions | Standard | Standard | Extended |

**"Conditional"** means the section only appears if the data exists (e.g., duplicates listed only if duplicates detected). For new projects without code yet, these sections are omitted.

#### Flag Evolution {#flag-evolution}

When a `new` project grows and `aicodesight update` is run, five flags evolve automatically once source files exist (`totalFiles > 0`):

| Flag | Init Value | Evolved Value | Reason |
|------|-----------|---------------|--------|
| `duplicates` | conditional | resolved | Show duplicates with canonical resolution |
| `largeFiles` | conditional | flat | Start reporting oversized files |
| `genericFiles` | conditional | always | Enforce naming conventions |
| `oportunistic` | none | proactive | Enable proactive improvement |
| `namingMinimas` | false | true | Display naming conventions |

This evolution ensures new projects start minimal and grow into full protection as code accumulates.

### Generated Sections

The CLAUDE.md contains both **prescriptive directives** (XML tags) and **reference data** (Markdown):

```
Behavioral Directives (XML tags):
  <protocolo_anti_duplicacion>    — Search-before-creating protocol
  <regla_de_variacion>            — Parametrize vs create new
  <regla_de_ubicacion>            — Where each type of code goes
  <duplicacion_conocida>          — Known duplicates with canonical version
  <duplicacion_estructural>       — File pairs with structural duplication
  <archivos_grandes>              — Files too large to add code to
  <protocolo_declaracion_intent>  — @intent header requirement
  <mejora_oportunista>            — Boy Scout rule for gradual improvement
  <convenciones_naming_minimas>   — Naming conventions for new files
  <regla_de_transparencia>        — Report what was reused vs created
  <auto_mantenimiento>            — Keep barrels and index updated
  <post_compact>                  — What to do after session summary

Reference Data (Markdown):
  ## Datos del proyecto           — Stats (files, lines, exports, frameworks)
  ## Estructura actual            — Directory tree with line counts
  ## Modulos disponibles          — Function signatures per module
  ## Archivos de referencia       — What JSON files to consult
```

### User Zone Preservation

Content outside `<!-- aicodesight:start/end -->` markers is preserved across `aicodesight update` runs, allowing users to add custom directives that survive regeneration.

---

## 11. Pattern Modules & Blueprint System {#11-pattern-modules}

For projects with detected tech stacks, AICodeSight generates architectural blueprints with stack-specific guidance.

### Pattern Module Architecture

Each pattern module implements the `PatternModule` interface:

```typescript
interface PatternModule {
  id: string;
  name: string;
  activationCheck: (stack: TechStackProfile) => boolean;
  folderSuggestions: () => FolderNode[];
  codePatterns: () => CodePattern[];
  dataFlows: () => DataFlow[];
  sharedUtilities: () => SharedUtility[];
  designTokens?: () => DesignTokenHint[];
  antiDuplicationEntries?: () => AntiDuplicationEntry[];
  antiPatterns?: () => AntiPatternEntry[];
  domainGroupings?: () => DomainGrouping[];
}
```

### Available Patterns

| Pattern | Activates When | Provides |
|---------|---------------|----------|
| shadcn + Tailwind | Frontend libraries include `tailwind`, `shadcn`, or `styling` category | Component patterns, token structure, theming guidance |
| TanStack Query | Frontend libraries include `tanstack` with `data-fetching` category or `query` in name | Query/mutation patterns, cache invalidation flows, query key factory |
| .NET Minimal API | Backend primary includes `.net` or libraries include `entityframework`/`ef core` | Endpoint patterns, CQRS with MediatR, EF Core conventions, vertical slice structure |

### Pattern Resolution

`resolvePatterns(stack)` filters all registered pattern modules by their `activationCheck`, then aggregates results using `flatMap`:

```
Active patterns
  → flatMap codePatterns()        → CodePattern[]
  → flatMap folderSuggestions()   → FolderNode[]
  → flatMap dataFlows()           → DataFlow[]
  → dedupeByName sharedUtilities() → SharedUtility[]
  → flatMap designTokens()        → DesignTokenHint[]
  → flatMap antiDuplication()     → AntiDuplicationEntry[]
  → flatMap antiPatterns()        → AntiPatternEntry[]
  → flatMap domainGroupings()     → DomainGrouping[]
```

### Blueprint Content

When a tech stack is detected, the blueprint (`blueprint.md`) provides:

- **Recommended folder structure** with purpose annotations
- **Code patterns** with examples and anti-patterns
- **Data flow diagrams** (e.g., React component → TanStack Query → API → Database)
- **Shared utilities** to implement early (preventing later duplication)
- **Design token structure** (frontend projects)
- **Anti-duplication map** (canonical locations for common needs)
- **Domain groupings** based on detected entities

### Interactive Stack Selection

For new projects, an interactive prompt (using `@inquirer/prompts`) guides technology selection:

```
Project Type → Frontend Framework → Frontend Libraries
             → Backend Framework  → Backend Libraries
             → Database Engine    → ORM Selection
             → Monorepo Structure
```

This produces a `StackSelection` that drives blueprint generation and pattern activation.

---

## 12. Semantic Embeddings (Optional) {#12-semantic-embeddings}

When enabled (`--embeddings` flag), AICodeSight pre-computes vector embeddings for semantic duplication detection.

### How It Works

1. **Model**: Xenova/bge-small-en-v1.5 (384-dimensional vectors)
2. **Input**: Capability-index entries that have non-empty descriptions
3. **Text format**: `"{name} — {description}"` per entry
4. **Process**: WASM-based inference via `@xenova/transformers` — no external API calls
5. **Output**: `.claude/embeddings-cache.json` with version, model metadata, and entry vectors
6. **Guard usage**: New file descriptions are embedded and compared against cache via cosine similarity (dot product on pre-normalized vectors)
7. **Thresholds**: Warn at ≥0.66 similarity, block at ≥0.85 (configurable)

### Why It's Optional

- Requires `@xenova/transformers` as a dev dependency (~100MB download)
- First run involves model download (~30MB)
- Only useful for projects with enriched capability-index entries
- Falls back gracefully (returns `null`) if not available
- Guard is `off` by default — must be explicitly enabled

---

## 13. Theoretical Foundations {#13-theoretical-foundations}

AICodeSight's design draws from research documented across five companion papers that explore the problem space from multiple angles.

### From `guia-anti-duplicacion-ia.md` — The 6 Principles

The foundational framework defines six principles for AI-friendly architecture:

1. **One file, one responsibility** — Discoverable by filename alone
2. **Self-documenting names** — `formatCurrency.ts` over `utils.ts`
3. **Max ~350 lines per file** — Fits in AI context, one primary export
4. **Predictable structure by convention** — AI knows where to look without exploring
5. **Barrel files as maps** — `index.ts` serves as table of contents
6. **Group by domain, not by technical type** — Co-locate related code

### From `paradigma-radical.md` — The 8 Paradigms

AICodeSight implements several paradigms from this exploratory document:

| Paradigm | Implementation in AICodeSight |
|----------|------------------------------|
| **Immune System** | Guard pipeline — detects and rejects duplication at write-time |
| **Progressive Disclosure** | Compact CLAUDE.md + detailed JSON artifacts on demand |
| **Session Handoff** | PreCompact hook + working-memory.json |
| **Codebase as Registry** | `registry.json` — module-organized export catalog |
| **Dynamic CLAUDE.md** | Auto-generated template that regenerates on `update` |
| **Knowledge Graph** | Dependency map + capability index with cross-references |

Two paradigms remain conceptual:
- **Generative Architecture** (declarative DSL) — too opinionated for a general tool
- **Context Budget** (explicit context management) — requires AI platform support

### From `aplicabilidad-y-migracion.md` — The Migration Strategy

AICodeSight's three-scenario model:

| Scenario | Project State | AICodeSight Approach |
|----------|--------------|----------------------|
| **A: New project** | No existing code | Full architecture: principles + blueprint + hooks from day 1 |
| **B: Organized project** | Reasonable structure, moderate duplication | Visibility layer + gradual improvement |
| **C: Legacy project** | Large files, high duplication, no structure | Diagnose → make visible → defend → improve opportunistically |

The tool's `--type` flag maps directly to these scenarios.

### From `estrategias-complementarias.md` — Complementary Strategies

AICodeSight incorporates several strategies from this analysis:

- **Barrel files as semantic index** → Registry with signatures
- **Type-driven development** → Signatures extracted from AST via ts-morph
- **Dependency map** → Auto-generated import graph
- **`.claudeignore`** → Noise reduction for AI context
- **Prompt engineering** → Optimized CLAUDE.md with XML tags and compact tables

### From `guia-anti-duplicacion-api.md` — API-Specific Patterns

The pattern module system supports API-specific guidance:

- Layer separation (route → controller → service → query)
- Centralized response formatting
- Shared validation schemas
- Middleware reuse patterns

---

## 14. Design Principles & Key Patterns {#14-design-principles}

### Dual Artifact Pattern

Every analysis produces paired JSON (machine-readable, consumed by guards at runtime) and Markdown (human-readable, consumed by Claude via Read tool). This avoids redundant analysis — guards and AI read the same underlying data in different formats.

### Compact Serialization

Files that Claude reads directly must stay within the Read tool's limits. Compact serialization (one entry per line) allows scaling to ~1,900 capability-index entries and ~1,500 registry exports before hitting the 2,000-line ceiling.

### Confidence-Based Reporting

Duplicate resolution uses multi-signal scoring rather than simple heuristics. The confidence level (`high`/`medium`/`low`) informs the CLAUDE.md template about how definitively to instruct the AI:
- `high`: "Use X, ignore Y"
- `medium`: "Probably use X, but verify"
- `low`: "Ask the user which is canonical"

### Graceful Degradation

Optional features (embeddings, hooks, blueprint, interactive prompts) fail silently without breaking core analysis. The tool produces useful output even with minimal capabilities.

### User Zone Preservation

CLAUDE.md markers (`<!-- aicodesight:start/end -->`) ensure user-written directives survive regeneration. Guard configuration merges rather than overwrites — new guards are added, but existing user-customized severities are preserved.

### Zero Context Cost Guards

Guards execute as external Node.js processes. They consume no context tokens. The AI receives only a concise result message, not the analysis logic. This is critical: the defense layer must not compete with productive work for context space.

### Inventory Auto-Sync

The `runner.js` hook automatically updates `inventory.json` when files are edited, keeping the guard system's knowledge base current without requiring explicit `aicodesight update` runs. It also periodically cleans up entries for deleted files (throttled to every 5 minutes to avoid filesystem overhead).

### Enrichment Merge Preservation {#enrichment-merge-preservation}

When `aicodesight update` regenerates the capability-index, the `generateAndWriteCapabilityIndex()` function reads the existing `capability-index.json` and passes it to `generateCapabilityIndex()` as a merge base. Entries with `source: "enriched"` (AI-enriched descriptions) or `source: "declared"` (from `@intent` headers) are **preserved** — only `extracted` entries are regenerated from the current registry. This means:

- Enrichment work is never lost during updates
- `@intent` headers accumulate across sessions
- Only entries whose underlying code changed get re-extracted

---

## 15. Internal Architecture Patterns {#15-internal-architecture}

AICodeSight's own codebase uses several recurring patterns worth noting:

### Orchestrator Pattern

The hook generation system uses a thin orchestrator (`hooksGenerator.ts`) that imports and assembles outputs from specialized generators. It does not contain generation logic itself — it delegates to:

| Generator | Output |
|-----------|--------|
| `runnerGenerator.ts` | `runner.js` — guard pipeline orchestrator |
| `duplicationGuard.ts`, `sizeGuard.ts`, etc. (8 files) | Individual guard `.js` files |
| `semanticDuplicationGuard.ts` (in `src/embeddings/`) | `semantic-duplication.js` guard |
| `guardConfigGenerator.ts` | `guard-config.json` + `guard-memory.json` |
| `generateRestoreSettings()` (inline in hooksGenerator) | `restore-settings.js` recovery script |

The orchestrator also handles the write pipeline (`writeGuardPipeline`), including merge logic for `guard-config.json` (adds new guards without overwriting user-customized severities) and preservation of `guard-memory.json`.

A similar orchestrator pattern exists in `memoryHooksGenerator.ts`, which delegates to `generatePreCompactHook.ts` and `generateCompactRestoreHook.ts` for the actual hook content.

### Shared JS Snippet Injection

Since hook generators produce JavaScript via TypeScript template literals, common functions (`findProjectRoot`, `loadJSON`) would be duplicated across every hook file. The `hookSharedSnippets.ts` module exports raw JS code strings (`jsFindProjectRoot()`, `jsLoadJSON()`) that are injected into generated hooks via `${...}` interpolation:

```typescript
// In a hook generator:
return `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

${jsFindProjectRoot()}
${jsLoadJSON()}

// ... rest of hook logic
`;
```

This eliminates duplication across generated JS files while keeping each hook self-contained (no runtime `require` between hooks).

### Factory Pattern (Pattern Modules)

The `createPatternModule()` factory in `src/generators/patterns/` converts plain configuration objects (arrays of patterns, folders, flows) into `PatternModule` instances where each array is wrapped in a `() =>` function. This allows pattern files to be simple data declarations while conforming to the lazy-evaluation interface:

```typescript
// Pattern file is a flat config:
export default createPatternModule({
  id: 'shadcn-tailwind',
  folderSuggestions: [ ... ],  // plain array
  codePatterns: [ ... ],       // plain array
});

// Factory wraps into: { folderSuggestions: () => [...], codePatterns: () => [...] }
```

### Shared Walker

`walkDirectory()` in `src/shared/` replaced 8+ duplicate directory-walking implementations across the codebase. It uses a callback pattern with `WalkOptions` (excludeDirs, excludeHiddenDirs, maxDepth, filterExt) and is the only directory traversal mechanism in the project.

---

## 16. Technology Stack {#16-technology-stack}

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `commander` | ^12.0.0 | CLI framework — command parsing and help generation |
| `ts-morph` | ^22.0.0 | TypeScript AST parsing — export extraction with full type signatures |
| `glob` | ^10.3.0 | File pattern matching — efficient source file discovery |
| `chalk` | ^4.1.2 | Terminal colors — formatted console output |
| `ora` | ^5.4.1 | Spinner animations — progress feedback for long operations |
| `@inquirer/prompts` | ^8.2.0 | Interactive CLI — tech stack selection wizard |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.4.0 | Compilation |
| `@xenova/transformers` | ^2.17.2 | WASM-based embeddings (optional — semantic duplication guard) |

### Build

- Target: ES2022 (Node.js compatible)
- Output: `./dist` directory
- Strict mode enabled
- Declaration files generated

### Requirements

- Node.js >= 18
- No external services required (all analysis is local)

---

## 17. Supported Project Types {#17-supported-project-types}

### Languages

| Language | AST Parsing | Regex Fallback | Features |
|----------|-------------|----------------|----------|
| TypeScript | ts-morph (full signatures) | Yes | Complete support |
| JavaScript | ts-morph (partial) | Yes | Full support |
| C# | Custom parser | Yes | .csproj detection, namespace mapping, .NET patterns |

### Structures

| Structure | Detection | Special Handling |
|-----------|-----------|-----------------|
| Single package | Default | Standard analysis |
| npm workspaces monorepo | `packages/` + root `package.json` | Per-package modules |
| .NET solution | `.sln` + `.csproj` files | Per-project modules, namespace mapping |

### Frameworks (Auto-Detected)

**Frontend**: React, Next.js, Vue, Angular, Svelte, shadcn/ui, Tailwind CSS, TanStack Query/Router/Table, Zustand, React Hook Form, Vite

**Backend**: Express, Fastify, NestJS, ASP.NET Core, MediatR, FluentValidation, AutoMapper, SignalR

**Database**: Prisma, TypeORM, Drizzle, Entity Framework Core

---

## 18. Workflows {#18-workflows}

### First-Time Setup

```
1. Install:     npm install -g aicodesight
2. Navigate:    cd /path/to/project
3. Initialize:  aicodesight init
4. (Optional):  Select tech stack via interactive prompts
5. Result:      .claude/ directory + CLAUDE.md generated
6. Verify:      Open project in Claude Code — directives are active
```

### Capability Enrichment

After initialization, the capability-index contains `extracted` entries with AST-derived data but no semantic descriptions. The enrichment workflow adds human-quality descriptions:

```
1. Read:     .claude/enrich-capability-index.md (instructions)
2. Open:     .claude/capability-index.json
3. For each entry with source: "extracted":
   a. Read the source file
   b. Write description, domain, action, entity
   c. Change source to "enriched"
4. Run:      aicodesight update --only registry
5. Result:   Enriched entries survive future updates
```

Enriched entries are preserved across `aicodesight update` runs because `generateAndWriteCapabilityIndex()` merges with existing data — only `extracted` entries are regenerated, while `enriched` and `declared` entries carry forward unchanged. This means enrichment is a one-time investment per function: once described, the description persists through all future updates unless the underlying export is removed from the codebase.

### Maintenance

```
After significant code changes:
  aicodesight update              — Refresh all artifacts
  aicodesight update --only hooks — Refresh only guard pipeline

For periodic health checks:
  aicodesight audit               — Full analysis report
  aicodesight audit --focus size  — Only file size analysis
```

### Hook Recovery {#hook-recovery}

Claude Code's `settings.json` can be overwritten by other tools or by Claude Code itself when adding its own hooks. When this happens, AICodeSight's guard and memory hooks are silently lost — guards stop running, and session memory stops being captured.

AICodeSight defends against this with a two-part mechanism:

1. **`aicodesight-settings.json`** (source of truth): Generated alongside `settings.json` during init, this file contains a clean copy of all AICodeSight hook entries (guard pipeline on `PreToolUse`, memory hooks on `PreCompact` and `SessionStart`). It is never modified by Claude Code or other tools.

2. **`restore-settings.js`** (recovery script): Reads `aicodesight-settings.json` and merges missing hooks back into `settings.json`, preserving any existing non-AICodeSight hooks and permissions. Can be run manually or is invoked automatically by `compact-restore.js` when it detects missing hooks on every `SessionStart`.

```
Manual recovery:
  node .claude/hooks/restore-settings.js

Automatic recovery:
  compact-restore.js verifies hooks on every SessionStart
  and calls restore-settings.js if any are missing
```

---

## 19. Glossary {#19-glossary}

| Term | Definition |
|------|------------|
| **Artifact** | A file generated by AICodeSight in the `.claude/` directory |
| **Barrel file** | An `index.ts` that re-exports from a directory, serving as a module's table of contents |
| **Canonical location** | The "real" location of a duplicated export — the one that should be used |
| **Capability entry** | A record in the capability-index describing a single export's purpose and metadata |
| **Compact serialization** | One-entry-per-line JSON format designed to fit within Claude's Read tool limits |
| **Context window** | The finite token budget available to the AI for instructions, conversation, and file reads |
| **Cross-stack mirror** | An export that exists in both backend (.cs) and frontend (.ts) as an API contract — not a bug |
| **Dual artifact** | Paired JSON + Markdown output — one for machines, one for humans/AI |
| **Enrichment** | The process of adding semantic descriptions to capability-index entries |
| **Guard** | A Node.js module that validates proposed code changes against project rules |
| **Hook** | A shell command executed automatically by Claude Code before or after tool use |
| **HooksMode** | The severity mode (`yes`/`warn`/`no`) that controls guard behavior — not to be confused with hook event timing |
| **Intent header** | An `@intent` JSDoc comment declaring a file's purpose, domain, and dependencies |
| **Orchestrator** | A thin module that assembles outputs from specialized generators without containing generation logic itself |
| **Pattern module** | A stack-specific provider of architectural patterns, folder structures, and conventions |
| **Runner** | The orchestrator script that loads and executes all guards in sequence |
| **Section flags** | Configuration (22 flags) that controls which sections appear in the generated CLAUDE.md |
| **User zone** | Content in CLAUDE.md outside `<!-- aicodesight:start/end -->` markers, preserved during regeneration |
| **Working memory** | Session state (active modules, recent changes, decisions) persisted to survive compaction |

---

> **AICodeSight** transforms the relationship between AI coding assistants and codebases. Instead of asking the AI to "remember" what exists, AICodeSight ensures the codebase **declares** what exists — through metadata, runtime guards, and directives calibrated to the project's actual state. The result: AI that reuses instead of re-creates, extends instead of duplicates, and improves the codebase incrementally with every session.
