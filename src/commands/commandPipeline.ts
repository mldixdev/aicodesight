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
