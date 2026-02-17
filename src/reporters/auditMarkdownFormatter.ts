import { AuditReport } from '../types';

export function formatMarkdown(report: AuditReport, focus: string): string {
  const lines: string[] = [];
  const showAll = focus === 'all';

  lines.push('# AICodeSight Audit Report');
  lines.push('');
  lines.push(`> Generated: ${report.generatedAt}`);
  lines.push('');

  if (showAll || focus === 'duplication') {
    lines.push('## Duplication');
    lines.push('');
    lines.push(`**${report.duplication.totalDuplicateNames}** duplicate export names`);
    lines.push('');

    if (report.duplication.duplicates.length > 0) {
      lines.push('| Export | Type | Locations |');
      lines.push('|--------|------|-----------|');
      for (const dup of report.duplication.duplicates) {
        const locs = dup.locations.map(l => `${l.file}:${l.line}`).join(', ');
        lines.push(`| \`${dup.name}\` | ${dup.type} | ${locs} |`);
      }
      lines.push('');

      if (report.duplication.filesWithMostDuplicates.length > 0) {
        lines.push('### Files with most duplicates');
        lines.push('');
        for (const f of report.duplication.filesWithMostDuplicates) {
          lines.push(`- **${f.file}** — ${f.count} duplicate exports`);
        }
        lines.push('');
      }
    }
  }

  if (showAll || focus === 'size') {
    lines.push('## Size');
    lines.push('');
    lines.push(`Average: ${report.size.averageFileSize} lines/file`);
    lines.push('');

    if (report.size.oversizedFiles.length > 0) {
      lines.push('### Files exceeding 350 lines');
      lines.push('');
      lines.push('| File | Lines | Exports | Classification | Generic |');
      lines.push('|------|-------|---------|----------------|---------|');
      for (const f of report.size.oversizedFiles) {
        lines.push(`| ${f.file} | ${f.lines} | ${f.exports} | ${f.classification} | ${f.isGeneric ? 'Yes' : '-'} |`);
      }
      lines.push('');
    }

    if (report.size.heavyExporters.length > 0) {
      lines.push('### Files with >5 exports');
      lines.push('');
      for (const f of report.size.heavyExporters) {
        lines.push(`- **${f.file}** — ${f.exports} exports, ${f.lines} lines`);
      }
      lines.push('');
    }
  }

  if (showAll || focus === 'naming') {
    lines.push('## Conventions');
    lines.push('');
    lines.push(`Compliance: **${report.conventions.compliancePercent}%**`);
    lines.push('');

    if (report.conventions.issues.length > 0) {
      lines.push('| File | Rule | Issue | Suggestion |');
      lines.push('|------|------|-------|------------|');
      for (const issue of report.conventions.issues) {
        lines.push(`| ${issue.file} | ${issue.rule} | ${issue.message} | ${issue.suggestion || '-'} |`);
      }
      lines.push('');
    }
  }

  if (report.progress) {
    lines.push('## Progress');
    lines.push('');
    lines.push(`Comparing with: ${report.progress.previousDate}`);
    lines.push('');

    if (report.progress.newDuplicates.length > 0) {
      lines.push(`### New duplicates (${report.progress.newDuplicates.length})`);
      for (const d of report.progress.newDuplicates) {
        lines.push(`- **${d.name}** (${d.type}) in: ${d.locations.map(l => l.file).join(', ')}`);
      }
      lines.push('');
    }
    if (report.progress.resolvedDuplicates.length > 0) {
      lines.push(`### Resolved (${report.progress.resolvedDuplicates.length})`);
      for (const d of report.progress.resolvedDuplicates) {
        lines.push(`- ~~${d.name}~~`);
      }
      lines.push('');
    }

    if (report.progress.grownFiles.length > 0 || report.progress.shrunkFiles.length > 0) {
      lines.push('### Size changes');
      lines.push('');
      lines.push('| File | Before | After | Delta |');
      lines.push('|------|--------|-------|-------|');
      for (const f of [...report.progress.grownFiles, ...report.progress.shrunkFiles]) {
        const sign = f.delta > 0 ? '+' : '';
        lines.push(`| ${f.file} | ${f.previousLines} | ${f.currentLines} | ${sign}${f.delta} |`);
      }
      lines.push('');
    }

    if (report.progress.newFiles.length > 0) {
      lines.push(`### New files (${report.progress.newFiles.length})`);
      for (const f of report.progress.newFiles) lines.push(`- ${f}`);
      lines.push('');
    }
    if (report.progress.removedFiles.length > 0) {
      lines.push(`### Removed files (${report.progress.removedFiles.length})`);
      for (const f of report.progress.removedFiles) lines.push(`- ~~${f}~~`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
