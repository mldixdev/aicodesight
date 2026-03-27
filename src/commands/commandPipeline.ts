import * as path from 'path';
import * as fs from 'fs';
import {
  ProjectProfile, InventoryData, DuplicateData, DependencyData,
  ModuleMapData, RegistryData, CapabilityIndexData, CapabilityIndexSummary,
  HooksMode, loadExcludeDirs,
} from '../types';
import { detectProject } from '../analyzers/projectDetector';
import { generateInventory } from '../analyzers/inventoryGenerator';
import { detectDuplicates } from '../analyzers/duplicateDetector';
import { mapDependencies } from '../analyzers/dependencyMapper';
import { detectModules } from '../analyzers/moduleDetector';
import { generateRegistry } from '../generators/registryGenerator';
import { generateCapabilityIndex, analyzeCapabilityIndex } from '../analyzers/capabilityIndexer';
import { capabilityIndexToMarkdown } from '../generators/markdownWriter';
import { writeGuardPipeline, generateHooksSettings, generateAicodesightSettings } from '../generators/hooksGenerator';
import { writeMemoryPipeline } from '../generators/memoryHooksGenerator';
import {
  createSpinner, showDetectionResult, showInventorySummary,
  showDuplicateSummary, showDependencySummary,
} from '../reporters/consoleReporter';

export interface AnalysisPipelineResult {
  profile: ProjectProfile;
  inventory: InventoryData;
  duplicates: DuplicateData;
  dependencies: DependencyData;
  modules: ModuleMapData;
  registry: RegistryData;
}

/**
 * Runs the full analysis pipeline: detect → inventory → duplicates → dependencies → modules → registry.
 * Used by both init and update commands.
 */
export function runAnalysisPipeline(
  targetDir: string,
  excludeDirs: string[],
  projectType?: string,
): AnalysisPipelineResult {
  const spinner = createSpinner('Detecting project...');

  spinner.start();
  const profile = detectProject(targetDir, projectType, excludeDirs);
  spinner.succeed(`Project: ${profile.type} (${profile.language})`);
  showDetectionResult(profile);

  spinner.start('Generating inventory...');
  const inventory = generateInventory(targetDir, excludeDirs);
  spinner.succeed(`Inventory: ${inventory.stats.totalFiles} files, ${inventory.stats.totalExports} exports`);
  showInventorySummary(inventory);

  spinner.start('Detecting duplicates...');
  const duplicates = detectDuplicates(inventory);
  spinner.succeed(`Duplicates: ${duplicates.totalDuplicateNames} duplicate names`);
  showDuplicateSummary(duplicates);

  spinner.start('Mapping dependencies...');
  const dependencies = mapDependencies(targetDir, inventory);
  spinner.succeed('Dependencies mapped');
  showDependencySummary(dependencies);

  spinner.start('Detecting modules...');
  const modules = detectModules(targetDir, inventory, excludeDirs);
  spinner.succeed(`Modules: ${modules.modules.length} detected`);

  const registry = generateRegistry(inventory, modules, dependencies);

  return { profile, inventory, duplicates, dependencies, modules, registry };
}

/**
 * Reads and parses a JSON file, returning undefined if it doesn't exist or is invalid.
 */
export function readExistingJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return undefined;
  }
}

/**
 * Writes a dual artifact: name.json + name.md in the given directory.
 * If toMarkdown is omitted, only writes JSON.
 * If toJson is provided, uses it instead of default pretty-print serialization.
 */
export function writeDualArtifact(
  dir: string,
  name: string,
  data: unknown,
  toMarkdown?: (data: any) => string,
  toJson?: (data: any) => string,
): string[] {
  const files: string[] = [];
  const jsonPath = path.join(dir, `${name}.json`);
  const jsonContent = toJson ? toJson(data) : JSON.stringify(data, null, 2);
  fs.writeFileSync(jsonPath, jsonContent, 'utf-8');
  files.push(`.claude/${name}.json`);

  if (toMarkdown) {
    const mdPath = path.join(dir, `${name}.md`);
    fs.writeFileSync(mdPath, toMarkdown(data), 'utf-8');
    files.push(`.claude/${name}.md`);
  }

  return files;
}

/**
 * Serializes CapabilityIndexData with one entry per line to keep total line count
 * under 200 lines. This ensures Claude's Read tool (2000-line default) can read the
 * entire file in a single pass, preventing silent truncation during anti-duplication checks.
 */
export function serializeCapabilityIndex(data: CapabilityIndexData): string {
  const header = {
    version: data.version,
    generatedAt: data.generatedAt,
    source: data.source,
  };
  const lines: string[] = ['{'];
  lines.push(`  "version": ${JSON.stringify(header.version)},`);
  lines.push(`  "generatedAt": ${JSON.stringify(header.generatedAt)},`);
  lines.push(`  "source": ${JSON.stringify(header.source)},`);
  lines.push('  "entries": [');

  const lastIdx = data.entries.length - 1;
  for (let i = 0; i < data.entries.length; i++) {
    const comma = i < lastIdx ? ',' : '';
    lines.push(`    ${JSON.stringify(data.entries[i])}${comma}`);
  }

  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

/**
 * Serializes RegistryData with one export per line within each module.
 * Keeps total line count low so Claude's Read tool can load it in a single pass.
 */
export function serializeRegistry(data: RegistryData): string {
  const lines: string[] = ['{'];
  lines.push(`  "version": ${JSON.stringify(data.version)},`);
  lines.push(`  "generatedAt": ${JSON.stringify(data.generatedAt)},`);
  lines.push('  "modules": {');

  const modEntries = Object.entries(data.modules);
  for (let mi = 0; mi < modEntries.length; mi++) {
    const [modPath, mod] = modEntries[mi];
    const modComma = mi < modEntries.length - 1 ? ',' : '';
    lines.push(`    ${JSON.stringify(modPath)}: {`);
    lines.push(`      "type": ${JSON.stringify(mod.type)},`);
    if (mod.description) lines.push(`      "description": ${JSON.stringify(mod.description)},`);
    if (mod.dependsOn?.length) lines.push(`      "dependsOn": ${JSON.stringify(mod.dependsOn)},`);
    lines.push('      "exports": {');
    const expEntries = Object.entries(mod.exports);
    for (let ei = 0; ei < expEntries.length; ei++) {
      const [expName, expData] = expEntries[ei];
      const expComma = ei < expEntries.length - 1 ? ',' : '';
      lines.push(`        ${JSON.stringify(expName)}: ${JSON.stringify(expData)}${expComma}`);
    }
    lines.push('      }');
    lines.push(`    }${modComma}`);
  }

  lines.push('  },');

  if (data.unmapped && Object.keys(data.unmapped).length > 0) {
    lines.push('  "unmapped": {');
    const unmEntries = Object.entries(data.unmapped);
    for (let ui = 0; ui < unmEntries.length; ui++) {
      const [key, val] = unmEntries[ui];
      const comma = ui < unmEntries.length - 1 ? ',' : '';
      lines.push(`    ${JSON.stringify(key)}: ${JSON.stringify(val)}${comma}`);
    }
    lines.push('  }');
  } else {
    lines.push('  "unmapped": {}');
  }

  lines.push('}');
  return lines.join('\n') + '\n';
}

export interface CapabilityIndexResult {
  capabilityIndex: CapabilityIndexData;
  capabilitySummary: CapabilityIndexSummary;
  files: string[];
}

/**
 * Generates capability index, merging with existing enriched/declared data, and writes JSON + MD.
 */
export function generateAndWriteCapabilityIndex(
  claudeDir: string,
  registry: RegistryData,
  targetDir: string,
): CapabilityIndexResult {
  const existing = readExistingJson<CapabilityIndexData>(path.join(claudeDir, 'capability-index.json'));
  const capabilityIndex = generateCapabilityIndex(registry, targetDir, existing);

  const files = writeDualArtifact(claudeDir, 'capability-index', capabilityIndex, capabilityIndexToMarkdown, serializeCapabilityIndex);
  const capabilitySummary = analyzeCapabilityIndex(capabilityIndex);

  return { capabilityIndex, capabilitySummary, files };
}

/**
 * Sets up guard pipeline + memory hooks + settings.json + aicodesight-settings.json.
 * Returns list of generated file paths.
 */
export function setupHookPipeline(
  targetDir: string,
  mode: HooksMode,
  language: ProjectProfile['language'],
): string[] {
  const claudeDir = path.join(targetDir, '.claude');
  const generatedFiles: string[] = [];

  // Guard pipeline (runner + all guards + config + memory)
  const pipelineFiles = writeGuardPipeline(targetDir, mode, language);
  generatedFiles.push(...pipelineFiles);

  // Memory hooks (PreCompact + SessionStart + working-memory.json)
  const memoryFiles = writeMemoryPipeline(targetDir);
  generatedFiles.push(...memoryFiles);

  // settings.json (merge with existing)
  const settingsPath = path.join(claudeDir, 'settings.json');
  let existingSettings: string | undefined;
  try { existingSettings = fs.readFileSync(settingsPath, 'utf-8'); } catch { /* ignore */ }
  fs.writeFileSync(settingsPath, generateHooksSettings(mode, existingSettings), 'utf-8');
  generatedFiles.push('.claude/settings.json');

  // aicodesight-settings.json (source of truth for hook recovery)
  const hooksDir = path.join(claudeDir, 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }
  fs.writeFileSync(path.join(hooksDir, 'aicodesight-settings.json'), generateAicodesightSettings(mode), 'utf-8');
  generatedFiles.push('.claude/hooks/aicodesight-settings.json');

  return generatedFiles;
}

/**
 * Generates the enrichment prompt markdown that guides AI assistants through
 * the capability-index enrichment process with format and execution constraints.
 */
export function generateEnrichmentPrompt(): string {
  return `# Capability Index Enrichment

## Execution Restriction

This process MUST be executed directly by the main agent.
**PROHIBITED**: delegating to subagents (Task tool), external scripts, Bash commands,
or any automated process. Each source file must be read with the Read tool by YOU,
not inferred, delegated, or processed programmatically.

## Critical Rule

**NEVER infer descriptions from function names or signatures.**
For EACH entry, you MUST read the source file before writing any field.
If you haven't read the code, don't write the description — leave it as \`null\`.

## Process

Read \`.claude/capability-index.json\`. For each entry with \`"source": "extracted"\`:

1. **Read the source file** at the indicated \`file\` and \`line\` — this is MANDATORY
2. Understand what the function/component does by reading its actual implementation
3. Fill in the missing fields based on what you READ:
   - **description**: A concise one-liner explaining what it does and why it exists
   - **domain**: Business domain (e.g.: "auth", "payments", "ui", "infrastructure")
   - **action**: Primary action (e.g.: "create", "validate", "transform", "retrieve")
   - **entity**: Entity it operates on (e.g.: "user", "invoice", "config")
   - **dependsOn**: Already pre-populated with static imports from the file. Verify and refine:
     - Add undetected dependencies (dynamic imports, indirect calls, injected services)
     - Remove imports that are only generic utility types (e.g.: \`Request\`, \`Response\`)
     - Keep dependencies on project functions/modules that ARE actually used
4. Change \`source\` from \`"extracted"\` to \`"enriched"\`

## File Format — CRITICAL (Guard-Enforced)

The file uses **compact serialization**: header fields on separate lines, then each
entry on exactly ONE line inside the \`"entries"\` array. This allows Claude to read
the entire file in a single pass (the Read tool has a 2000-line limit).

**A format validation guard will BLOCK writes that violate this format.**

### What gets BLOCKED:
1. **Compressed format** — entire file on 1-3 lines (e.g., \`JSON.stringify(data)\`
   or Python \`json.dump(data, f, separators=(',',':'))\`) → **BLOCKED**
2. **Pretty-printed format** — each entry split across multiple lines (e.g.,
   \`JSON.stringify(data, null, 2)\` or Python \`json.dump(data, f, indent=2)\`) → **BLOCKED**
3. **Invalid JSON** — syntax errors, missing commas → **BLOCKED**

### Correct approach:
- Use the **Edit tool** to replace individual entry lines in-place
- NEVER use \`JSON.stringify()\` or \`json.dump()\` on the whole file
- NEVER write a script to process the file — edit lines directly
- If you must rewrite the whole file, keep header on separate lines and each
  entry in the array on a single line (no line breaks within an entry)

### Example of correct format:
\`\`\`json
{
  "version": "2.0",
  "generatedAt": "2026-01-15T10:00:00Z",
  "source": "hybrid",
  "entries": [
    {"name":"createUser","type":"function","file":"src/users.ts","line":42,...,"source":"enriched"},
    {"name":"deleteUser","type":"function","file":"src/users.ts","line":78,...,"source":"enriched"}
  ]
}
\`\`\`

## Workflow

1. Group entries by file — multiple exports from the same file are read together
2. Process in batches of ~20 entries (no more, to maintain accuracy)
3. After each batch, use the Edit tool to update modified entries in-place
4. **Verify**: Read \`.claude/capability-index.json\` after each batch to confirm the format is intact
   - Each entry should be on exactly one line
   - If the format broke, stop and fix before continuing
5. Continue with the next batch until complete

## Example

Entry before (line in the file, with dependsOn pre-populated by static analysis):
\`\`\`
    {"name":"createUser","type":"function","file":"src/controllers/users.ts","line":42,"signature":"(req: Request, res: Response) => Promise<void>","signatureShape":"async-fetch","effects":[],"description":null,"domain":null,"action":null,"entity":null,"dependsOn":["validateEmail","hashPassword","UserSchema"],"source":"extracted"},
\`\`\`

Step 1 — Read src/controllers/users.ts line 42 and understand the implementation.

Entry after (use Edit tool to replace the line):
\`\`\`
    {"name":"createUser","type":"function","file":"src/controllers/users.ts","line":42,"signature":"(req: Request, res: Response) => Promise<void>","signatureShape":"async-fetch","effects":["database"],"description":"Creates new user validating unique email and hashing password","domain":"auth","action":"create","entity":"user","dependsOn":["validateEmail","hashPassword","sendWelcomeEmail"],"source":"enriched"},
\`\`\`

Note: \`UserSchema\` (type-only) was removed, \`sendWelcomeEmail\` (indirect call) was added,
\`effects\` updated to \`["database"]\`, and \`source\` changed to \`"enriched"\`.

## Constraints

- **Do not modify** entries with \`source: "enriched"\` or \`source: "declared"\` — they are already complete
- **Only process** entries with \`source: "extracted"\`
- **Do not invent** — if you cannot determine a field with confidence, leave it as \`null\`
- **Do not group in a single Write** all entries — save progress in batches
- **Do not omit fields** from the original JSON (name, type, line, signature, signatureShape, effects)
- **PRESERVE compact format** — one entry per line, use Edit tool to modify in-place
`;
}
