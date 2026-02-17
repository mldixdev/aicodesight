# Diagnostic Process: How to Generate the Legacy CLAUDE.md

> **Version:** 1.0
> **Objective:** Document step by step how to obtain the information that feeds each section of the CLAUDE.md for an existing legacy project.
> **Prerequisite:** Have Claude Code installed and access to the project.

---

## Table of Contents

1. [Process Overview](#1-process-overview)
2. [Step 1: Project Scan](#2-project-scan)
3. [Step 2: Duplicate Detection](#3-duplicate-detection)
4. [Step 3: Dependency Map](#4-dependency-map)
5. [Step 4: Assemble the Legacy CLAUDE.md](#5-assemble)
6. [Step 5: Validate and Refine](#6-validate)
7. [Process Automation](#7-automation)
8. [Ongoing Maintenance](#8-maintenance)

---

## 1. Process Overview {#1-process-overview}

The legacy CLAUDE.md is built in 4 collection steps + 1 assembly step:

```
Step 1: Project Scan        -> What files exist, how large are they, what do they export?
Step 2: Duplicates           -> What functions/types are duplicated and where?
Step 3: Dependencies         -> Who uses what?
Step 4: Assemble             -> Combine everything into CLAUDE.md + auxiliary files
Step 5: Validate             -> Verify that the AI understands and correctly uses the information
```

Each step has two paths: **manual (with the AI)** and **automated (with scripts)**. It's recommended to start with manual and then automate for maintenance.

---

## 2. Step 1: Project Scan {#2-project-scan}

### Objective

Obtain a complete map of:
- All code files with their size
- What each file exports (functions, types, classes, constants)
- Classification by size (critical > 500, high > 300, medium > 150, ok < 150)

### Path A: With the AI (recommended to start)

Open Claude Code in the project directory and run this prompt:

```
I need you to do a complete scan of this project. Please:

1. First, list ALL source code files (.ts, .tsx, .js, .jsx)
   with their line count. Sort them from largest to smallest.

2. For each file with MORE than 100 lines, list ALL its exported
   functions, classes, types, and interfaces (export), with the
   line number where each one appears.

3. Classify each file:
   - CRITICAL: more than 500 lines
   - HIGH: 300-500 lines
   - MEDIUM: 150-300 lines
   - OK: less than 150 lines

4. For files with generic names (utils, helpers, common, shared, misc,
   tools, lib), mark with warning — these cause the most duplication.

Save the result in .claude/inventory.md with markdown table format.
Do not modify any project files, only generate the inventory.
```

**What does the AI do with this prompt?**

The AI will use search tools (Glob, Grep, Read) to:
1. Find all code files
2. Read each file and count lines
3. Extract exports with regex or direct reading
4. Generate the inventory in markdown format

**Expected result: `.claude/inventory.md`**

```markdown
# Project Inventory — [date]

## Summary
- Total code files: 45
- CRITICAL files (>500 lines): 6
- HIGH files (300-500 lines): 4
- MEDIUM files (150-300 lines): 8
- OK files (<150 lines): 27
- Files with generic names: 3 (warning)

## Files by size (largest to smallest)

| File | Lines | Exports | Classification |
|---|---|---|---|
| src/api.ts | 1200 | 28 | CRITICAL |
| src/components/UserManagement.tsx | 1000 | 3 | CRITICAL |
| src/utils.ts (warning) | 800 | 40 | CRITICAL |
| src/components/Dashboard.tsx | 800 | 2 | CRITICAL |
| src/helpers.ts (warning) | 600 | 25 | CRITICAL |
| src/components/App.tsx | 600 | 1 | CRITICAL |
| src/database.ts | 500 | 18 | HIGH |
| src/components/PaymentForm.tsx | 500 | 2 | HIGH |
| src/validation.ts | 400 | 15 | HIGH |
| src/types.ts | 400 | 35 | HIGH |
| src/auth.ts | 300 | 12 | MEDIUM |
| ... | ... | ... | ... |

## Export details per file (only files > 100 lines)

### src/utils.ts (warning) (800 lines, 40 exports)

| Export | Type | Line | Inferred description |
|---|---|---|---|
| formatCurrency | function | 437 | Formats number as currency |
| formatDate | function | 89 | Formats date for display |
| formatPhone | function | 112 | Formats phone number |
| debounce | function | 156 | Generic debounce |
| throttle | function | 178 | Generic throttle |
| deepClone | function | 203 | Deep clone of object |
| isEmpty | function | 221 | Checks if value is empty |
| generateId | function | 245 | Generates unique ID |
| slugify | function | 268 | Converts text to slug |
| capitalize | function | 285 | First letter uppercase |
| truncateText | function | 298 | Truncates text with ellipsis |
| parseQueryString | function | 320 | Parses URL query string |
| buildQueryString | function | 348 | Builds query string |
| delay | function | 370 | Promise that waits N ms |
| retry | function | 385 | Retries function N times |
| ... (25 more functions) | ... | ... | ... |

### src/helpers.ts (warning) (600 lines, 25 exports)

| Export | Type | Line | Inferred description |
|---|---|---|---|
| formatCurrency | function | 201 | (warning) POSSIBLE DUPLICATE of utils.ts:437 |
| formatDate | function | 340 | (warning) POSSIBLE DUPLICATE of utils.ts:89 |
| handleApiError | function | 15 | Handles API errors |
| buildHeaders | function | 45 | Builds HTTP headers |
| ... | ... | ... | ... |

### src/api.ts (1200 lines, 28 exports)
... (same format)
```

### Path B: With automated scripts

If you prefer not to consume AI context for the diagnostic, you can use scripts:

**Script: `scripts/diagnose-project.js`**

```javascript
#!/usr/bin/env node
/**
 * Generates a complete project inventory.
 * Usage: node scripts/diagnose-project.js [src_directory]
 * Output: .claude/inventory.md
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const srcDir = process.argv[2] || 'src';
const outputDir = '.claude';
const outputFile = path.join(outputDir, 'inventory.md');

// Create .claude directory if it doesn't exist
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Source code extensions
const extensions = ['.ts', '.tsx', '.js', '.jsx'];
const genericNames = ['utils', 'helpers', 'common', 'shared', 'misc', 'tools', 'lib', 'functions'];

// 1. Find all files
const files = glob.sync(`${srcDir}/**/*{${extensions.join(',')}}`)
  .filter(f => !f.includes('node_modules') && !f.includes('dist'));

// 2. Analyze each file
const analysis = files.map(filePath => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Extract exports
  const exportPattern = /export\s+(async\s+)?(function|const|let|class|type|interface|enum)\s+(\w+)/g;
  const exports = [];
  let match;
  while ((match = exportPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    exports.push({
      name: match[3],
      type: match[2],
      line: lineNumber,
    });
  }

  // Also capture export default
  const defaultExport = content.match(/export\s+default\s+(function|class)\s+(\w+)/);
  if (defaultExport) {
    exports.push({ name: defaultExport[2], type: defaultExport[1], line: 0 });
  }

  // Classify
  const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();
  const isGeneric = genericNames.some(g => baseName.includes(g));
  let classification;
  if (lineCount > 500) classification = 'CRITICAL';
  else if (lineCount > 300) classification = 'HIGH';
  else if (lineCount > 150) classification = 'MEDIUM';
  else classification = 'OK';

  return {
    path: filePath,
    lines: lineCount,
    exports,
    classification,
    isGeneric,
  };
}).sort((a, b) => b.lines - a.lines);

// 3. Generate markdown
let md = `# Project Inventory — ${new Date().toISOString().split('T')[0]}\n\n`;

// Summary
const critical = analysis.filter(a => a.classification === 'CRITICAL').length;
const high = analysis.filter(a => a.classification === 'HIGH').length;
const medium = analysis.filter(a => a.classification === 'MEDIUM').length;
const ok = analysis.filter(a => a.classification === 'OK').length;
const generic = analysis.filter(a => a.isGeneric).length;

md += `## Summary\n`;
md += `- Total files: ${analysis.length}\n`;
md += `- CRITICAL (>500 lines): ${critical}\n`;
md += `- HIGH (300-500 lines): ${high}\n`;
md += `- MEDIUM (150-300 lines): ${medium}\n`;
md += `- OK (<150 lines): ${ok}\n`;
md += `- Files with generic names: ${generic} (warning)\n\n`;

// File table
md += `## Files by size\n\n`;
md += `| File | Lines | Exports | Classification |\n`;
md += `|---|---|---|---|\n`;
for (const file of analysis) {
  const genericFlag = file.isGeneric ? ' (warning)' : '';
  md += `| ${file.path}${genericFlag} | ${file.lines} | ${file.exports.length} | ${file.classification} |\n`;
}

// Export details for files > 100 lines
md += `\n## Export details (files > 100 lines)\n\n`;
for (const file of analysis.filter(a => a.lines > 100 && a.exports.length > 0)) {
  const genericFlag = file.isGeneric ? ' (warning)' : '';
  md += `### ${file.path}${genericFlag} (${file.lines} lines, ${file.exports.length} exports)\n\n`;
  md += `| Export | Type | Line |\n`;
  md += `|---|---|---|\n`;
  for (const exp of file.exports) {
    md += `| ${exp.name} | ${exp.type} | ${exp.line} |\n`;
  }
  md += `\n`;
}

fs.writeFileSync(outputFile, md);
console.log(`Inventory generated at ${outputFile}`);
console.log(`  ${analysis.length} files analyzed`);
console.log(`  ${critical} critical, ${high} high, ${medium} medium, ${ok} ok`);
```

**Usage:**

```bash
# Install dependency if it doesn't exist
npm install glob --save-dev

# Run
node scripts/diagnose-project.js src
# Output: .claude/inventory.md
```

---

## 3. Step 2: Duplicate Detection {#3-duplicate-detection}

### Objective

Find:
- Functions/types with the **same name** in different files (exact duplicate)
- Functions/types with **similar names** that do the same thing (variation duplicate)
- **Code blocks** that are repeated (duplicated patterns)

### Path A: With the AI

After generating the inventory (Step 1), run this prompt:

```
Read the .claude/inventory.md file we just generated.

Now I need you to detect duplication in the project. Do the following:

PART 1 — Duplicates by name:
- Search for functions, types, or classes that appear with the SAME NAME
  in more than one file.
- For each duplicate found, read both implementations and determine:
  a) Are they identical? -> Mark as "EXACT DUPLICATE"
  b) Are they similar but with differences? -> Mark as "VARIANT"
     and describe the difference
  c) Do they have the same name but do different things? -> Mark as
     "FALSE POSITIVE — same name, different functionality"

PART 2 — Duplicates by functionality:
- Search for functions that do the same thing but have different names.
  Clues: look for patterns like:
  - Multiple functions that format the same data type
  - Multiple validation functions for the same field
  - Multiple functions that fetch the same entity
  - try/catch blocks with the same error handling pattern

PART 3 — Repeated patterns:
- Search for code patterns that repeat across multiple files:
  - try/catch with similar error format
  - Pagination logic
  - HTTP response construction
  - Validation of common fields (email, phone, etc.)

Save the result in .claude/duplicates.md with this format:

## Exact duplicates
| Function/Type | Location 1 (canonical) | Location 2 (duplicate) | Verdict |
...

## Variants (same purpose, different implementation)
| Function | Location 1 | Location 2 | Difference |
...

## Repeated patterns
| Pattern | Files where it appears | Occurrences |
...

## False positives
| Name | Locations | Why it's NOT a duplicate |
...
```

**What does the AI do with this prompt?**

The AI:
1. Reads the inventory to know what exports exist in each file
2. Identifies repeated names by comparing the export list
3. Reads the implementations of duplicate candidates to verify
4. Searches for patterns with Grep (e.g., `Grep("formatCurrency")` to see all occurrences)
5. Classifies each finding

**Expected result: `.claude/duplicates.md`**

```markdown
# Duplicates Detected — [date]

## Exact duplicates
| Function/Type | Location 1 (use this) | Location 2 (remove) | Notes |
|---|---|---|---|
| formatCurrency | src/utils.ts:437 | src/helpers.ts:201 | Identical implementation |
| UserProfile (type) | src/types.ts:89 | src/components/UserManagement.tsx:15 | Type defined 2 times |

## Variants
| Function | Location 1 | Location 2 | Difference |
|---|---|---|---|
| formatDate | src/utils.ts:89 | src/helpers.ts:340 | utils uses Intl.DateTimeFormat, helpers uses moment.js |
| validateEmail | src/validation.ts:15 | src/auth.ts:180 | Different regex. validation.ts is stricter |
| getUserById | src/database.ts:45 | src/api.ts:234 | api.ts includes joins that database.ts doesn't have |

## Repeated patterns
| Pattern | Files | Occurrences | Description |
|---|---|---|---|
| try/catch + res.status(500) | src/api.ts | 12 | Same error handling block in each endpoint |
| pagination logic | src/database.ts, src/api.ts | 5 | Repeated offset/limit calculation |
| auth check | src/api.ts | 8 | Inline repeated token verification |

## False positives
| Name | Locations | Why it's NOT a duplicate |
|---|---|---|
| validate | src/validation.ts, src/components/PaymentForm.tsx | Same name but one validates backend, other validates form UI |
```

### Path B: With automated tools

**Tool 1: jscpd (Copy/Paste Detector)**

```bash
# Install
npm install -g jscpd

# Run
jscpd src/ --min-lines 5 --reporters console --format "javascript,typescript"

# Output with more detail
jscpd src/ --min-lines 3 --reporters "json" --output .claude/jscpd-report.json
```

`jscpd` detects **copied/pasted code blocks** (not just matching names). It's good for finding repeated patterns that a name-based analysis doesn't catch.

**Tool 2: Name-based detection script**

```javascript
#!/usr/bin/env node
/**
 * Detects duplicate exports (same name in different files).
 * Usage: node scripts/detect-duplicates.js src
 * Output: .claude/duplicates-by-name.md
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const srcDir = process.argv[2] || 'src';
const extensions = ['.ts', '.tsx', '.js', '.jsx'];

// 1. Collect all exports from all files
const exportMap = {}; // { name: [{ file, line, type }] }

const files = glob.sync(`${srcDir}/**/*{${extensions.join(',')}}`)
  .filter(f => !f.includes('node_modules') && !f.includes('dist'));

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const exportPattern = /export\s+(async\s+)?(function|const|let|class|type|interface|enum)\s+(\w+)/g;
  let match;
  while ((match = exportPattern.exec(content)) !== null) {
    const name = match[3];
    const type = match[2];
    const line = content.substring(0, match.index).split('\n').length;

    if (!exportMap[name]) exportMap[name] = [];
    exportMap[name].push({ file: filePath, line, type });
  }
}

// 2. Filter only those appearing in more than one file
const duplicates = Object.entries(exportMap)
  .filter(([name, locations]) => {
    const uniqueFiles = new Set(locations.map(l => l.file));
    return uniqueFiles.size > 1;
  })
  .sort((a, b) => b[1].length - a[1].length);

// 3. Generate report
let md = `# Duplicate Exports by Name — ${new Date().toISOString().split('T')[0]}\n\n`;

if (duplicates.length === 0) {
  md += 'No exports with the same name were found in different files.\n';
} else {
  md += `${duplicates.length} duplicate names found.\n\n`;
  md += `| Name | Type | Locations |\n`;
  md += `|---|---|---|\n`;

  for (const [name, locations] of duplicates) {
    const locs = locations.map(l => `${l.file}:${l.line}`).join(', ');
    const types = [...new Set(locations.map(l => l.type))].join('/');
    md += `| ${name} | ${types} | ${locs} |\n`;
  }
}

// 4. Save
const outputDir = '.claude';
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'duplicates-by-name.md'), md);

console.log(`Report generated at .claude/duplicates-by-name.md`);
console.log(`  ${duplicates.length} duplicate names found`);
```

**Recommendation:** Use Path B (scripts) for mechanical name-based detection, and Path A (AI) for semantic detection of variants and patterns. Scripts are deterministic and don't consume context; the AI is better at understanding whether two functions with different names do the same thing.

---

## 4. Step 3: Dependency Map {#4-dependency-map}

### Objective

Know which files import from which other files. This feeds the CLAUDE.md section that tells the AI where to look for each domain.

### Path A: With the AI

```
Analyze the imports of all project files and generate
a dependency map:

1. For each file, list which other files it imports from.
2. Identify the most imported files (the most "shared"):
   - How many files import from utils.ts?
   - How many import from types.ts?
   - How many import from helpers.ts?
3. Identify clusters: groups of files that import from each other
   (this suggests implicit domains).

Save in .claude/dependency-map.md
```

### Path B: With script

```javascript
#!/usr/bin/env node
/**
 * Generates a dependency map by analyzing imports.
 * Usage: node scripts/dependency-map.js src
 * Output: .claude/dependency-map.md
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const srcDir = process.argv[2] || 'src';

const files = glob.sync(`${srcDir}/**/*.{ts,tsx,js,jsx}`)
  .filter(f => !f.includes('node_modules') && !f.includes('dist'));

const importMap = {};   // { file: [files it imports] }
const importedBy = {};  // { file: [files that import it] }

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const importPattern = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  let match;
  const imports = [];

  while ((match = importPattern.exec(content)) !== null) {
    const importPath = match[1];
    // Only local imports (not from node_modules)
    if (importPath.startsWith('.') || importPath.startsWith('@/') || importPath.startsWith('src/')) {
      imports.push(importPath);

      // Resolve relative path
      let resolved;
      if (importPath.startsWith('.')) {
        resolved = path.resolve(path.dirname(filePath), importPath);
      } else {
        resolved = importPath.replace('@/', srcDir + '/').replace('src/', srcDir + '/');
      }

      // Normalize (add extension if missing)
      const resolvedNorm = resolved.replace(/\.(ts|tsx|js|jsx)$/, '');

      if (!importedBy[resolvedNorm]) importedBy[resolvedNorm] = [];
      importedBy[resolvedNorm].push(filePath);
    }
  }

  importMap[filePath] = imports;
}

// Generate report
let md = `# Dependency Map — ${new Date().toISOString().split('T')[0]}\n\n`;

// Most imported files
md += `## Most imported files (most shared)\n\n`;
md += `| File | Imported by N files | Importers |\n`;
md += `|---|---|---|\n`;

const sorted = Object.entries(importedBy)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 20);

for (const [file, importers] of sorted) {
  const uniqueImporters = [...new Set(importers)];
  md += `| ${file} | ${uniqueImporters.length} | ${uniqueImporters.slice(0, 5).join(', ')}${uniqueImporters.length > 5 ? '...' : ''} |\n`;
}

const outputDir = '.claude';
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'dependency-map.md'), md);

console.log(`Map generated at .claude/dependency-map.md`);
```

### Path C: With existing tools

```bash
# madge — dependency visualization
npm install -g madge
madge src/ --extensions ts,tsx --json > .claude/deps-raw.json

# Generate image (requires graphviz)
madge src/ --extensions ts,tsx --image .claude/dependency-graph.svg
```

---

## 5. Step 4: Assemble the Legacy CLAUDE.md {#5-assemble}

### Objective

With the 3 generated files (`.claude/inventory.md`, `.claude/duplicates.md`, `.claude/dependency-map.md`), assemble the final CLAUDE.md.

### Assembly process (with the AI)

```
I have 3 diagnostic files for my project:
- .claude/inventory.md — file and export inventory
- .claude/duplicates.md — detected duplicates
- .claude/dependency-map.md — dependency map

I need you to generate a CLAUDE.md for this legacy project.
The CLAUDE.md must reflect the REALITY of the project, not an ideal state.

Use this exact structure:

1. <protocolo_anti_duplicacion>
   - List the files where reusable functionality exists
     (use the most imported files from the dependency-map)
   - For large files (>300 lines), include how many functions they have
   - Include the instruction to read .claude/inventory.md

2. <duplicacion_conocida>
   - Take the EXACT duplicates from duplicates.md
   - For each duplicate pair, indicate which is the "canonical" version
     (the one in the most imported file, or the most complete one)
   - Explicitly state "use X, IGNORE Y"

3. <regla_de_variacion>
   - Take the variants from duplicates.md
   - Generate concrete examples of "DON'T create a variant, extend existing"
     based on the actual variants found

4. <archivos_grandes>
   - List the CRITICAL and HIGH files from the inventory
   - Include directive to not add more functions to these files

5. <mejora_oportunista>
   - Directive to extract functions when touching them, propose improvements
   - DO NOT reorganize entire files, only improve what you touch

6. <convenciones_naming_minimas>
   - Minimal naming subset so everything new is consistent
   - Files: verbNoun.ts for functions, domain.type.ts for domain files
   - Functions: verbNoun() for actions, is/has for booleans
   - Location: where to put new files, when to create shared/ and barrel files
   - IMPORTANT: include only the essentials. Don't copy the complete
     conventions from the guide — only what applies to newly extracted files.

7. Current project structure section (markdown)
   - Describe the REAL project structure
   - List main files with a description of what they contain

8. Inventory section
   - Reference to .claude/inventory.md

Generate the complete CLAUDE.md ready to save.
```

### How each source maps to each section

```
+----------------------+     +--------------------------------------+
| .claude/inventory.md |---->| <protocolo_anti_duplicacion>          |
|                      |     |   List of files with reusable         |
| (files + exports)    |     |   functionality and their size        |
|                      |---->| <archivos_grandes>                    |
|                      |     |   CRITICAL and HIGH files             |
|                      |---->| ## Current project structure          |
|                      |     |   Description of what's where         |
+----------------------+     +--------------------------------------+

+----------------------+     +--------------------------------------+
| .claude/duplicates.md|---->| <duplicacion_conocida>                |
|                      |     |   Duplicate pairs with which to use   |
| (exact duplicates,   |---->| <regla_de_variacion>                  |
|  variants, patterns) |     |   Real examples of "don't create,     |
|                      |     |   extend existing"                    |
+----------------------+     +--------------------------------------+

+--------------------------+ +--------------------------------------+
| .claude/dependency-map.md|>| <protocolo_anti_duplicacion>          |
|                          | |   Search order: most imported files   |
| (who imports from whom)  | |   first                              |
+--------------------------+ +--------------------------------------+

+--------------------------+ +--------------------------------------+
| anti-duplication-guide   |>| <convenciones_naming_minimas>         |
| (section 4: Naming)      | |   Minimal adapted subset:             |
|                          | |   only what applies to new code       |
| A minimal subset is      |>| <mejora_oportunista>                  |
| extracted, NOT all copied | |   How to improve when touching +      |
|                          | |   naming                              |
+--------------------------+ +--------------------------------------+
```

### Concrete assembly example

**Input data (simplified):**

```
inventory.md says:
  - utils.ts: 800 lines, 40 exports (formatCurrency, formatDate, debounce...)
  - helpers.ts: 600 lines, 25 exports (formatCurrency, handleApiError...)
  - api.ts: 1200 lines, 28 exports
  - validation.ts: 400 lines, 15 exports

duplicates.md says:
  - formatCurrency: utils.ts:437 = helpers.ts:201 (exact)
  - validateEmail: validation.ts:15 ~ auth.ts:180 (variant, different regex)
  - formatDate: utils.ts:89 ~ helpers.ts:340 (variant, different library)

dependency-map.md says:
  - utils.ts imported by 18 files
  - types.ts imported by 15 files
  - helpers.ts imported by 12 files
  - validation.ts imported by 8 files
```

**Generated CLAUDE.md:**

```markdown
# Project Directives

<protocolo_anti_duplicacion>
MANDATORY — Before creating ANY new function, type, or component:

1. Search if it already exists:
   - Grep("[name]") and Grep("[keyword]") in src/

2. Files with reusable functionality (search here first):
   - src/utils.ts — 40 utility functions (formatting, general helpers)
     -> Imported by 18 files. It's the most reused file in the project.
   - src/types.ts — 35 project types/interfaces
     -> Imported by 15 files.
   - src/helpers.ts — 25 helper functions (HTTP, formatting)
     -> Imported by 12 files. (warning) Has duplicates with utils.ts.
   - src/validation.ts — 15 validation functions
     -> Imported by 8 files.
   - src/database.ts — 18 data access functions
   - src/auth.ts — 12 authentication functions

3. For the complete function inventory: read .claude/inventory.md

4. If you find nothing reusable -> create in a NEW file (don't add
   to existing files with 300+ lines). Report what was created.
</protocolo_anti_duplicacion>

<duplicacion_conocida>
Functions that exist in MULTIPLE locations. Use ONLY the indicated version:

| Function | USE (canonical) | IGNORE (duplicate) | Type |
|---|---|---|---|
| formatCurrency | src/utils.ts:437 | src/helpers.ts:201 | Exact |
| formatDate | src/utils.ts:89 | src/helpers.ts:340 | Variant (utils uses Intl, helpers uses moment) |
| validateEmail | src/validation.ts:15 | src/auth.ts:180 | Variant (validation has stricter regex) |
| getUserById | src/database.ts:45 | src/api.ts:234 | Variant (api.ts adds joins) |

DO NOT create new versions of these functions.
If you need different functionality, extend the canonical version.
</duplicacion_conocida>

<regla_de_variacion>
If you need functionality similar to something existing, EXTEND the existing one.
Examples based on actual duplicates found in this project:

BAD: Create formatDateShort() alongside formatDate() from utils.ts
GOOD: Add parameter: formatDate(date, { format: 'short' })

BAD: Create validateEmailStrict() alongside validateEmail() from validation.ts
GOOD: Add parameter: validateEmail(email, { strict: true })

BAD: Create getUserWithRoles() alongside getUserById() from database.ts
GOOD: Add parameter: getUserById(id, { include: ['roles'] })
</regla_de_variacion>

<archivos_grandes>
These files are already too large. DO NOT add more code to them:
- src/api.ts (1200 lines) — New endpoints go in separate files
- src/utils.ts (800 lines) — New utilities go in separate files
- src/helpers.ts (600 lines) — New helpers go in separate files
- src/components/UserManagement.tsx (1000 lines)
- src/components/Dashboard.tsx (800 lines)

When you modify these files, PROPOSE extracting the modified function
to its own file.
</archivos_grandes>

<mejora_oportunista>
When you modify an existing file for a task:
1. If the function you're modifying could live in its own file ->
   PROPOSE (don't do automatically) extracting it to a separate file.
2. If you detect duplicate code in the file -> INFORM the user.
3. DO NOT reorganize the entire file. Only improve what you touch.
4. Apply the naming conventions from <convenciones_naming_minimas>
   for every new file you create.
</mejora_oportunista>

<convenciones_naming_minimas>
When creating new files (extraction or new functionality), follow these
conventions so everything new is consistent and discoverable by Glob:

Files:
| Type | Pattern | Example |
|---|---|---|
| Function/utility | verbNoun.ts | formatCurrency.ts, validateEmail.ts |
| Service | verbNoun.service.ts | createUser.service.ts |
| Controller | domain.controller.ts | user.controller.ts |
| Routes/endpoint | domain.routes.ts | user.routes.ts |
| Validation | domain.validation.ts | user.validation.ts |
| Types | domain.types.ts | payment.types.ts |
| Component | PascalCase.tsx | UserCard.tsx |
| Hook | useName.ts | useAuth.ts |

Functions: verbNoun() for actions, is/has/can for booleans,
get/fetch/find for data reading. Constants in UPPER_SNAKE_CASE.

Location:
- New standalone file -> src/[name].ts
- When 3+ files of the same type accumulate -> group in a folder
  with index.ts (barrel). E.g.: 3 validations -> src/shared/validation/
</convenciones_naming_minimas>

## Current project structure
- src/utils.ts — Mixed utility functions (formatting, strings, async, etc.)
- src/helpers.ts — HTTP helpers and formatting (overlap with utils.ts)
- src/types.ts — All types and interfaces
- src/constants.ts — All constants
- src/api.ts — All REST endpoints
- src/database.ts — All queries
- src/auth.ts — Authentication and authorization
- src/validation.ts — Data validations
- src/components/ — React components (large files)
- src/styles/ — CSS

## Detailed inventory
See .claude/inventory.md for complete list of functions, types, and components.

## Known duplicates
See .claude/duplicates.md for detailed list of detected duplication.
```

---

## 6. Step 5: Validate and Refine {#6-validate}

### Objective

Verify that the AI understands and correctly uses the generated CLAUDE.md.

### Validation test

After creating the CLAUDE.md, run these test prompts in a new session:

**Test 1: Does it discover existing functions?**

```
I need to format a value as currency. Does anything in the project
already do this?
```

**Expected result:** The AI should respond that `formatCurrency` already exists in `src/utils.ts:437` without needing to search. If it doesn't, the CLAUDE.md needs more detail.

**Test 2: Does it respect the canonical version?**

```
I need to validate an email. Which function do I use?
```

**Expected result:** The AI should respond `validateEmail` from `src/validation.ts:15`, not the one from `auth.ts:180`.

**Test 3: Does it avoid adding to large files?**

```
I need a function that formats a Chilean RUT.
```

**Expected result:** The AI should create `src/formatRut.ts` (new file), NOT add the function to `utils.ts` or `helpers.ts`.

**Test 4: Does it extend instead of creating a variant?**

```
I need to format currency but without decimals.
```

**Expected result:** The AI should propose modifying `formatCurrency` in `utils.ts` to accept a `decimals` parameter, not create `formatCurrencyNoDecimals`.

**Test 5: Does it apply naming conventions when creating new files?**

```
I need a function that formats a Chilean RUT and another that validates
phone numbers. Implement them.
```

**Expected result:** The AI should create:
- `src/formatRut.ts` (not `rut-formatter.ts`, not `rutUtils.ts`, not inside `utils.ts`)
- `src/validatePhone.ts` (not `phone-validator.ts`, not `phoneValidation.ts`)
- Both following the `verbNoun.ts` pattern

If the AI creates files with inconsistent names, the `<convenciones_naming_minimas>` section needs clearer examples or should be positioned higher in the CLAUDE.md.

**Test 6: Does it propose creating shared/ when files accumulate?**

(Run after having created 3+ loose validation files)

```
I just noticed we have validateEmail.ts, validatePhone.ts, and
validateRut.ts loose in src/. Should we organize them?
```

**Expected result:** The AI should propose creating `src/shared/validation/` with a barrel file `index.ts` that exports all three validations. If it doesn't, the "3+ files -> folder with barrel" rule needs to be more explicit.

### Refinement

If any test fails, adjust the CLAUDE.md:
- If the AI doesn't find functions -> add more detail to the inline inventory
- If the AI doesn't respect the canonical version -> make the `<duplicacion_conocida>` section more explicit
- If the AI adds to large files -> make the `<archivos_grandes>` section more emphatic
- If the AI creates variants -> add more examples to `<regla_de_variacion>`

---

## 7. Process Automation {#7-automation}

### So the diagnostic isn't a one-time effort

The Step 1-3 diagnostic must be repeated periodically as the project evolves. Automating it prevents the CLAUDE.md from becoming outdated.

### Unified diagnostic script

```javascript
#!/usr/bin/env node
/**
 * Complete project diagnostic.
 * Runs all 3 analyses and generates files in .claude/
 *
 * Usage: node scripts/diagnose.js [src_dir]
 * Output:
 *   .claude/inventory.md
 *   .claude/duplicates-by-name.md
 *   .claude/dependency-map.md
 *   .claude/diagnosis-summary.md (executive summary)
 */

const { execSync } = require('child_process');

const srcDir = process.argv[2] || 'src';

console.log('=== Project Diagnostic ===\n');

console.log('Step 1: Generating inventory...');
execSync(`node scripts/diagnose-project.js ${srcDir}`, { stdio: 'inherit' });

console.log('\nStep 2: Detecting duplicates...');
execSync(`node scripts/detect-duplicates.js ${srcDir}`, { stdio: 'inherit' });

console.log('\nStep 3: Generating dependency map...');
execSync(`node scripts/dependency-map.js ${srcDir}`, { stdio: 'inherit' });

console.log('\n=== Diagnostic complete ===');
console.log('Files generated in .claude/');
console.log('Next step: use these files to assemble the CLAUDE.md');
console.log('(see legacy-diagnostic-process.md, Step 4)');
```

### Integration in package.json

```json
{
  "scripts": {
    "diagnose": "node scripts/diagnose.js src",
    "diagnose:update": "node scripts/diagnose.js src && echo 'Update CLAUDE.md with the new data'"
  }
}
```

### Recommended frequency

| Event | Action |
|---|---|
| First time | Run complete diagnostic + assemble CLAUDE.md |
| Every week (or sprint) | `npm run diagnose:update` to refresh data |
| After large refactoring | Complete diagnostic + re-assemble CLAUDE.md |
| When noticing the AI duplicates something | Verify if the CLAUDE.md reflects reality |

---

## 8. Ongoing Maintenance {#8-maintenance}

### The CLAUDE.md must evolve with the project

As opportunistic improvement (Phase 3 of `applicability-and-migration.md`) organizes the project, the CLAUDE.md must reflect the changes:

**Evolution example:**

```markdown
<!-- MONTH 1: The project is pure legacy -->
<protocolo_anti_duplicacion>
Search in:
- src/utils.ts — 800 lines, 40 functions
- src/helpers.ts — 600 lines, 25 functions
...
</protocolo_anti_duplicacion>

<!-- MONTH 3: Functions were extracted, shared/ appeared -->
<protocolo_anti_duplicacion>
Search in (priority):
1. src/shared/formatting/ — formatCurrency, formatDate, formatPhone, formatRut
2. src/shared/validation/ — validateEmail, validatePhone, validateRut
3. src/utils.ts — 300 lines, 15 remaining functions (legacy)
4. src/helpers.ts — DELETED, everything migrated to shared/
...
</protocolo_anti_duplicacion>

<!-- MONTH 6: The project is mostly organized -->
<protocolo_anti_duplicacion>
Search in:
1. Barrel file of the current feature: src/features/[domain]/index.ts
2. src/shared/[category]/index.ts
3. src/types/ for shared types
Only if nothing exists -> create new.
</protocolo_anti_duplicacion>
```

### When to update the CLAUDE.md

| Event | What to update |
|---|---|
| Function extracted from large file | Update location in `<protocolo_anti_duplicacion>` |
| A duplicate was eliminated | Remove from `<duplicacion_conocida>` |
| New shared/ was created | Add to `<protocolo_anti_duplicacion>` |
| A large file was reduced to < 300 lines | Remove from `<archivos_grandes>` |
| Barrel file was created | Mention in the structure section |

### Self-maintenance directive

Add to CLAUDE.md:

```markdown
<auto_mantenimiento>
When you modify the project:
- If you extract a function to its own file -> update the location
  in <protocolo_anti_duplicacion> of this CLAUDE.md
- If you eliminate a duplicate -> remove it from <duplicacion_conocida>
- If you create something in shared/ -> add it to <protocolo_anti_duplicacion>
- If a large file drops below 300 lines -> remove it from <archivos_grandes>
</auto_mantenimiento>
```

---

## Complete process summary

```
STEP 1: Project Scan
  Input:  Project source code
  Tool:   diagnose-project.js script OR AI prompt
  Output: .claude/inventory.md

STEP 2: Duplicate detection
  Input:  .claude/inventory.md + source code
  Tool:   detect-duplicates.js script + jscpd + AI prompt
  Output: .claude/duplicates.md

STEP 3: Dependency map
  Input:  Source code (imports)
  Tool:   dependency-map.js script OR madge
  Output: .claude/dependency-map.md

STEP 4: Assemble CLAUDE.md
  Input:  The 3 previous files
  Tool:   AI prompt with assembly instructions
  Output: CLAUDE.md (legacy version)

STEP 5: Validate
  Input:  Generated CLAUDE.md
  Tool:   Test prompts in a new session
  Output: Refinements to CLAUDE.md

MAINTENANCE: Repeat Steps 1-3 periodically, update CLAUDE.md
```

---

> **Note:** This entire process can be run in a single Claude Code session. The scripts are optional — the AI can do all the analysis directly. The scripts exist to automate repetition and avoid consuming AI context on routine diagnostics.
