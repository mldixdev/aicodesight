import {
  TechStackProfile, ProjectProfile,
  FolderNode, CodePattern, DataFlow, SharedUtility,
  DesignTokenHint, AntiDuplicationEntry, AntiPatternEntry, DomainGrouping,
} from '../types';
import { resolvePatterns } from './patterns';

export function generateBlueprint(
  techStack: TechStackProfile,
  profile: ProjectProfile,
): string {
  const resolved = resolvePatterns(techStack);
  const now = new Date().toISOString();
  const sections: string[] = [];

  sections.push(`# Architectural Blueprint
<!-- aicodesight:blueprint v1.0 — generated ${now} -->
<!-- This file provides prescriptive architectural guidance for Claude. -->
<!-- Referenced from CLAUDE.md. Update with: aicodesight update --only blueprint -->`);

  sections.push(renderTechStack(techStack));

  if (resolved.folders.length > 0) {
    sections.push(renderFolderStructure(resolved.folders, profile));
  }

  if (resolved.antiDuplication.length > 0 || resolved.antiPatterns.length > 0 || resolved.domainGroupings.length > 0) {
    sections.push(renderAntiDuplicationMap(resolved.antiDuplication, resolved.antiPatterns, resolved.domainGroupings));
  }

  sections.push(renderFeatureCreationProcess());

  if (resolved.patterns.length > 0) {
    sections.push(renderCodePatterns(resolved.patterns));
  }

  if (resolved.flows.length > 0) {
    sections.push(renderDataFlows(resolved.flows));
  }

  if (resolved.utilities.length > 0) {
    sections.push(renderSharedUtilities(resolved.utilities));
  }

  if (resolved.tokens.length > 0) {
    sections.push(renderDesignTokens(resolved.tokens));
  }

  return sections.join('\n\n---\n\n') + '\n';
}

function renderTechStack(stack: TechStackProfile): string {
  const lines: string[] = ['## Tech Stack'];

  if (stack.frontend) {
    lines.push(`\n### Frontend: ${stack.frontend.primary}`);
    if (stack.frontend.buildTool) lines.push(`- **Build:** ${stack.frontend.buildTool}`);
    const byCategory = groupByCategory(stack.frontend.libraries);
    for (const [cat, libs] of Object.entries(byCategory)) {
      lines.push(`- **${formatCategory(cat)}:** ${libs.map(l => l.version ? `${l.name} v${l.version}` : l.name).join(', ')}`);
    }
  }

  if (stack.backend) {
    lines.push(`\n### Backend: ${stack.backend.primary}`);
    if (stack.backend.buildTool) lines.push(`- **Build:** ${stack.backend.buildTool}`);
    const byCategory = groupByCategory(stack.backend.libraries);
    for (const [cat, libs] of Object.entries(byCategory)) {
      lines.push(`- **${formatCategory(cat)}:** ${libs.map(l => l.version ? `${l.name} v${l.version}` : l.name).join(', ')}`);
    }
  }

  if (stack.database) {
    lines.push(`\n### Database: ${stack.database.primary}`);
  }

  return lines.join('\n');
}

function renderFolderStructure(folders: FolderNode[], profile: ProjectProfile): string {
  const lines: string[] = ['## Target Folder Structure\n'];

  // Group by top-level directory
  const grouped = new Map<string, FolderNode[]>();
  for (const folder of folders) {
    const topLevel = folder.path.split('/')[0];
    if (!grouped.has(topLevel)) grouped.set(topLevel, []);
    grouped.get(topLevel)!.push(folder);
  }

  for (const [group, nodes] of grouped) {
    lines.push(`### ${group}/\n`);
    lines.push('```');
    for (const node of nodes) {
      lines.push(`${node.path}/`);
      lines.push(`  └─ ${node.purpose}`);
      if (node.suggestedFiles && node.suggestedFiles.length > 0) {
        for (const file of node.suggestedFiles) {
          lines.push(`     - ${file}`);
        }
      }
    }
    lines.push('```\n');
  }

  return lines.join('\n');
}

function renderAntiDuplicationMap(
  entries: AntiDuplicationEntry[],
  antiPatterns: AntiPatternEntry[],
  groupings: DomainGrouping[],
): string {
  const lines: string[] = ['## Anti-Duplication Map\n'];

  if (entries.length > 0) {
    lines.push('### Mandatory reuse points');
    lines.push('Before creating new code, this map indicates WHAT should already exist as shared.\n');
    lines.push('| If you need... | Use this (DO NOT re-create) | Canonical path |');
    lines.push('|----------------|----------------------------|----------------|');
    for (const entry of entries) {
      lines.push(`| ${entry.need} | ${entry.solution} | \`${entry.canonicalPath}\` |`);
    }
  }

  if (groupings.length > 0) {
    lines.push('\n### Domain groupings (DO NOT duplicate across modules)\n');
    for (const group of groupings) {
      lines.push(`**${group.groupName}** (${group.entities.join(', ')}):`);
      for (const resource of group.sharedResources) {
        lines.push(`- ${resource}`);
      }
      lines.push('');
    }
  }

  if (antiPatterns.length > 0) {
    lines.push('\n### Stack-specific anti-patterns\n');
    lines.push('| Anti-pattern | Why it causes duplication | Do this instead |');
    lines.push('|--------------|--------------------------|-----------------|');
    for (const ap of antiPatterns) {
      lines.push(`| ${ap.pattern} | ${ap.reason} | ${ap.alternative} |`);
    }
  }

  return lines.join('\n');
}

function renderFeatureCreationProcess(): string {
  return `## Process for Creating Similar Features

When creating feature B that resembles an existing feature A:

### Before writing code
1. **List similarities**: Identify which parts of feature A repeat in feature B
2. **Extract FIRST**: Move shared code to shared/ BEFORE creating feature B
   - Shared types → shared/types/
   - Similar UI components → shared/ui/ (parameterized)
   - Similar data fetching hooks → shared/hooks/
   - Similar business logic → shared/ with configuration parameters
3. **Refactor feature A** to import from shared/
4. **Create feature B** importing from shared/

### Signs of imminent duplication
- Creating a second form with fields similar to the first
- Creating a second CRUD endpoint for another entity
- Creating a second listing/table page with the same structure
- Creating a second data fetching hook with useQuery + similar shape
- Copying a file and renaming variables

**RULE**: If you are about to copy-and-modify, STOP. Extract the common parts first.
Result: both features import from shared, zero duplication.`;
}

function renderCodePatterns(patterns: CodePattern[]): string {
  const lines: string[] = ['## Code Patterns\n'];

  for (const pattern of patterns) {
    lines.push(`### ${pattern.name}`);
    lines.push(`**Context:** ${pattern.context}\n`);
    lines.push(pattern.example);
    if (pattern.antiPattern) {
      lines.push(`\n> **Anti-pattern:** ${pattern.antiPattern}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderDataFlows(flows: DataFlow[]): string {
  const lines: string[] = ['## Data Flows\n'];

  for (const flow of flows) {
    lines.push(`### ${flow.name}`);
    lines.push('```');
    lines.push(flow.layers.join(' → '));
    lines.push('```');
    lines.push(flow.description + '\n');
  }

  return lines.join('\n');
}

function renderSharedUtilities(utilities: SharedUtility[]): string {
  const lines: string[] = ['## Required Shared Utilities\n'];

  lines.push('| Utility | Path | Purpose | Stack reason |');
  lines.push('|---------|------|---------|--------------|');
  for (const util of utilities) {
    lines.push(`| ${util.name} | \`${util.suggestedPath}\` | ${util.purpose} | ${util.stackReason} |`);
  }

  return lines.join('\n');
}

function renderDesignTokens(tokens: DesignTokenHint[]): string {
  const lines: string[] = ['## Design Tokens\n'];

  for (const token of tokens) {
    lines.push(`### ${token.category}\n`);
    lines.push(token.suggestion);
    lines.push('');
  }

  return lines.join('\n');
}

// === Helpers ===

function groupByCategory(libs: { name: string; version?: string; category: string }[]): Record<string, typeof libs> {
  const groups: Record<string, typeof libs> = {};
  for (const lib of libs) {
    if (lib.category === 'other') continue;
    if (!groups[lib.category]) groups[lib.category] = [];
    groups[lib.category].push(lib);
  }
  return groups;
}

function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    'data-fetching': 'Data Fetching',
    'routing': 'Routing',
    'state': 'State Management',
    'ui-components': 'UI Components',
    'styling': 'Styling',
    'forms': 'Forms',
    'validation': 'Validation',
    'orm': 'ORM',
    'auth': 'Auth',
    'testing': 'Testing',
    'charts': 'Charts',
    'export': 'Export',
    'logging': 'Logging',
    'mapping': 'Mapping',
  };
  return map[cat] || cat;
}
