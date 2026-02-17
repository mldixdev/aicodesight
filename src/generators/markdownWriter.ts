import { InventoryData, DuplicateData, DependencyData, StructuralDuplicationSummary, CapabilityIndexData } from '../types';

export function inventoryToMarkdown(inventory: InventoryData): string {
  const lines: string[] = [];

  lines.push('# File Inventory');
  lines.push('');
  lines.push(`> Generated: ${inventory.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total files | ${inventory.stats.totalFiles} |`);
  lines.push(`| Total lines | ${inventory.stats.totalLines} |`);
  lines.push(`| Total exports | ${inventory.stats.totalExports} |`);
  lines.push(`| Critical files (>800 lines) | ${inventory.stats.criticalFiles} |`);
  lines.push(`| High files (>500 lines) | ${inventory.stats.highFiles} |`);
  lines.push(`| Medium files (>350 lines) | ${inventory.stats.mediumFiles} |`);
  lines.push(`| OK files (<=350 lines) | ${inventory.stats.okFiles} |`);
  lines.push(`| Files with generic name | ${inventory.stats.genericFiles} |`);
  lines.push('');

  // Critical files section
  const criticalFiles = inventory.files.filter(f => f.classification === 'critical');
  if (criticalFiles.length > 0) {
    lines.push('## Critical Files (>500 lines)');
    lines.push('');
    for (const f of criticalFiles) {
      lines.push(`### ${f.path} (${f.lines} lines)`);
      if (f.isGeneric) lines.push('- **GENERIC NAME** - refactoring candidate');
      if (f.exports.length > 0) {
        lines.push(`- Exports (${f.exports.length}):`);
        for (const e of f.exports) {
          const sig = e.signature ? `: \`${e.signature}\`` : '';
          lines.push(`  - \`${e.name}\` (${e.type}, line ${e.line})${sig}`);
        }
      }
      lines.push('');
    }
  }

  // High files
  const highFiles = inventory.files.filter(f => f.classification === 'high');
  if (highFiles.length > 0) {
    lines.push('## High Files (300-500 lines)');
    lines.push('');
    for (const f of highFiles) {
      lines.push(`- **${f.path}** — ${f.lines} lines, ${f.exports.length} exports${f.isGeneric ? ' [GENERIC]' : ''}`);
    }
    lines.push('');
  }

  // Generic files warning
  const genericFiles = inventory.files.filter(f => f.isGeneric);
  if (genericFiles.length > 0) {
    lines.push('## Files with Generic Names');
    lines.push('');
    lines.push('> Generic names (utils, helpers, common, etc.) hinder navigation and promote duplication.');
    lines.push('');
    for (const f of genericFiles) {
      lines.push(`- **${f.path}** — ${f.lines} lines, ${f.exports.length} exports`);
    }
    lines.push('');
  }

  // Full inventory table
  lines.push('## Full Inventory');
  lines.push('');
  lines.push('| File | Lines | Exports | Classification | Generic |');
  lines.push('|------|-------|---------|----------------|---------|');
  for (const f of inventory.files) {
    lines.push(`| ${f.path} | ${f.lines} | ${f.exports.length} | ${f.classification} | ${f.isGeneric ? 'Yes' : '-'} |`);
  }
  lines.push('');

  return lines.join('\n');
}

export function duplicatesToMarkdown(duplicates: DuplicateData): string {
  const lines: string[] = [];

  lines.push('# Duplicate Exports');
  lines.push('');
  lines.push(`> Generated: ${duplicates.generatedAt}`);
  lines.push('');
  lines.push(`**Genuine duplicates:** ${duplicates.totalDuplicateNames}`);
  if (duplicates.crossStackMirrors?.length) {
    lines.push(`**Cross-stack mirrors (API mirrors):** ${duplicates.crossStackMirrors.length}`);
  }
  lines.push('');
  lines.push('> Automatically excluded: barrel re-exports (index.ts), polymorphic types (same name, different signature).');
  lines.push('');

  if (duplicates.duplicates.length === 0 && !duplicates.crossStackMirrors?.length) {
    lines.push('No duplicate exports found.');
    lines.push('');
    return lines.join('\n');
  }

  // Genuine duplicates
  if (duplicates.duplicates.length > 0) {
    lines.push('## Genuine Duplicates');
    lines.push('');
    lines.push('> These exports share the same name AND signature in different files of the same stack. Consolidate.');
    lines.push('');

    for (const dup of duplicates.duplicates) {
      lines.push(`### \`${dup.name}\` (${dup.type}) — ${dup.locations.length} locations`);
      lines.push('');
      for (const loc of dup.locations) {
        const sig = loc.signature ? ` — \`${loc.signature}\`` : '';
        lines.push(`- ${loc.file}:${loc.line}${sig}`);
      }
      lines.push('');
    }
  }

  // Cross-stack mirrors
  if (duplicates.crossStackMirrors?.length) {
    lines.push('## Cross-stack Mirrors (API mirrors)');
    lines.push('');
    lines.push('> These types exist in backend (.cs) and frontend (.ts) as API contract mirrors.');
    lines.push('> They are NOT duplicates to eliminate — keep them synchronized across stacks.');
    lines.push('');

    for (const mirror of duplicates.crossStackMirrors) {
      lines.push(`### \`${mirror.name}\` (${mirror.type})`);
      lines.push('');
      for (const loc of mirror.locations) {
        lines.push(`- ${loc.file}:${loc.line}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function dependenciesToMarkdown(deps: DependencyData): string {
  const lines: string[] = [];

  lines.push('# Dependency Map');
  lines.push('');
  lines.push(`> Generated: ${deps.generatedAt}`);
  lines.push('');

  if (deps.mostImported.length === 0) {
    lines.push('No internal dependencies found between files.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Most Imported Files');
  lines.push('');
  lines.push('> The most imported files have the greatest impact on the project.');
  lines.push('> Changes to these files affect many others.');
  lines.push('');
  lines.push('| File | Imported by | # |');
  lines.push('|------|-------------|---|');

  for (const entry of deps.mostImported) {
    const importers = entry.importedBy.slice(0, 5).join(', ');
    const suffix = entry.importedBy.length > 5 ? ` +${entry.importedBy.length - 5} more` : '';
    lines.push(`| ${entry.file} | ${importers}${suffix} | ${entry.importedByCount} |`);
  }

  lines.push('');

  // Detailed view for top 10
  const top = deps.mostImported.slice(0, 10);
  if (top.length > 0) {
    lines.push('## Detail (Top 10)');
    lines.push('');
    for (const entry of top) {
      lines.push(`### ${entry.file} (imported by ${entry.importedByCount} files)`);
      lines.push('');
      for (const imp of entry.importedBy) {
        lines.push(`- ${imp}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function structuralDuplicationToMarkdown(summary: StructuralDuplicationSummary): string {
  const lines: string[] = [];
  const threshold = summary.significantPairThreshold ?? 5;
  const significantPairs = summary.filePairs.filter(p => p.sharedPatterns >= threshold);

  lines.push('# Structural Duplication');
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('> Code blocks with identical (normalized) structure across different files.');
  lines.push(`> Only pairs with >=${threshold} shared blocks are reported.`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Significant pairs (>=${threshold} blocks) | ${significantPairs.length} |`);
  lines.push(`| Total cross-file patterns | ${summary.totalPatterns} |`);
  lines.push(`| Estimated consolidatable lines | ~${summary.estimatedDuplicateLines} |`);
  lines.push('');

  if (significantPairs.length === 0) {
    lines.push('No file pairs with significant duplication detected.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Pairs with Most Shared Patterns');
  lines.push('');
  lines.push('| File A | File B | Similar blocks |');
  lines.push('|--------|--------|----------------|');
  for (const pair of summary.filePairs) {
    lines.push(`| ${pair.fileA} | ${pair.fileB} | ${pair.sharedPatterns} |`);
  }
  lines.push('');

  if (summary.topFiles.length > 0) {
    lines.push('## Files with Most Participation');
    lines.push('');
    lines.push('> Files that appear in the most patterns — refactoring candidates.');
    lines.push('');
    for (const f of summary.topFiles) {
      lines.push(`- **${f.file}** — ${f.patternCount} patterns`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function capabilityIndexToMarkdown(data: CapabilityIndexData): string {
  const lines: string[] = [];

  lines.push('# Capability Index — Intent Registry');
  lines.push('');
  lines.push(`> Generated: ${data.generatedAt}`);
  lines.push('');
  lines.push('> Registry of exported functions and components with their intents.');
  lines.push('> Entries marked as "declared" have a full AI-provided description.');
  lines.push('> Entries marked as "extracted" were detected from code and can be enriched.');
  lines.push('');

  const declared = data.entries.filter(e => e.source === 'declared');
  const extracted = data.entries.filter(e => e.source === 'extracted');
  const enriched = data.entries.filter(e => e.source === 'enriched');

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total entries | ${data.entries.length} |`);
  lines.push(`| With declared intent | ${declared.length} |`);
  lines.push(`| Extracted from code | ${extracted.length} |`);
  lines.push(`| Enriched | ${enriched.length} |`);
  lines.push('');

  if (declared.length > 0) {
    lines.push('## Entries with Declared Intent');
    lines.push('');
    for (const entry of declared) {
      const sig = entry.signature ? ` — \`${entry.signature}\`` : '';
      lines.push(`### \`${entry.name}\` (${entry.type})`);
      lines.push(`- **File:** ${entry.file}:${entry.line}${sig}`);
      lines.push(`- **Description:** ${entry.description}`);
      lines.push(`- **Domain:** ${entry.domain} | **Action:** ${entry.action} | **Entity:** ${entry.entity}`);
      if (entry.dependsOn && entry.dependsOn.length > 0) {
        lines.push(`- **Depends on:** ${entry.dependsOn.join(', ')}`);
      }
      lines.push('');
    }
  }

  if (enriched.length > 0) {
    lines.push('## Enriched Entries');
    lines.push('');
    for (const entry of enriched) {
      const sig = entry.signature ? ` — \`${entry.signature}\`` : '';
      lines.push(`- \`${entry.name}\` (${entry.type}) in ${entry.file}:${entry.line}${sig}`);
      if (entry.description) lines.push(`  ${entry.description}`);
      lines.push('');
    }
  }

  if (extracted.length > 0) {
    lines.push('## Extracted Entries (no description)');
    lines.push('');
    lines.push('> These entries were detected from code but have no declared intent.');
    lines.push('> Run the enrichment prompt to add descriptions.');
    lines.push('');
    for (const entry of extracted) {
      const sig = entry.signature ? ` — \`${entry.signature}\`` : '';
      const effects = entry.effects.length > 0 ? ` [${entry.effects.join(', ')}]` : '';
      lines.push(`- \`${entry.name}\` (${entry.signatureShape}) in ${entry.file}:${entry.line}${sig}${effects}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
