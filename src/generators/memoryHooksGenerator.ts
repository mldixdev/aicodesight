import * as path from 'path';
import * as fs from 'fs';
import { generatePreCompactSave } from './generatePreCompactHook';
import { generateCompactRestore } from './generateCompactRestoreHook';

export interface GeneratedMemoryFiles {
  files: Array<{ relativePath: string; content: string }>;
}

/**
 * Generates the working memory system: PreCompact hook, SessionStart hook,
 * and the initial working-memory.json schema.
 */
export function generateMemoryPipeline(): GeneratedMemoryFiles {
  return {
    files: [
      { relativePath: '.claude/hooks/pre-compact-save.js', content: generatePreCompactSave() },
      { relativePath: '.claude/hooks/compact-restore.js', content: generateCompactRestore() },
      { relativePath: '.claude/working-memory.json', content: generateWorkingMemory() },
    ],
  };
}

/**
 * Writes memory pipeline files to disk.
 * Preserves existing working-memory.json (user state).
 */
export function writeMemoryPipeline(targetDir: string): string[] {
  const pipeline = generateMemoryPipeline();
  const writtenFiles: string[] = [];

  for (const file of pipeline.files) {
    const fullPath = path.join(targetDir, file.relativePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Preserve user's working memory state
    if (file.relativePath.endsWith('working-memory.json') && fs.existsSync(fullPath)) {
      continue;
    }

    fs.writeFileSync(fullPath, file.content, 'utf-8');
    writtenFiles.push(file.relativePath);
  }

  return writtenFiles;
}

/**
 * Generates the initial (empty) working-memory.json.
 */
function generateWorkingMemory(): string {
  return JSON.stringify({
    version: '1.1.0',
    lastUpdated: new Date().toISOString(),
    currentTask: null,
    recentChanges: [],
    bashCommands: [],
    filesRead: [],
    rejectedApproaches: [],
    activeModules: [],
    sessionNotes: [],
  }, null, 2);
}
