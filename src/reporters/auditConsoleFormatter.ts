import chalk from 'chalk';
import { AuditReport } from '../types';

export function formatConsole(report: AuditReport, focus: string): string {
  const lines: string[] = [];
  const showAll = focus === 'all';

  lines.push('');
  lines.push(chalk.gray('  ─────────────────────────────────────────'));
  lines.push('');

  // === DUPLICATION ===
  if (showAll || focus === 'duplication') {
    lines.push(chalk.bold('  === DUPLICATION ==='));
    lines.push('');

    if (report.duplication.totalDuplicateNames === 0) {
      lines.push(`  ${chalk.green('\u2713')} No duplicate exports detected`);
    } else {
      lines.push(`  ${chalk.red(`${report.duplication.totalDuplicateNames}`)} export names appear in multiple files:`);
      lines.push('');

      for (const dup of report.duplication.duplicates.slice(0, 15)) {
        const locations = dup.locations.map(l => chalk.gray(l.file)).join(', ');
        lines.push(`  ${chalk.red('•')} ${chalk.white(dup.name)} ${chalk.gray(`(${dup.type})`)} → ${locations}`);
      }
      if (report.duplication.duplicates.length > 15) {
        lines.push(chalk.gray(`    ... and ${report.duplication.duplicates.length - 15} more`));
      }

      if (report.duplication.filesWithMostDuplicates.length > 0) {
        lines.push('');
        lines.push(chalk.gray('  Files with most duplicates:'));
        for (const f of report.duplication.filesWithMostDuplicates.slice(0, 5)) {
          lines.push(`    ${chalk.yellow('\u2192')} ${f.file} (${f.count} duplicate exports)`);
        }
      }
    }
    lines.push('');
  }

  // === SIZE ===
  if (showAll || focus === 'size') {
    lines.push(chalk.bold('  === SIZE ==='));
    lines.push('');
    lines.push(`  ${chalk.gray('Average:')} ${report.size.averageFileSize} lines/file`);
    lines.push('');

    if (report.size.oversizedFiles.length === 0) {
      lines.push(`  ${chalk.green('\u2713')} All files are within the limit (<=350 lines)`);
    } else {
      lines.push(`  ${chalk.yellow(`${report.size.totalOversized}`)} files exceed 350 lines:`);
      lines.push('');

      for (const f of report.size.oversizedFiles.slice(0, 15)) {
        const icon = f.classification === 'critical' ? chalk.red('▲') :
                     f.classification === 'high' ? chalk.yellow('▲') : chalk.gray('▲');
        const generic = f.isGeneric ? chalk.magenta(' [GENERIC]') : '';
        lines.push(`  ${icon} ${chalk.white(f.file)} — ${f.lines} lines, ${f.exports} exports${generic}`);
      }
      if (report.size.oversizedFiles.length > 15) {
        lines.push(chalk.gray(`    ... and ${report.size.oversizedFiles.length - 15} more`));
      }
    }

    if (report.size.heavyExporters.length > 0) {
      lines.push('');
      lines.push(`  ${chalk.yellow(`${report.size.totalHeavyExporters}`)} files with >5 exports (candidates for splitting):`);
      for (const f of report.size.heavyExporters.slice(0, 10)) {
        lines.push(`    ${chalk.yellow('\u2192')} ${f.file} (${f.exports} exports, ${f.lines} lines)`);
      }
    }
    lines.push('');
  }

  // === CONVENTIONS ===
  if (showAll || focus === 'naming') {
    lines.push(chalk.bold('  === CONVENTIONS ==='));
    lines.push('');
    lines.push(`  ${chalk.gray('Compliance:')} ${report.conventions.compliancePercent}%`);
    lines.push('');

    if (report.conventions.totalIssues === 0) {
      lines.push(`  ${chalk.green('\u2713')} All conventions are met`);
    } else {
      if (report.conventions.namingIssues > 0) {
        lines.push(`  ${chalk.yellow('Naming')} (${report.conventions.namingIssues} issues):`);
        const namingIssues = report.conventions.issues.filter(
          i => i.rule === 'no-generic-names' || i.rule === 'component-pascal-case' || i.rule === 'hook-naming'
        );
        for (const issue of namingIssues.slice(0, 10)) {
          lines.push(`    ${chalk.yellow('⚠')} ${chalk.white(issue.file)} — ${issue.message}`);
          if (issue.suggestion) {
            lines.push(`      ${chalk.gray('→')} ${issue.suggestion}`);
          }
        }
        lines.push('');
      }

      if (report.conventions.missingBarrels > 0) {
        lines.push(`  ${chalk.yellow('Barrels')} (${report.conventions.missingBarrels} missing):`);
        const barrelIssues = report.conventions.issues.filter(i => i.rule === 'missing-barrel');
        for (const issue of barrelIssues.slice(0, 10)) {
          lines.push(`    ${chalk.yellow('⚠')} ${chalk.white(issue.file)} — ${issue.message}`);
        }
        lines.push('');
      }

      const heavyIssues = report.conventions.issues.filter(i => i.rule === 'too-many-exports');
      if (heavyIssues.length > 0) {
        lines.push(`  ${chalk.yellow('Excessive exports')} (${heavyIssues.length} files):`);
        for (const issue of heavyIssues.slice(0, 10)) {
          lines.push(`    ${chalk.yellow('⚠')} ${chalk.white(issue.file)} — ${issue.message}`);
        }
        lines.push('');
      }
    }
    lines.push('');
  }

  // === PROGRESS ===
  if (report.progress) {
    lines.push(chalk.bold('  === PROGRESS ==='));
    lines.push(chalk.gray(`  Comparing with: ${report.progress.previousDate}`));
    lines.push('');

    if (report.progress.newDuplicates.length > 0) {
      lines.push(`  ${chalk.red('\u2717')} ${report.progress.newDuplicates.length} NEW duplicates:`);
      for (const d of report.progress.newDuplicates.slice(0, 10)) {
        lines.push(`    ${chalk.red('\u2192')} ${d.name} (${d.type}) in ${d.locations.map(l => l.file).join(', ')}`);
      }
    }
    if (report.progress.resolvedDuplicates.length > 0) {
      lines.push(`  ${chalk.green('\u2713')} ${report.progress.resolvedDuplicates.length} RESOLVED duplicates:`);
      for (const d of report.progress.resolvedDuplicates.slice(0, 10)) {
        lines.push(`    ${chalk.green('\u2192')} ${d.name}`);
      }
    }
    if (report.progress.unchangedDuplicates.length > 0) {
      lines.push(`  ${chalk.gray('\u2013')} ${report.progress.unchangedDuplicates.length} unchanged duplicates`);
    }

    if (report.progress.grownFiles.length > 0) {
      lines.push('');
      lines.push(`  ${chalk.red('\u2191')} ${report.progress.grownFiles.length} files grew:`);
      for (const f of report.progress.grownFiles.slice(0, 10)) {
        lines.push(`    ${chalk.red('\u2192')} ${f.file}: ${f.previousLines} \u2192 ${f.currentLines} (+${f.delta})`);
      }
    }
    if (report.progress.shrunkFiles.length > 0) {
      lines.push(`  ${chalk.green('\u2193')} ${report.progress.shrunkFiles.length} files shrunk:`);
      for (const f of report.progress.shrunkFiles.slice(0, 10)) {
        lines.push(`    ${chalk.green('\u2192')} ${f.file}: ${f.previousLines} \u2192 ${f.currentLines} (${f.delta})`);
      }
    }

    if (report.progress.newFiles.length > 0) {
      lines.push(`  ${chalk.blue('+')} ${report.progress.newFiles.length} new files`);
    }
    if (report.progress.removedFiles.length > 0) {
      lines.push(`  ${chalk.gray('-')} ${report.progress.removedFiles.length} removed files`);
    }

    const noChanges =
      report.progress.newDuplicates.length === 0 &&
      report.progress.resolvedDuplicates.length === 0 &&
      report.progress.grownFiles.length === 0 &&
      report.progress.shrunkFiles.length === 0 &&
      report.progress.newFiles.length === 0 &&
      report.progress.removedFiles.length === 0;

    if (noChanges) {
      lines.push(`  ${chalk.gray('No changes since last analysis')}`);
    }
    lines.push('');
  }

  // === SUMMARY ===
  lines.push(chalk.gray('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
  lines.push(chalk.bold('  Summary'));
  lines.push('');

  const problems: string[] = [];
  if (report.duplication.totalDuplicateNames > 0) problems.push(`${report.duplication.totalDuplicateNames} duplicates`);
  if (report.size.totalOversized > 0) problems.push(`${report.size.totalOversized} large files`);
  if (report.conventions.totalIssues > 0) problems.push(`${report.conventions.totalIssues} conventions`);

  if (problems.length > 0) {
    lines.push(`  ${chalk.yellow('Issues:')} ${problems.join(' | ')}`);
  } else {
    lines.push(`  ${chalk.green('\u2713 Healthy project \u2014 no issues detected')}`);
  }

  if (!report.progress) {
    lines.push('');
    lines.push(chalk.gray('  Tip: run "aicodesight init" to enable progress tracking'));
  }

  lines.push('');
  return lines.join('\n');
}
