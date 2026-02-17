import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { AuditOptions, AuditReport, ProgressReport, loadExcludeDirs } from '../types';
import { detectProject } from '../analyzers/projectDetector';
import { generateInventory } from '../analyzers/inventoryGenerator';
import { detectDuplicates } from '../analyzers/duplicateDetector';
import { checkConventions } from '../analyzers/conventionChecker';
import { analyzeDuplication } from '../analyzers/auditDuplicationAnalyzer';
import { analyzeSize } from '../analyzers/auditSizeAnalyzer';
import { loadPreviousData, analyzeProgress } from '../analyzers/auditProgressAnalyzer';
import { formatConsole } from '../reporters/auditConsoleFormatter';
import { formatMarkdown } from '../reporters/auditMarkdownFormatter';
import { createSpinner, showHeader, showDetectionResult } from '../reporters/consoleReporter';

export async function runAudit(options: AuditOptions): Promise<void> {
  const targetDir = path.resolve(options.directory);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory does not exist: ${targetDir}`);
  }

  showHeader();

  const excludeDirs = loadExcludeDirs(targetDir);

  // 1. Detect project
  const spinner = createSpinner('Detecting project...');
  spinner.start();
  const profile = detectProject(targetDir, undefined, excludeDirs);
  spinner.succeed('Project detected');
  showDetectionResult(profile);

  // 2. Generate inventory (always — audit is autonomous)
  spinner.start('Generating inventory...');
  const inventory = generateInventory(targetDir, excludeDirs);
  spinner.succeed(`Inventory: ${inventory.stats.totalFiles} files, ${inventory.stats.totalLines} lines`);

  // 3. Duplication analysis
  spinner.start('Analyzing duplication...');
  const duplication = analyzeDuplication(inventory);
  spinner.succeed(`Duplication: ${duplication.totalDuplicateNames} duplicate exports`);

  // 4. Size analysis
  spinner.start('Analyzing size...');
  const size = analyzeSize(inventory);
  spinner.succeed(`Size: ${size.totalOversized} files >350 lines, ${size.totalHeavyExporters} with >5 exports`);

  // 5. Convention analysis
  spinner.start('Checking conventions...');
  const conventions = checkConventions(targetDir, inventory, excludeDirs);
  spinner.succeed(`Conventions: ${conventions.compliancePercent}% compliance (${conventions.totalIssues} issues)`);

  // 6. Progress — optional, only if previous data exists
  let progress: ProgressReport | null = null;
  const claudeDir = path.join(targetDir, '.claude');
  const { inventory: prevInventory, duplicates: prevDuplicates } = loadPreviousData(claudeDir);

  if (prevInventory && prevDuplicates) {
    spinner.start('Comparing with previous data...');
    const currentDuplicates = detectDuplicates(inventory);
    progress = analyzeProgress(inventory, currentDuplicates, prevInventory, prevDuplicates);
    spinner.succeed(`Progress: compared with ${progress.previousDate}`);
  } else {
    console.log(chalk.gray('  \u2139 No previous data — run "aicodesight init" to enable progress tracking\n'));
  }

  // 7. Build report
  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    duplication,
    size,
    conventions,
    progress,
  };

  // 8. Format output
  let output: string;
  switch (options.format) {
    case 'json':
      output = JSON.stringify(report, null, 2);
      break;
    case 'md':
      output = formatMarkdown(report, options.focus);
      break;
    case 'console':
    default:
      output = formatConsole(report, options.focus);
      break;
  }

  if (options.output) {
    fs.writeFileSync(options.output, output, 'utf-8');
    console.log(`\n  ${chalk.green('\u2713')} Result saved to: ${options.output}\n`);
  } else {
    console.log(output);
  }
}
