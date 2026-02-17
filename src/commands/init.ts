import * as path from 'path';
import * as fs from 'fs';
import { InitOptions, StackSelection, AiArchMeta, loadExcludeDirs } from '../types';
import { profileTechStack, buildTechStackFromSelection } from '../analyzers/techStackProfiler';
import { promptForStack } from '../prompts/stackPrompt';
import { generateClaudeMd, mergeClaudeMd } from '../generators/claudeMdGenerator';
import { generateBlueprint } from '../generators/blueprintGenerator';
import { generateClaudeIgnore } from '../generators/claudeIgnoreGenerator';
import { inventoryToMarkdown, duplicatesToMarkdown, dependenciesToMarkdown, structuralDuplicationToMarkdown } from '../generators/markdownWriter';
import { generatePatternIndex, analyzePatternIndex } from '../analyzers/patternIndexer';
import { defaultSectionFlags } from '../templates/templateHelpers';
import {
  showHeader, showStructuralDuplicationSummary,
  showCapabilitySummary, showGeneratedFiles, showFinalSummary, createSpinner,
} from '../reporters/consoleReporter';
import {
  runAnalysisPipeline, writeDualArtifact, serializeRegistry,
  generateAndWriteCapabilityIndex, setupHookPipeline,
} from './commandPipeline';

export async function runInit(options: InitOptions): Promise<void> {
  const targetDir = path.resolve(options.directory);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory does not exist: ${targetDir}`);
  }

  showHeader();

  const excludeDirs = loadExcludeDirs(targetDir);

  // 1. Run analysis pipeline (detect → inventory → duplicates → dependencies → modules → registry)
  const { profile, inventory, duplicates, dependencies, modules, registry } =
    runAnalysisPipeline(targetDir, excludeDirs, options.type);

  // 2. Interactive stack prompt for new projects
  let selection: StackSelection | null = null;
  if (profile.type === 'new' && options.interactive && !options.dryRun) {
    selection = await promptForStack();

    if (selection.monorepo) {
      profile.structure = 'monorepo';
    }
    profile.language = inferLanguageFromSelection(selection);
    profile.frameworks = inferFrameworksFromSelection(selection);
  }

  // 3. Blueprint (new projects or --blueprint flag)
  const spinner = createSpinner('');
  let blueprintContent: string | null = null;
  if (profile.type === 'new' || options.blueprint) {
    let techStack;

    if (selection) {
      spinner.start('Building tech stack profile...');
      techStack = buildTechStackFromSelection(selection);
      spinner.succeed('Tech stack configured from selection');
    } else {
      spinner.start('Profiling tech stack...');
      techStack = profileTechStack(targetDir, profile, excludeDirs);
    }

    if (techStack.detected || techStack.frontend || techStack.backend) {
      spinner.start('Generating architectural blueprint...');
      blueprintContent = generateBlueprint(techStack, profile);
      const activePatterns = techStack.frontend ? 'frontend' : '';
      const backendLabel = techStack.backend ? (activePatterns ? ' + backend' : 'backend') : '';
      spinner.succeed(`Blueprint generated (${activePatterns}${backendLabel})`);
    } else {
      spinner.info('No tech stack detected — skipping blueprint');
    }
  }

  // 4. Dry-run check
  if (options.dryRun) {
    console.log('\n  --dry-run: No files will be written.\n');
    showFinalSummary(profile, inventory, duplicates, dependencies, []);
    return;
  }

  // 5. Generate files
  spinner.start('Generating files...');

  const claudeDir = path.join(targetDir, '.claude');
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  const generatedFiles: string[] = [];

  // Dual artifacts (JSON + MD)
  generatedFiles.push(...writeDualArtifact(claudeDir, 'inventory', inventory, inventoryToMarkdown));
  generatedFiles.push(...writeDualArtifact(claudeDir, 'duplicates', duplicates, duplicatesToMarkdown));
  generatedFiles.push(...writeDualArtifact(claudeDir, 'dependency-map', dependencies, dependenciesToMarkdown));
  generatedFiles.push(...writeDualArtifact(claudeDir, 'registry', registry, undefined, serializeRegistry));

  // pattern-index.json (fingerprints for cross-file structural dedup)
  const patternIndex = generatePatternIndex(inventory, targetDir);
  generatedFiles.push(...writeDualArtifact(claudeDir, 'pattern-index', patternIndex));

  // Structural duplication analysis
  const structuralSummary = analyzePatternIndex(patternIndex);
  const structDupMd = structuralDuplicationToMarkdown(structuralSummary);
  fs.writeFileSync(path.join(claudeDir, 'structural-duplicates.md'), structDupMd, 'utf-8');
  generatedFiles.push('.claude/structural-duplicates.md');

  // Capability index (merge with existing enriched/declared data)
  const { capabilityIndex, capabilitySummary, files: capFiles } = generateAndWriteCapabilityIndex(claudeDir, registry, targetDir);
  generatedFiles.push(...capFiles);

  // Blueprint
  if (blueprintContent) {
    fs.writeFileSync(path.join(claudeDir, 'blueprint.md'), blueprintContent, 'utf-8');
    generatedFiles.push('.claude/blueprint.md');
  }

  // CLAUDE.md (preserves user content if file already exists)
  const sectionFlags = defaultSectionFlags(profile.type);
  const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
  const claudeMdGenerated = generateClaudeMd(profile, inventory, duplicates, dependencies, modules, {
    blueprintGenerated: !!blueprintContent,
    sectionFlags,
    structuralSummary,
    capabilityIndex,
  });
  let existingClaudeMd: string | null = null;
  if (fs.existsSync(claudeMdPath)) {
    try { existingClaudeMd = fs.readFileSync(claudeMdPath, 'utf-8'); } catch { /* ignore */ }
  }
  fs.writeFileSync(claudeMdPath, mergeClaudeMd(claudeMdGenerated, existingClaudeMd), 'utf-8');
  generatedFiles.push('CLAUDE.md');

  // aicodesight-meta.json
  const meta: AiArchMeta = {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    initType: profile.type,
    initFrameworks: [...profile.frameworks],
    initStructure: profile.structure,
    initLanguage: profile.language,
    stackSelection: selection,
    sections: sectionFlags,
    blueprintGenerated: !!blueprintContent,
  };
  fs.writeFileSync(path.join(claudeDir, 'aicodesight-meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  generatedFiles.push('.claude/aicodesight-meta.json');

  // Enrichment prompt template
  fs.writeFileSync(path.join(claudeDir, 'enrich-capability-index.md'), generateEnrichmentPrompt(), 'utf-8');
  generatedFiles.push('.claude/enrich-capability-index.md');

  // .claudeignore
  fs.writeFileSync(path.join(targetDir, '.claudeignore'), generateClaudeIgnore(profile), 'utf-8');
  generatedFiles.push('.claudeignore');

  spinner.succeed('Files generated');
  showStructuralDuplicationSummary(structuralSummary);
  showCapabilitySummary(capabilitySummary);

  // 6. Configure guard pipeline
  if (options.hooks !== 'no') {
    spinner.start('Configuring guard pipeline...');
    const hookFiles = setupHookPipeline(targetDir, options.hooks, profile.language);
    generatedFiles.push(...hookFiles);

    const guardCount = hookFiles.filter(f => f.includes('/guards/')).length;
    const modeLabel = options.hooks === 'yes' ? 'strict' : 'warning';
    spinner.succeed(`Guard pipeline: ${guardCount} guards (${modeLabel} mode) + memory hooks`);

    // Activate semantic duplication guard if --embeddings flag
    // Note: embeddings are NOT computed here — capability-index is not yet enriched.
    // They will be computed on the first `aicodesight update` after enrichment.
    if (options.embeddings) {
      const guardConfigPath = path.join(claudeDir, 'hooks', 'guard-config.json');
      try {
        const gcRaw = fs.readFileSync(guardConfigPath, 'utf-8');
        const gc = JSON.parse(gcRaw);
        if (gc.guards?.['semantic-duplication']) {
          gc.guards['semantic-duplication'].severity = 'warn';
          fs.writeFileSync(guardConfigPath, JSON.stringify(gc, null, 2), 'utf-8');
        }
      } catch { /* guard-config not yet written — skip */ }
      spinner.info('Semantic guard enabled — embeddings will be computed on "aicodesight update" after enriching capability-index');
    }
  }

  showGeneratedFiles(generatedFiles);
  showFinalSummary(profile, inventory, duplicates, dependencies, generatedFiles);
}

function inferLanguageFromSelection(sel: StackSelection): 'typescript' | 'javascript' | 'csharp' | 'mixed' {
  const hasDotNet = sel.backend?.framework === '.NET';
  const hasJsTs = !!sel.frontend || (!!sel.backend && sel.backend.framework !== '.NET');

  if (hasDotNet && hasJsTs) return 'mixed';
  if (hasDotNet) return 'csharp';
  return 'typescript';
}

function inferFrameworksFromSelection(sel: StackSelection): string[] {
  const frameworks: string[] = [];

  if (sel.frontend?.framework) {
    frameworks.push(sel.frontend.framework);
  }

  if (sel.backend?.framework === '.NET') {
    frameworks.push('.NET', 'ASP.NET Core');
  } else if (sel.backend?.framework) {
    frameworks.push(sel.backend.framework);
  }

  const libFrameworkMap: Record<string, string> = {
    'efcore': 'EF Core',
    'mediatr': 'MediatR',
    'fluentvalidation': 'FluentValidation',
    'automapper': 'AutoMapper',
    'signalr': 'SignalR',
    'tailwind': 'Tailwind CSS',
    'shadcn': 'shadcn/ui',
    'tanstack-query': 'TanStack Query',
    'tanstack-table': 'TanStack Table',
    'tanstack-router': 'TanStack Router',
    'zustand': 'Zustand',
    'react-hook-form': 'React Hook Form',
    'zod': 'Zod',
    'prisma': 'Prisma',
    'typeorm': 'TypeORM',
    'drizzle': 'Drizzle',
  };

  for (const lib of sel.backend?.libraries ?? []) {
    if (libFrameworkMap[lib]) frameworks.push(libFrameworkMap[lib]);
  }
  for (const lib of sel.frontend?.libraries ?? []) {
    if (libFrameworkMap[lib]) frameworks.push(libFrameworkMap[lib]);
  }

  return frameworks;
}

function generateEnrichmentPrompt(): string {
  return `# Capability Index Enrichment

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

## File Format — CRITICAL

The file uses compact format: **one entry per line**. This allows Claude to read
the entire file in a single pass (the Read tool has a 2000-line limit).

**When writing back, PRESERVE the compact format.** Use the Edit tool to replace
individual lines instead of rewriting the entire file. Each entry must remain
on a single JSON line, not pretty-printed.

Example line in the file:
\`\`\`
    {"name":"createUser","type":"function","file":"src/controllers/users.ts","line":42,"signature":"(req: Request) => Promise<void>","signatureShape":"async-fetch","effects":["database"],"description":"Creates new user validating unique email","domain":"auth","action":"create","entity":"user","dependsOn":["validateEmail","hashPassword"],"source":"enriched"}
\`\`\`

**NEVER** rewrite the entire file with JSON.stringify pretty-printed.
If you need to rewrite the whole file, keep the header (version, generatedAt, source)
on separate lines and each entry in the array on a single line.

## Workflow

1. Group entries by file — multiple exports from the same file are read together
2. Process in batches of ~20 entries (no more, to maintain accuracy)
3. After each batch, use the Edit tool to update modified entries in-place
4. Continue with the next batch until complete

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
