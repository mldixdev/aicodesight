import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { UpdateOptions, HooksMode, AiArchMeta, TemplateSectionFlags, StructuralDuplicationSummary, CapabilityIndexSummary, CapabilityIndexData, loadExcludeDirs } from '../types';
import { generateClaudeMd, mergeClaudeMd } from '../generators/claudeMdGenerator';
import { inventoryToMarkdown, duplicatesToMarkdown, dependenciesToMarkdown, structuralDuplicationToMarkdown } from '../generators/markdownWriter';
import { loadPreviousData, analyzeProgress } from '../analyzers/auditProgressAnalyzer';
import { generatePatternIndex, analyzePatternIndex } from '../analyzers/patternIndexer';
import { analyzeCapabilityIndex } from '../analyzers/capabilityIndexer';
import { showHeader, showStructuralDuplicationSummary, showCapabilitySummary } from '../reporters/consoleReporter';
import { defaultSectionFlags } from '../templates/templateHelpers';
import {
  runAnalysisPipeline, readExistingJson, writeDualArtifact, serializeRegistry,
  generateAndWriteCapabilityIndex, setupHookPipeline,
} from './commandPipeline';

function detectCurrentHooksMode(claudeDir: string): HooksMode {
  const settingsPath = path.join(claudeDir, 'settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (settings.hooks?.PreToolUse?.some((h: any) => h._source === 'aicodesight')) return 'yes';
    if (settings.hooks?.PostToolUse?.some((h: any) => h._source === 'aicodesight')) return 'warn';
  } catch { /* ignore */ }
  return 'warn';
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const targetDir = path.resolve(options.directory);
  const claudeDir = path.join(targetDir, '.claude');

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory does not exist: ${targetDir}`);
  }

  if (!fs.existsSync(claudeDir)) {
    throw new Error(`Could not find .claude/ — run "aicodesight init" first`);
  }

  showHeader();

  const excludeDirs = loadExcludeDirs(targetDir);
  const shouldUpdate = (target: string) => options.only === 'all' || options.only === target;

  // 1. Load previous data for comparison
  const { inventory: prevInventory, duplicates: prevDuplicates } = loadPreviousData(claudeDir);

  // 2. Run analysis pipeline
  const { profile, inventory, duplicates, dependencies, modules, registry } =
    runAnalysisPipeline(targetDir, excludeDirs);

  // 3. Show progress delta
  if (prevInventory && prevDuplicates) {
    const progress = analyzeProgress(inventory, duplicates, prevInventory, prevDuplicates);
    console.log('');
    console.log(chalk.bold('  Changes since last update:'));

    const changes: string[] = [];
    if (progress.newDuplicates.length > 0) changes.push(chalk.red(`+${progress.newDuplicates.length} duplicates`));
    if (progress.resolvedDuplicates.length > 0) changes.push(chalk.green(`-${progress.resolvedDuplicates.length} duplicates`));
    if (progress.newFiles.length > 0) changes.push(chalk.blue(`+${progress.newFiles.length} files`));
    if (progress.removedFiles.length > 0) changes.push(chalk.gray(`-${progress.removedFiles.length} files`));
    if (progress.grownFiles.length > 0) changes.push(chalk.yellow(`${progress.grownFiles.length} grew`));
    if (progress.shrunkFiles.length > 0) changes.push(chalk.green(`${progress.shrunkFiles.length} shrunk`));

    if (changes.length > 0) {
      console.log(`  ${changes.join(' | ')}`);
    } else {
      console.log(chalk.gray('  No changes detected'));
    }
    console.log('');
  }

  // 4. Dry-run check
  if (options.dryRun) {
    console.log(chalk.gray('  --dry-run: No files will be written.\n'));
    return;
  }

  // 5. Write artifacts
  const updatedFiles: string[] = [];
  let structuralSummary: StructuralDuplicationSummary | null = null;
  let capabilitySummary: CapabilityIndexSummary | null = null;
  let capabilityIndex: CapabilityIndexData | undefined;

  if (shouldUpdate('inventory')) {
    updatedFiles.push(...writeDualArtifact(claudeDir, 'inventory', inventory, inventoryToMarkdown));

    // Regenerate pattern index when inventory changes
    const patternIndex = generatePatternIndex(inventory, targetDir);
    updatedFiles.push(...writeDualArtifact(claudeDir, 'pattern-index', patternIndex));

    // Structural duplication
    structuralSummary = analyzePatternIndex(patternIndex);
    showStructuralDuplicationSummary(structuralSummary);
    const structDupMd = structuralDuplicationToMarkdown(structuralSummary);
    fs.writeFileSync(path.join(claudeDir, 'structural-duplicates.md'), structDupMd, 'utf-8');

    // Capability index
    const capResult = generateAndWriteCapabilityIndex(claudeDir, registry, targetDir);
    capabilitySummary = capResult.capabilitySummary;
    capabilityIndex = capResult.capabilityIndex;
    showCapabilitySummary(capabilitySummary);
    updatedFiles.push('.claude/structural-duplicates.md', ...capResult.files);

    // Semantic embeddings: compute if --embeddings flag or guard already enabled
    const guardConfigPath = path.join(claudeDir, 'hooks', 'guard-config.json');
    const guardConfig = readExistingJson<any>(guardConfigPath);
    const semSeverity = guardConfig?.guards?.['semantic-duplication']?.severity;
    const embeddingsEnabled = options.embeddings || (semSeverity && semSeverity !== 'off');

    if (options.embeddings && guardConfig?.guards?.['semantic-duplication']) {
      // Persist severity 'warn' so future updates without --embeddings still compute
      guardConfig.guards['semantic-duplication'].severity = 'warn';
      fs.writeFileSync(guardConfigPath, JSON.stringify(guardConfig, null, 2), 'utf-8');
    }

    if (embeddingsEnabled) {
      try {
        const { computeEmbeddingsCache } = await import('../embeddings/computeEmbeddings');
        const cacheResult = await computeEmbeddingsCache(capResult.capabilityIndex, claudeDir);
        if (cacheResult) {
          updatedFiles.push('.claude/embeddings-cache.json');
        }
      } catch {
        // @xenova/transformers not installed — skip silently
      }
    }
  } else {
    // Load existing data for CLAUDE.md generation
    const existingIndex = readExistingJson<any>(path.join(claudeDir, 'pattern-index.json'));
    if (existingIndex) structuralSummary = analyzePatternIndex(existingIndex);

    const existingCapIndex = readExistingJson<CapabilityIndexData>(path.join(claudeDir, 'capability-index.json'));
    if (existingCapIndex) {
      capabilitySummary = analyzeCapabilityIndex(existingCapIndex);
      capabilityIndex = existingCapIndex;
    }
  }

  if (shouldUpdate('duplicates')) {
    updatedFiles.push(...writeDualArtifact(claudeDir, 'duplicates', duplicates, duplicatesToMarkdown));
  }

  if (shouldUpdate('inventory') || shouldUpdate('duplicates')) {
    updatedFiles.push(...writeDualArtifact(claudeDir, 'dependency-map', dependencies, dependenciesToMarkdown));
  }

  if (shouldUpdate('registry') || shouldUpdate('inventory')) {
    updatedFiles.push(...writeDualArtifact(claudeDir, 'registry', registry, undefined, serializeRegistry));
  }

  if (shouldUpdate('claude-md')) {
    const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
    const blueprintExists = fs.existsSync(path.join(claudeDir, 'blueprint.md'));

    // Read metadata for section flags persistence
    const metaPath = path.join(claudeDir, 'aicodesight-meta.json');
    const meta = readExistingJson<AiArchMeta>(metaPath);

    let sectionFlags: TemplateSectionFlags;

    if (meta?.sections) {
      sectionFlags = { ...meta.sections };

      // Migrate: add capabilityIndex flag if missing
      if (sectionFlags.capabilityIndex === undefined) {
        sectionFlags.capabilityIndex = meta.initType !== 'new';
      }

      // Migrate: add intentProtocol flag if missing
      if ((sectionFlags as any).intentProtocol === undefined) {
        (sectionFlags as any).intentProtocol = true;
      }

      // Evolve data flags when a 'new' project grew
      if (meta.initType === 'new' && inventory.stats.totalFiles > 0) {
        if (sectionFlags.duplicates === 'conditional')
          sectionFlags.duplicates = 'resolved';
        if (sectionFlags.largeFiles === 'conditional')
          sectionFlags.largeFiles = 'flat';
        if (sectionFlags.genericFiles === 'conditional')
          sectionFlags.genericFiles = 'always';
        if (sectionFlags.oportunistic === 'none')
          sectionFlags.oportunistic = 'proactive';
        if (!sectionFlags.namingMinimas)
          sectionFlags.namingMinimas = true;
      }
    } else {
      sectionFlags = defaultSectionFlags(profile.type);
    }

    const claudeMdGenerated = generateClaudeMd(profile, inventory, duplicates, dependencies, modules, {
      blueprintGenerated: blueprintExists,
      sectionFlags,
      structuralSummary: structuralSummary ?? undefined,
      capabilityIndex,
    });
    let existingClaudeMd: string | null = null;
    try { existingClaudeMd = fs.readFileSync(claudeMdPath, 'utf-8'); } catch { /* ignore */ }
    fs.writeFileSync(claudeMdPath, mergeClaudeMd(claudeMdGenerated, existingClaudeMd), 'utf-8');
    updatedFiles.push('CLAUDE.md');

    // Update metadata after write
    if (meta) {
      meta.updatedAt = new Date().toISOString();
      meta.sections = sectionFlags;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }
  }

  if (shouldUpdate('hooks') || shouldUpdate('memory')) {
    const currentMode = detectCurrentHooksMode(claudeDir);
    const hookFiles = setupHookPipeline(targetDir, currentMode, profile.language);
    updatedFiles.push(...hookFiles);
  }

  // 6. Summary
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log(chalk.bold('  Updated files:'));
  for (const f of updatedFiles) {
    console.log(`  ${chalk.green('✓')} ${f}`);
  }
  console.log('');
}
