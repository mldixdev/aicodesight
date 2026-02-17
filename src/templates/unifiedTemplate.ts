import {
  ProjectProfile, InventoryData, DuplicateData, DependencyData,
  ModuleMapData, TemplateSectionFlags, ClaudeMdOptions, StructuralDuplicationSummary,
} from '../types';
import { resolveCanonicals } from '../analyzers/canonicalResolver';
import {
  buildNamingConventions,
  buildRecommendedStructure,
  buildProjectStructure,
  buildModulesSection,
  buildDuplicateSection,
} from './templateHelpers';

// ── Main entry point ────────────────────────────────────────────────

export function generateUnifiedTemplate(
  profile: ProjectProfile,
  inventory: InventoryData,
  duplicates: DuplicateData,
  deps: DependencyData,
  modules: ModuleMapData,
  flags: TemplateSectionFlags,
  options?: ClaudeMdOptions,
): string {
  const parts: string[] = [];

  // Title
  const isLegacy = flags.duplicates === 'confidence-tiers';
  parts.push(isLegacy
    ? '# Project Directives — Legacy Diagnosis'
    : '# Project Directives');

  // Prescriptive sections (new projects)
  parts.push(renderPrescriptive(profile, inventory, flags));

  // Directive sections
  parts.push(renderDirectives(profile, inventory, duplicates, deps, flags));

  // Data sections
  parts.push(renderDataSections(profile, inventory, duplicates, deps, flags, options));

  // Behavior sections
  parts.push(renderBehavior(profile, flags));

  // Project data
  parts.push(renderProjectData(profile, inventory, modules, flags, options));

  return parts.filter(Boolean).join('\n\n');
}

// ── Prescriptive sections ───────────────────────────────────────────

function renderPrescriptive(
  profile: ProjectProfile,
  inventory: InventoryData,
  flags: TemplateSectionFlags,
): string {
  const parts: string[] = [];

  if (flags.principles) {
    parts.push(renderPrinciples(profile));
  }

  if (flags.recommendedStructure) {
    parts.push(buildRecommendedStructure(profile));
  }

  if (flags.blueprintRef) {
    parts.push(`<architectural_blueprint>
If .claude/blueprint.md exists, read it before creating files — it contains patterns
specific to the detected tech stack. If it doesn't exist:
- Follow the structure in <recommended_structure>
- Apply the 6 principles from <ai_friendly_architecture_principles>
- Create barrels (index.ts) in each new folder
- Group by domain: everything related to "auth" in features/auth/, etc.
</architectural_blueprint>`);
  }

  return parts.filter(Boolean).join('\n\n');
}

function renderPrinciples(profile: ProjectProfile): string {
  const hasDotNet = profile.frameworks.includes('.NET');
  const principle3Body = hasDotNet
    ? `
**TypeScript:** ~200-350 lines per file, one main export. A 120-line file with 8 exported functions is still a "mini black box". The file can have internal private helpers, but should have one main export that matches its name.

**.NET:** ~350-500 lines per file, one class per file. .NET is more verbose (usings, constructors with DI, attributes, Fluent API configurations), so a cohesive ~400-line class is normal. The criterion is single responsibility, not a rigid line count.`
    : `
A file exceeding ~350 lines likely has more than one responsibility and should be split.

**Complementary rule: one main public export per file.** Not only does line count matter, but also the number of exports. A 120-line file with 8 exported functions is still a "mini black box" because the filename cannot describe 8 things. The file can have internal private helpers, but should have one main export that matches its name.`;

  const dotNetExceptions = hasDotNet
    ? `
- .NET classes with extensive DI (Services, Repositories with multiple dependencies)
- Entity configurations (Fluent API) with many properties`
    : '';

  return `<ai_friendly_architecture_principles>
These 6 principles guide ALL structure and code decisions.
Follow them BEFORE creating any file — they are not suggestions, they are rules.

### Principle 1: One file, one responsibility

Each file should do exactly one thing. Not a file with "all utilities" but one file per utility.

\`\`\`
❌ utils.ts          → 400 lines, 20 mixed functions
✅ formatCurrency.ts → 15 lines, one clear function
✅ formatDate.ts     → 20 lines, one clear function
✅ validateEmail.ts  → 10 lines, one clear function
\`\`\`

### Principle 2: Self-documenting names

The filename should describe its content with enough precision for AI (and humans) to know what it contains without opening it.

\`\`\`
❌ service.ts            → Which service?
❌ handler.ts            → What does it handle?
❌ utils.ts              → Which utilities?

✅ createUser.service.ts → Creates users
✅ paymentWebhook.handler.ts → Handles payment webhooks
✅ formatCurrency.ts     → Formats currency
\`\`\`

### Principle 3: Maximum file size and single responsibility
${principle3Body}

\`\`\`
❌ formatters.ts → exports formatCurrency, formatDate, formatPhone, formatRut
✅ formatCurrency.ts → exports formatCurrency (can have internal helpers)
\`\`\`

**Valid exceptions:**
- UI components with extensive but cohesive markup
- Configuration files
- Database migrations
- Type files (*.types.ts) grouping types from one domain
- Constants files (*.constants.ts) grouping constants from one domain${dotNetExceptions}

### Principle 4: Predictable structure by convention

AI should be able to infer where to look for something based on convention, without needing to explore the entire project.

\`\`\`
Need a formatting utility?         → shared/formatting/
Need user logic?                   → features/users/
Need a UI component?               → shared/ui/
Need payment validation?           → features/payments/payment.validation.ts
\`\`\`

### Principle 5: Barrel files as a map

Each folder has an \`index.ts\` that exports everything public and serves as a table of contents.

\`\`\`typescript
// src/shared/formatting/index.ts
// Data formatting utilities for user-facing presentation
export { formatCurrency } from './formatCurrency';
export { formatDate } from './formatDate';
export { formatPhone } from './formatPhone';
\`\`\`

### Principle 6: Group by domain/feature, NOT by technical type

\`\`\`
❌ Grouping by technical type:
src/
  controllers/    → all controllers mixed together
  services/       → all services mixed together
  models/         → all models mixed together

✅ Grouping by domain:
src/
  features/
    auth/         → everything auth-related together
    users/        → everything user-related together
    payments/     → everything payment-related together
\`\`\`
</ai_friendly_architecture_principles>`;
}

// ── Directive sections ──────────────────────────────────────────────

function renderDirectives(
  profile: ProjectProfile,
  inventory: InventoryData,
  duplicates: DuplicateData,
  deps: DependencyData,
  flags: TemplateSectionFlags,
): string {
  const parts: string[] = [];

  // Anti-duplication protocol
  parts.push(renderAntiDuplication(inventory, flags));

  // Variation rule
  parts.push(renderVariationRule(duplicates, flags));

  // Location rule
  parts.push(renderLocationRule(profile, flags));

  // Full conventions block (new projects)
  if (flags.conventionsFull) {
    parts.push(renderConventionsFull(profile));
  }

  // CSS rules (new projects)
  if (flags.cssRules) {
    parts.push(`<css_rules>
- NEVER hardcode colors, spacing, breakpoints, or font-sizes.
  Centralize in shared/styles/tokens.ts (or the project's equivalent location).
- Media queries: use a centralized media object, no manual breakpoints.
- Animations: centralize keyframes, don't redefine per component.
- If 3+ CSS properties repeat in 2+ components → extract to a mixin.
</css_rules>`);
  }

  // Additional rules (new projects)
  if (flags.additionalRules) {
    parts.push(`<additional_rules>
- Don't create premature abstractions for functionality used in only one place
- If a type is needed in 2+ features, move it to shared/types/
</additional_rules>`);
  }

  return parts.filter(Boolean).join('\n\n');
}

function renderAntiDuplication(
  inventory: InventoryData,
  flags: TemplateSectionFlags,
): string {
  const verbosity = flags.antiDuplication;

  if (verbosity === 'verbose') {
    // Legacy: detailed 4-step protocol with examples
    return `<anti_duplication_protocol>
MANDATORY: Before creating ANY new function, component, utility, helper, type, or service, execute this 4-step search protocol:

Step 0 — Check existing context:
- Review the "Available modules" section of this CLAUDE.md and .claude/capability-index.json

Step 1 — Glob by name:
- Glob("**/*[keyword]*") in the project
- Example: if you're about to create data formatting → Glob("**/*format*"), Glob("**/*transform*")

Step 2 — Read relevant barrels:
- Read the index.ts files in shared/, utils/, helpers/, common/ folders
- Check if similar functionality is already exported

Step 3 — Grep for similar functionality:
- Grep("[similar_function_name]") in src/
- Search for name variations

Step 4 — Decide action:
- If something IDENTICAL exists → reuse directly
- If something SIMILAR but not identical exists → extend/parameterize the existing one (DO NOT create a new variant)
- If NOTHING related exists → create new code
</anti_duplication_protocol>`;
  }

  if (verbosity === 'medium') {
    // Standard: concise numbered list
    return `<anti_duplication_protocol>
MANDATORY: Before creating ANY new function, component, utility, helper, type, or service, execute this protocol:

0. Check the "Available modules" section of this CLAUDE.md and .claude/capability-index.json
1. Glob("**/*[keyword]*") in the project
2. Read index.ts from shared/ and reusable folders
3. Grep("[similar_name]") in src/
4. If something similar exists → extend/parameterize, DO NOT create a variant
5. Only if nothing exists → create new

If the user doesn't mention existing code → ASK if something similar exists.
CRITICAL: This protocol applies from the SECOND file you create. Don't wait until you have "many files".
When completing a task → list what you reused and what you created.
</anti_duplication_protocol>`;
  }

  // light: same as medium but with conditional note for empty projects
  const emptyNote = inventory.stats.totalFiles === 0
    ? `IMPORTANT: This protocol applies from the FIRST file you create.
When creating the second component, service, or feature, verify that similar functionality doesn't already exist.

`
    : '';

  return `<anti_duplication_protocol>
${emptyNote}Before creating new code, follow this protocol:
0. Check the "Available modules" section of this CLAUDE.md and .claude/capability-index.json
1. Glob("**/*[keyword]*") in the project
2. Read index.ts from relevant shared/ and common/ folders
3. Grep("[similar_name]") in src/
4. If something similar exists → extend/parameterize, DO NOT create a variant
5. Only if nothing exists → create new

If the user doesn't mention existing code → ASK if something similar exists.
When completing a task → list what you reused and what you created.
</anti_duplication_protocol>`;
}

function renderVariationRule(
  duplicates: DuplicateData,
  flags: TemplateSectionFlags,
): string {
  if (flags.variationRule === 'verbose' && duplicates.duplicates.length > 0) {
    const example = duplicates.duplicates[0];
    return `<variation_rule>
If you find similar but not identical functionality, ALWAYS parameterize the existing one instead of creating a variant.

Example from this project:
- \`${example.name}\` exists in: ${example.locations.map(l => l.file).join(', ')}
- DO NOT create another variant — reuse or extend the existing one.
</variation_rule>`;
  }

  return `<variation_rule>
If you find similar but not identical functionality, ALWAYS parameterize the existing one.
</variation_rule>`;
}

function renderLocationRule(
  profile: ProjectProfile,
  flags: TemplateSectionFlags,
): string {
  const hasMonorepo = profile.structure === 'monorepo';

  if (flags.locationRule === 'verbose') {
    // Legacy: prose format with explanations
    const content = hasMonorepo
      ? `Where should new code go?
- Needed by BOTH packages (front and back) → packages/common/
- Needed by 2+ features in the same package → packages/[package]/src/shared/
- Needed by only 1 feature → inside that feature

Never create something in shared/ or common/ preemptively. Only move when 2+ consumers confirm they need it.`
      : `Where should new code go?
- Needed by 2+ modules/features → src/shared/
- Needed by only 1 module → inside that module
- Is configuration → src/config/

Never create something in shared/ preemptively. Only move when 2+ consumers confirm they need it.`;

    return `<location_rule>\n${content}\n</location_rule>`;
  }

  // light / medium: compact bullet list
  const content = hasMonorepo
    ? `- Needed by BOTH packages → packages/common/
- Needed by 2+ features in the same package → shared/ within the package
- Needed by only 1 feature → inside that feature
- Never put in shared/ preemptively`
    : `- Needed by 2+ modules/features → src/shared/
- Needed by only 1 module → inside that module
- Never ${flags.locationRule === 'medium' ? 'create something in shared/ preemptively' : 'put in shared/ preemptively'}`;

  return `<location_rule>\n${content}\n</location_rule>`;
}

function renderConventionsFull(profile: ProjectProfile): string {
  const hasDotNet = profile.frameworks.includes('.NET');
  const namingConventions = buildNamingConventions(profile, 'inline');

  const filesSection = hasDotNet
    ? `- TypeScript: maximum ~350 lines per file, 1 main export
- .NET: maximum ~500 lines per file, 1 class per file
- 1 file = 1 responsibility
- In frontend: each folder with index.ts (barrel) exporting public members`
    : `- Maximum ~350 lines per file. If exceeded, split.
- 1 file = 1 responsibility = 1 main export
- Each folder with index.ts (barrel) exporting public members`;

  return `<conventions>
### Files
${filesSection}

${namingConventions}

### Imports
- ALWAYS import from the barrel (index.ts), not from internal files
- Don't duplicate types that already exist in shared/ or common/
- Don't create wrapper functions that only re-export without adding value
</conventions>`;
}

// ── Data sections ───────────────────────────────────────────────────

function renderDataSections(
  profile: ProjectProfile,
  inventory: InventoryData,
  duplicates: DuplicateData,
  deps: DependencyData,
  flags: TemplateSectionFlags,
  options?: ClaudeMdOptions,
): string {
  const parts: string[] = [];

  parts.push(renderDuplicates(duplicates, inventory, deps, flags));
  parts.push(renderCrossStackMirrors(duplicates));
  parts.push(renderStructuralDuplication(options?.structuralSummary));
  parts.push(renderLargeFiles(inventory, flags));
  parts.push(renderGenericFiles(inventory, flags));
  parts.push(renderCriticalDeps(deps, flags));

  return parts.filter(Boolean).join('\n\n');
}

function renderDuplicates(
  duplicates: DuplicateData,
  inventory: InventoryData,
  deps: DependencyData,
  flags: TemplateSectionFlags,
): string {
  const mode = flags.duplicates;

  if (mode === 'conditional') {
    // Only show if duplicates exist
    if (duplicates.totalDuplicateNames === 0) return '';

    const dupList = duplicates.duplicates.slice(0, 10)
      .map(d => `- \`${d.name}\` (${d.type}) in: ${d.locations.map(l => l.file).join(', ')}`)
      .join('\n');

    return `<known_duplication>
${duplicates.totalDuplicateNames} duplicate exports detected:

${dupList}

Before creating code involving these names, verify whether the existing implementations suffice.
</known_duplication>`;
  }

  if (mode === 'confidence-tiers') {
    // Legacy: full confidence-tier breakdown
    const resolved = resolveCanonicals(duplicates, inventory, deps);
    const dupSection = buildDuplicateSection(resolved);

    return `<known_duplication>
${duplicates.totalDuplicateNames} duplicate exports detected.
Each analyzed with 8 signals (semantic name, dependencies, popularity, etc.) to determine the canonical version:

${dupSection}

IMPORTANT: Use the indicated canonical version. For those marked as "ambiguous", ask the user.
DO NOT create new versions of these functions/types.
</known_duplication>`;
  }

  // 'resolved': standard resolver without tiers
  const resolved = resolveCanonicals(duplicates, inventory, deps);
  const dupSection = resolved.length > 0
    ? resolved.slice(0, 15).map(r => {
        const reasons = r.canonical.reasons.length > 0 ? ` (${r.canonical.reasons.join(', ')})` : '';
        if (r.confidence === 'low') {
          const locs = [r.canonical, ...r.alternatives].map(l => l.file).join(' vs ');
          return `- \`${r.name}\` (${r.type}) → ambiguous: ${locs}`;
        }
        const ignoreList = r.alternatives.map(a => a.file).join(', ');
        const sig = r.canonical.signature ? `\n  Signature: \`${r.canonical.signature}\`` : '';
        return `- \`${r.name}\` (${r.type}) → use ${r.canonical.file}:${r.canonical.line}${reasons}, IGNORE ${ignoreList}${sig}`;
      }).join('\n')
    : 'No duplicates detected.';

  return `<known_duplication>
${duplicates.totalDuplicateNames} duplicate names detected:

${dupSection}
</known_duplication>`;
}

function renderCrossStackMirrors(duplicates: DuplicateData): string {
  const mirrors = duplicates.crossStackMirrors;
  if (!mirrors || mirrors.length === 0) return '';

  const lines = mirrors.slice(0, 15).map(m => {
    const backendLoc = m.locations.find(l => l.file.endsWith('.cs'));
    const frontendLoc = m.locations.find(l => !l.file.endsWith('.cs'));
    if (backendLoc && frontendLoc) {
      return `- \`${m.name}\` (${m.type}) — ${backendLoc.file} ↔ ${frontendLoc.file}`;
    }
    return `- \`${m.name}\` (${m.type}) — ${m.locations.map(l => l.file).join(' ↔ ')}`;
  }).join('\n');

  return `<api_mirrors>
${mirrors.length} types shared between backend and frontend (API contract mirrors):

${lines}

When modifying a DTO in one stack, verify that the mirror in the other stack is also updated.
These are NOT duplicates to eliminate — they are the typed contract between stacks.
</api_mirrors>`;
}

function renderStructuralDuplication(summary?: StructuralDuplicationSummary): string {
  if (!summary || summary.totalPatterns === 0) return '';

  const threshold = summary.significantPairThreshold ?? 5;
  const significantPairs = summary.filePairs.filter(p => p.sharedPatterns >= threshold);

  if (significantPairs.length === 0) return '';

  const pairs = significantPairs.slice(0, 10)
    .map(p => `- ${p.fileA} ↔ ${p.fileB} (${p.sharedPatterns} similar blocks)`)
    .join('\n');

  return `<structural_duplication>
${significantPairs.length} file pairs with significant duplication (>=${threshold} shared blocks, ~${summary.estimatedDuplicateLines} consolidatable lines):

${pairs}

When working on these files, look for opportunities to extract shared logic.
The structural-duplication guard will detect new repetitions when writing.
</structural_duplication>`;
}

function renderLargeFiles(
  inventory: InventoryData,
  flags: TemplateSectionFlags,
): string {
  const mode = flags.largeFiles;
  const criticalFiles = inventory.files.filter(f => f.classification === 'critical');
  const highFiles = inventory.files.filter(f => f.classification === 'high');

  if (mode === 'conditional') {
    const hasLargeFiles = criticalFiles.length > 0 || highFiles.length > 0;
    if (!hasLargeFiles) return '';

    const largeList = [...criticalFiles, ...highFiles]
      .map(f => `- ${f.path} (${f.lines} lines, ${f.exports.length} exports)`)
      .join('\n');

    return `<large_files>
${largeList}

Consider extracting functionality into smaller files. Don't add more code to large files.
</large_files>`;
  }

  if (mode === 'split-by-severity') {
    // Legacy: separate critical and high sections
    const criticalList = criticalFiles
      .map(f => `- ${f.path} (${f.lines} lines, ${f.exports.length} exports)`)
      .join('\n');
    const highList = highFiles
      .map(f => `- ${f.path} (${f.lines} lines, ${f.exports.length} exports)`)
      .join('\n');

    return `<large_files>
The following files exceed recommended limits and are refactoring candidates:

### Critical (>500 lines):
${criticalList || 'None.'}

### High (300-500 lines):
${highList || 'None.'}

When modifying these files, consider whether it's possible to extract functionality into smaller files.
DO NOT add more code to files that are already large — extract first.
</large_files>`;
  }

  // 'flat': all large files in one list
  const largeFiles = [...criticalFiles, ...highFiles];
  const largeSection = largeFiles.length > 0
    ? largeFiles.map(f => `- ${f.path} (${f.lines} lines, ${f.exports.length} exports)`).join('\n')
    : 'None — the project is within healthy limits.';

  return `<large_files>
${largeSection}

When modifying large files, consider extracting functionality into smaller files.
</large_files>`;
}

function renderGenericFiles(
  inventory: InventoryData,
  flags: TemplateSectionFlags,
): string {
  const genericFiles = inventory.files.filter(f => f.isGeneric);

  if (flags.genericFiles === 'conditional') {
    if (genericFiles.length === 0) return '';

    const genericList = genericFiles.map(f => `- ${f.path}`).join('\n');
    return `<generic_files>
${genericList}

Don't add new functionality to these files. Use descriptive names instead.
</generic_files>`;
  }

  // 'always': show even when empty — suppress since naming conventions already covers this
  if (genericFiles.length === 0) {
    return '';
  }

  // Legacy shows exports, standard just paths
  const isLegacy = flags.duplicates === 'confidence-tiers';
  const genericList = isLegacy
    ? genericFiles.map(f => `- ${f.path} — ${f.exports.map(e => e.name).join(', ')}`).join('\n')
    : genericFiles.map(f => `- ${f.path}`).join('\n');

  return `<generic_files>
${isLegacy ? 'The following files have generic names that hinder navigation:\n\n' : ''}${genericList}

${isLegacy ? 'When adding new functionality, DO NOT add it to these files.\nCreate files with descriptive names (e.g., formatCurrency.ts instead of utils.ts).' : 'When creating new files, use descriptive names (verbNoun.ts, not utils.ts).'}
</generic_files>`;
}

function renderCriticalDeps(
  deps: DependencyData,
  flags: TemplateSectionFlags,
): string {
  if (flags.criticalDeps === 'standard') {
    if (deps.mostImported.length === 0) return '';

    const depList = deps.mostImported.slice(0, flags.duplicates === 'conditional' ? 5 : 10)
      .map(d => `- ${d.file} (imported by ${d.importedByCount} files)`)
      .join('\n');

    return `<critical_dependencies>
${depList}
</critical_dependencies>`;
  }

  // 'with-warning': legacy style with CAUTION
  const depList = deps.mostImported.slice(0, 10)
    .map(d => `- ${d.file} (imported by ${d.importedByCount} files)`)
    .join('\n');

  return `<critical_dependencies>
Most imported files in the project (changes here affect many files):

${depList || 'No dependency data available.'}

CAUTION: When modifying these files, verify that changes don't break consumers.
</critical_dependencies>`;
}

// ── Behavior sections ───────────────────────────────────────────────

function renderBehavior(
  profile: ProjectProfile,
  flags: TemplateSectionFlags,
): string {
  const parts: string[] = [];

  // Intent declaration protocol
  if (flags.intentProtocol) {
    parts.push(renderIntentProtocol(profile.language));
  }

  // Opportunistic improvement
  if (flags.oportunistic !== 'none') {
    parts.push(renderOpportunisticImprovement(flags));
  }

  // Standalone naming conventions
  if (flags.namingMinimas) {
    parts.push(buildNamingConventions(profile, 'standalone'));
  }

  // Transparency rule (always present)
  parts.push(`<transparency_rule>
- If you find duplicate code while working, INFORM the user before continuing.
- If the user requests functionality without mentioning whether something similar already exists, ASK.
- When completing a task, briefly list: what you reused and what you created new.
</transparency_rule>`);

  // Auto-maintenance
  parts.push(renderAutoMaintenance(flags));

  // Post-compact
  parts.push(renderPostCompact(flags));

  // Hooks verification (always present)
  parts.push(`<hooks_verification>
If AICodeSight hooks are not working (guards don't run when editing/writing files),
run: node .claude/hooks/restore-settings.js
This restores hooks in .claude/settings.json from the aicodesight-settings.json backup.
</hooks_verification>`);

  return parts.filter(Boolean).join('\n\n');
}

function renderIntentProtocol(language: ProjectProfile['language']): string {
  const showTs = language === 'typescript' || language === 'javascript' || language === 'mixed';
  const showCs = language === 'csharp' || language === 'mixed';

  const tsBlock = `\`\`\`typescript
/**
 * @intent Description of what this module does and why it exists
 * @domain business-domain
 * @depends-on module1, module2
 */
\`\`\``;

  const csBlock = `\`\`\`csharp
/// <summary>
/// @intent Description of what this class/service does and why it exists
/// @domain business-domain
/// @depends-on Service1, Service2
/// </summary>
\`\`\``;

  const formatBlocks = [
    showTs ? `TypeScript/JavaScript:\n${tsBlock}` : '',
    showCs ? `C#:\n${csBlock}` : '',
  ].filter(Boolean).join('\n\n');

  const tsExclusions = 'index.ts, *.test.ts, *.types.ts, *.config.ts';
  const csExclusions = 'Program.cs, *.Designer.cs, Migrations/';
  const exclusions = [
    showTs ? tsExclusions : '',
    showCs ? csExclusions : '',
  ].filter(Boolean).join(', ');

  return `<intent_declaration_protocol>
When creating new files with exported functions/components, include an
@intent header as a comment at the top of the file.

Format:
${formatBlocks}

- @intent (MANDATORY): what it does and why it exists
- @domain: business domain (payments, auth, generators, etc.)
- @depends-on: list of modules it depends on

ENFORCEMENT: The intent-declaration guard BLOCKS creation of new files
with functional exports that don't include @intent.
Excluded files: ${exclusions}, .claude/
</intent_declaration_protocol>`;
}

function renderOpportunisticImprovement(flags: TemplateSectionFlags): string {
  if (flags.oportunistic === 'cautious') {
    return `<opportunistic_improvement>
When modifying an existing file for a task, PROPOSE improvements to the user (don't apply automatically):

1. If the function you're modifying could live in its own file →
   PROPOSE: "X could be extracted to src/X.ts for better discoverability. Would you like me to do it?"
2. If you detect duplicate code in the file → INFORM the user before continuing
3. If the file has functions that could be extracted → INFORM
4. Apply the naming conventions from <naming_conventions> for every new file you create.

DO NOT reorganize entire files. Only improve what you touch, and only with user approval.
DO NOT perform massive refactorings. Small, incremental changes.
</opportunistic_improvement>`;
  }

  // 'proactive'
  return `<opportunistic_improvement>
Apply incremental improvements proactively when working on code:

1. If a large file has separable functions → extract to their own files directly
2. If you find real duplication → consolidate in one place
3. If an import comes from a generic file → extract the function to its own file
4. If a folder accumulates 3+ files without a barrel → create index.ts
5. Apply the naming conventions from <naming_conventions> for every new file you create.

Boy Scout Rule: leave the code a little better than you found it.
Inform the user what improvements were applied when completing the task.
</opportunistic_improvement>`;
}

function renderAutoMaintenance(flags: TemplateSectionFlags): string {
  if (flags.autoMaintenance === 'extended') {
    return `<auto_maintenance>
- When creating a new file → update the index.ts (barrel) of the corresponding folder.
- When moving code to shared/ → update imports in affected files.
</auto_maintenance>`;
  }

  return `<auto_maintenance>
- When creating a file → update the folder's index.ts
</auto_maintenance>`;
}

function renderPostCompact(flags: TemplateSectionFlags): string {
  if (flags.postCompact === 'extended') {
    return `<post_compact>
If the session was resumed/compacted, before continuing:
- Check .claude/capability-index.json and the "Available modules" section of this CLAUDE.md.
- Reread this complete CLAUDE.md.
- DO NOT assume you remember what code exists — verify before creating.
- Check .claude/inventory.json and .claude/duplicates.json if you need updated data.
</post_compact>`;
  }

  return `<post_compact>
After session summary:
- Check .claude/capability-index.json and the "Available modules" section of this CLAUDE.md
- Reread barrels (index.ts) of modules in use
DO NOT assume you remember what code exists — verify before creating.
</post_compact>`;
}

// ── Project data sections ───────────────────────────────────────────

function renderProjectData(
  profile: ProjectProfile,
  inventory: InventoryData,
  modules: ModuleMapData,
  flags: TemplateSectionFlags,
  options?: ClaudeMdOptions,
): string {
  const isLegacy = flags.duplicates === 'confidence-tiers';

  // Project stats
  const typeLabel = isLegacy ? 'Detected type' : 'Type';
  const stats = `---

## Project data

- **${typeLabel}:** ${profile.type}
- **Structure:** ${profile.structure}
- **Language:** ${profile.language}
- **Frameworks:** ${profile.frameworks.join(', ') || 'None detected'}
- **${isLegacy ? 'Total source files' : 'Source files'}:** ${inventory.stats.totalFiles}
- **Total lines:** ${inventory.stats.totalLines}
- **Total exports:** ${inventory.stats.totalExports}`;

  // Project structure
  const showLineCount = !flags.principles; // new projects don't show line counts
  const flagGenerics = isLegacy;
  const structure = buildProjectStructure(inventory, { showLineCount, flagGenerics });

  // Modules section
  const emptyModulesMsg = flags.principles
    ? `<!-- UPDATE as modules are created — this section is CRITICAL for avoiding duplication -->
<!-- Example of how to document a module:
- **src/shared/formatting/** — Formatting utilities: formatCurrency, formatDate, formatPhone
- **src/shared/ui/** — Reusable components: Button, Modal, Form, Input
- **src/features/auth/** — Authentication: login, register, resetPassword
-->`
    : isLegacy
      ? '<!-- No modules with barrels or projects detected. UPDATE as they are created. -->'
      : '<!-- No modules detected. UPDATE as they are created. -->';

  const modulesSection = buildModulesSection(modules, inventory, emptyModulesMsg, options?.capabilityIndex);

  // Reference files
  const referenceFiles = renderReferenceFiles(flags, options);

  return `${stats}

## Current project structure
${structure}

## Available modules
${modulesSection}

## Reference files
${referenceFiles}`;
}

function renderReferenceFiles(
  flags: TemplateSectionFlags,
  options?: ClaudeMdOptions,
): string {
  const mode = flags.referenceFiles;

  if (mode === 'with-blueprint') {
    const blueprintLine = options?.blueprintGenerated
      ? `- \`.claude/blueprint.md\` — Prescriptive architectural blueprint (structure, patterns, flows, anti-duplication map)\n`
      : '';
    return `${blueprintLine}- \`.claude/registry.json\` — Registry with type signatures (check before creating code)
- \`.claude/capability-index.json\` — Enriched descriptions of each function/component (check to avoid duplication)
- \`.claude/inventory.md\` — Complete inventory
- \`.claude/duplicates.md\` — Duplicate exports
- \`.claude/dependency-map.md\` — Dependency map`;
  }

  if (mode === 'full-7') {
    return `- \`.claude/registry.json\` — Registry with type signatures (check before creating code)
- \`.claude/capability-index.json\` — Enriched descriptions of each function/component (check to avoid duplication)
- \`.claude/inventory.md\` — Complete file inventory with classification
- \`.claude/inventory.json\` — Inventory data in JSON format
- \`.claude/duplicates.md\` — List of duplicate exports
- \`.claude/duplicates.json\` — Duplicate data in JSON format
- \`.claude/dependency-map.md\` — Internal dependency map
- \`.claude/dependency-map.json\` — Dependency data in JSON format`;
  }

  // 'standard-4'
  return `- \`.claude/registry.json\` — Registry with type signatures (check before creating code)
- \`.claude/capability-index.json\` — Enriched descriptions of each function/component (check to avoid duplication)
- \`.claude/inventory.md\` — Complete inventory
- \`.claude/duplicates.md\` — Duplicate exports
- \`.claude/dependency-map.md\` — Dependency map`;
}
