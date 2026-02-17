import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { ProjectProfile, InventoryData, DuplicateData, DependencyData, StructuralDuplicationSummary, CapabilityIndexSummary } from '../types';

export function showHeader(): void {
  console.log('');
  console.log(chalk.bold.cyan('  AICodeSight') + chalk.gray(' — AI-friendly architecture diagnostics'));
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log('');
}

export function showDetectionResult(profile: ProjectProfile): void {
  const typeColors: Record<string, (s: string) => string> = {
    legacy: chalk.red,
    organized: chalk.green,
    new: chalk.blue,
  };
  const colorFn = typeColors[profile.type] || chalk.white;

  console.log(`  Type:       ${colorFn(profile.type.toUpperCase())}`);
  console.log(`  Structure:  ${chalk.white(profile.structure)}`);
  console.log(`  Language:   ${chalk.white(profile.language)}`);
  if (profile.frameworks.length > 0) {
    console.log(`  Frameworks: ${chalk.white(profile.frameworks.join(', '))}`);
  }
  console.log('');
}

export function showInventorySummary(inventory: InventoryData): void {
  const s = inventory.stats;
  console.log(`  ${chalk.gray('Files:')} ${s.totalFiles}  ${chalk.gray('Lines:')} ${s.totalLines}  ${chalk.gray('Exports:')} ${s.totalExports}`);

  const parts: string[] = [];
  if (s.criticalFiles > 0) parts.push(chalk.red(`${s.criticalFiles} critical`));
  if (s.highFiles > 0) parts.push(chalk.yellow(`${s.highFiles} high`));
  if (s.genericFiles > 0) parts.push(chalk.magenta(`${s.genericFiles} generic`));

  if (parts.length > 0) {
    console.log(`  ${chalk.gray('Alerts:')}  ${parts.join('  ')}`);
  }
  console.log('');
}

export function showDuplicateSummary(duplicates: DuplicateData): void {
  const genuine = duplicates.totalDuplicateNames;
  const mirrors = duplicates.crossStackMirrors?.length ?? 0;

  if (genuine === 0 && mirrors === 0) {
    console.log(`  ${chalk.green('\u2713')} No duplicate exports detected`);
  } else {
    if (genuine > 0) {
      console.log(`  ${chalk.yellow('!')} ${genuine} genuine duplicate exports`);
      const top = duplicates.duplicates.slice(0, 5);
      for (const d of top) {
        console.log(`    ${chalk.gray('\u2192')} ${chalk.white(d.name)} (${d.type}) in ${d.locations.length} files`);
      }
      if (duplicates.duplicates.length > 5) {
        console.log(`    ${chalk.gray(`... and ${duplicates.duplicates.length - 5} more`)}`);
      }
    } else {
      console.log(`  ${chalk.green('\u2713')} No genuine duplicate exports`);
    }

    if (mirrors > 0) {
      console.log(`  ${chalk.blue('i')} ${mirrors} cross-stack mirrors (API mirrors, not duplicates)`);
    }
  }
  console.log('');
}

export function showStructuralDuplicationSummary(summary: StructuralDuplicationSummary): void {
  const threshold = summary.significantPairThreshold ?? 5;
  const significantPairs = summary.filePairs.filter(p => p.sharedPatterns >= threshold);

  if (significantPairs.length === 0) {
    console.log(`  ${chalk.green('\u2713')} No significant structural duplication`);
  } else {
    console.log(`  ${chalk.yellow('!')} ${significantPairs.length} pairs with significant duplication (~${summary.estimatedDuplicateLines} consolidable lines)`);
    const top = significantPairs.slice(0, 5);
    for (const pair of top) {
      console.log(`    ${chalk.gray('\u2192')} ${chalk.white(pair.fileA)} \u2194 ${pair.fileB} (${pair.sharedPatterns} blocks)`);
    }
    if (significantPairs.length > 5) {
      console.log(`    ${chalk.gray(`... and ${significantPairs.length - 5} more pairs`)}`);
    }
  }
  console.log('');
}

export function showCapabilitySummary(summary: CapabilityIndexSummary): void {
  console.log(`  ${chalk.green('\u2713')} ${summary.totalEntries} functions documented in capability-index.json`);
  if (summary.declaredCount > 0) {
    console.log(`  ${chalk.blue('i')} ${summary.declaredCount} with declared intent, ${summary.extractedCount} extracted from code`);
  }
  if (summary.enrichedCount > 0) {
    console.log(`  ${chalk.blue('i')} ${summary.enrichedCount} enriched via Path A`);
  }
  console.log('');
}

export function showDependencySummary(deps: DependencyData): void {
  if (deps.mostImported.length === 0) {
    console.log(`  ${chalk.gray('No internal dependencies mapped')}`);
  } else {
    console.log(`  ${chalk.gray('Top most-imported files:')}`);
    const top = deps.mostImported.slice(0, 5);
    for (const d of top) {
      console.log(`    ${chalk.gray('\u2192')} ${chalk.white(d.file)} (${d.importedByCount} importers)`);
    }
  }
  console.log('');
}

export function showGeneratedFiles(files: string[]): void {
  console.log(`  ${chalk.green('\u2713')} Generated files:`);
  for (const f of files) {
    console.log(`    ${chalk.gray('\u2192')} ${chalk.white(f)}`);
  }
  console.log('');
}

export function showFinalSummary(
  profile: ProjectProfile,
  inventory: InventoryData,
  duplicates: DuplicateData,
  deps: DependencyData,
  generatedFiles: string[],
): void {
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log(chalk.bold('  Summary'));
  console.log('');
  console.log(`  ${profile.type} project with ${inventory.stats.totalFiles} files`);

  const issues: string[] = [];
  if (inventory.stats.criticalFiles > 0) issues.push(`${inventory.stats.criticalFiles} critical files`);
  if (duplicates.totalDuplicateNames > 0) issues.push(`${duplicates.totalDuplicateNames} genuine duplicate exports`);
  if (inventory.stats.genericFiles > 0) issues.push(`${inventory.stats.genericFiles} generic names`);

  if (issues.length > 0) {
    console.log(`  ${chalk.yellow('Issues:')} ${issues.join(', ')}`);
  } else {
    console.log(`  ${chalk.green('No issues detected')}`);
  }

  if (generatedFiles.length > 0) {
    console.log(`  ${chalk.green(`${generatedFiles.length} files generated`)}`);
    console.log('');
    console.log(chalk.gray('  Next step: review CLAUDE.md and adjust as needed'));
  }

  console.log('');
}

export function createSpinner(text: string): Ora {
  return ora({
    text,
    indent: 2,
  });
}
