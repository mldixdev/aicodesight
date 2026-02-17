import * as path from 'path';
import * as fs from 'fs';
import { HooksMode, ProjectProfile } from '../types';

type ProjectLanguage = ProjectProfile['language'];
import { generateRunner } from './guards/runnerGenerator';
import { generateDuplicationGuard } from './guards/duplicationGuard';
import { generateSizeGuard } from './guards/sizeGuard';
import { generateConventionGuard } from './guards/conventionGuard';
import { generateCoherenceGuard } from './guards/coherenceGuard';
import { generateDependencyGuard } from './guards/dependencyGuard';
import { generateStructuralGuard } from './guards/structuralGuard';
import { generateIntentSimilarityGuard } from './guards/intentSimilarityGuard';
import { generateIntentDeclarationGuard } from './guards/intentDeclarationGuard';
import { generateSemanticDuplicationGuard } from '../embeddings/semanticDuplicationGuard';
import { generateGuardConfig, generateGuardMemory } from './guards/guardConfigGenerator';

/**
 * Cross-platform hook command builder.
 * Uses relative path from project root since Claude Code runs hooks
 * with cwd set to the project directory. This avoids $CLAUDE_PROJECT_DIR
 * expansion issues on Windows where the shell doesn't resolve $VAR syntax.
 */
function hookCommand(scriptName: string): string {
  return `node .claude/hooks/${scriptName}`;
}

export interface GeneratedHookFiles {
  files: Array<{ relativePath: string; content: string }>;
}

/**
 * Generates the complete guard pipeline: runner, guards, config, memory, restore script.
 * Returns all files to be written so the caller controls I/O.
 */
export function generateGuardPipeline(mode: HooksMode, language: ProjectLanguage = 'typescript'): GeneratedHookFiles {
  const files: GeneratedHookFiles['files'] = [
    { relativePath: '.claude/hooks/runner.js', content: generateRunner(mode) },
    { relativePath: '.claude/hooks/guards/duplication.js', content: generateDuplicationGuard() },
    { relativePath: '.claude/hooks/guards/size.js', content: generateSizeGuard() },
    { relativePath: '.claude/hooks/guards/convention.js', content: generateConventionGuard() },
    { relativePath: '.claude/hooks/guards/coherence.js', content: generateCoherenceGuard() },
    { relativePath: '.claude/hooks/guards/dependency.js', content: generateDependencyGuard() },
    { relativePath: '.claude/hooks/guards/structural-duplication.js', content: generateStructuralGuard() },
    { relativePath: '.claude/hooks/guards/intent-similarity.js', content: generateIntentSimilarityGuard() },
    { relativePath: '.claude/hooks/guards/intent-declaration.js', content: generateIntentDeclarationGuard() },
    { relativePath: '.claude/hooks/guards/semantic-duplication.js', content: generateSemanticDuplicationGuard() },
    { relativePath: '.claude/hooks/guard-config.json', content: generateGuardConfig(mode, language) },
    { relativePath: '.claude/hooks/guard-memory.json', content: generateGuardMemory() },
    { relativePath: '.claude/hooks/restore-settings.js', content: generateRestoreSettings() },
  ];

  return { files };
}

/**
 * Writes the guard pipeline files to disk.
 * Creates directories as needed. Preserves existing guard-config.json and guard-memory.json.
 */
export function writeGuardPipeline(targetDir: string, mode: HooksMode, language: ProjectLanguage = 'typescript'): string[] {
  const pipeline = generateGuardPipeline(mode, language);
  const writtenFiles: string[] = [];

  for (const file of pipeline.files) {
    const fullPath = path.join(targetDir, file.relativePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Preserve user-edited memory; merge new guards into existing config
    const isConfig = file.relativePath.endsWith('guard-config.json');
    const isMemory = file.relativePath.endsWith('guard-memory.json');

    if (isMemory && fs.existsSync(fullPath)) {
      continue; // Memory: always preserve user state
    }

    if (isConfig && fs.existsSync(fullPath)) {
      mergeGuardConfig(fullPath, file.content);
      writtenFiles.push(file.relativePath);
      continue;
    }

    fs.writeFileSync(fullPath, file.content, 'utf-8');
    writtenFiles.push(file.relativePath);
  }

  return writtenFiles;
}

/**
 * Merges new guard definitions into an existing guard-config.json.
 * Adds guards that don't exist yet; for existing guards, adds missing keys
 * without overwriting user-customized severity.
 */
function mergeGuardConfig(existingPath: string, newContent: string): void {
  try {
    const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    const generated = JSON.parse(newContent);

    if (!existing.guards) existing.guards = {};

    for (const [guardName, guardConfig] of Object.entries(generated.guards)) {
      if (!(guardName in existing.guards)) {
        existing.guards[guardName] = guardConfig;
      } else {
        const existingGuard = existing.guards[guardName] as Record<string, unknown>;
        for (const [key, value] of Object.entries(guardConfig as Record<string, unknown>)) {
          if (key !== 'severity' && !(key in existingGuard)) {
            existingGuard[key] = value;
          }
        }
      }
    }

    if (!existing.mode && generated.mode) {
      existing.mode = generated.mode;
    }

    fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2), 'utf-8');
  } catch {
    // If merge fails, don't break the pipeline — keep existing file
  }
}

/**
 * Generates the Claude Code settings.json with hook configuration.
 * Includes: guard pipeline (PreToolUse/PostToolUse) + memory hooks (PreCompact, SessionStart).
 */
export function generateHooksSettings(mode: HooksMode, existingSettings?: string): string {
  let settings: Record<string, any> = {};

  if (existingSettings) {
    try {
      settings = JSON.parse(existingSettings);
    } catch {
      settings = {};
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Always use PreToolUse: exit 0 = warn (allow), exit 2 = block
  const event = 'PreToolUse';

  // Remove any previous aicodesight hook matchers from all managed events
  for (const key of ['PreToolUse', 'PostToolUse', 'PreCompact', 'SessionStart']) {
    if (Array.isArray(settings.hooks[key])) {
      settings.hooks[key] = settings.hooks[key].filter(
        (m: any) => !m._source || m._source !== 'aicodesight'
      );
      if (settings.hooks[key].length === 0) {
        delete settings.hooks[key];
      }
    }
  }

  // --- Guard pipeline hook ---
  if (!settings.hooks[event]) {
    settings.hooks[event] = [];
  }

  settings.hooks[event].push({
    matcher: 'Edit|Write',
    hooks: [
      {
        type: 'command',
        command: hookCommand('runner.js'),
      },
    ],
    _source: 'aicodesight',
  });

  // --- Memory hooks ---
  addMemoryHooks(settings);

  return JSON.stringify(settings, null, 2);
}

/**
 * Generates the aicodesight-settings.json source of truth.
 * This is a backup of the hooks section that AICodeSight writes to settings.json.
 * Used by restore-settings.js to recover hooks if settings.json is overwritten.
 */
export function generateAicodesightSettings(mode: HooksMode): string {
  // Always use PreToolUse: exit 0 = warn (allow), exit 2 = block
  const event = 'PreToolUse';

  const hooks: Record<string, any> = {};

  hooks[event] = [{
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: hookCommand('runner.js') }],
    _source: 'aicodesight',
  }];

  hooks.PreCompact = [{
    matcher: 'auto|manual',
    hooks: [{ type: 'command', command: hookCommand('pre-compact-save.js') }],
    _source: 'aicodesight',
  }];

  hooks.SessionStart = [
    {
      matcher: 'compact',
      hooks: [{ type: 'command', command: hookCommand('compact-restore.js') }],
      _source: 'aicodesight',
    },
    {
      matcher: 'resume',
      hooks: [{ type: 'command', command: hookCommand('compact-restore.js') }],
      _source: 'aicodesight',
    },
  ];

  return JSON.stringify({ _version: '1.0', _generatedBy: 'aicodesight', hooks }, null, 2);
}

/**
 * Generates restore-settings.js — a script that reads aicodesight-settings.json
 * and merges hooks back into settings.json if they're missing.
 * Preserves existing permissions and non-aicodesight hooks.
 */
function generateRestoreSettings(): string {
  return `#!/usr/bin/env node
/**
 * restore-settings.js — Hook Recovery Script
 * Generated by AICodeSight. Restores hooks in settings.json if they were removed.
 *
 * Reads .claude/hooks/aicodesight-settings.json (source of truth) and merges
 * into .claude/settings.json, preserving permissions and third-party hooks.
 *
 * Can be run manually: node .claude/hooks/restore-settings.js
 * Or invoked by compact-restore.js when missing hooks are detected.
 */
const fs = require('fs');
const path = require('path');

function findProjectRoot() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.claude'))) return cwd;
  if (process.env.CLAUDE_PROJECT_DIR) {
    const resolved = path.resolve(process.env.CLAUDE_PROJECT_DIR);
    if (fs.existsSync(resolved)) return resolved;
  }
  let dir = cwd;
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

function main() {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error('[aicodesight restore] Project not found.');
    process.exit(1);
  }

  const claudeDir = path.join(projectRoot, '.claude');
  const sourcePath = path.join(claudeDir, 'hooks', 'aicodesight-settings.json');
  const settingsPath = path.join(claudeDir, 'settings.json');

  // Load source of truth
  const source = loadJSON(sourcePath);
  if (!source || !source.hooks) {
    console.error('[aicodesight restore] Settings file not found — run: aicodesight init');
    process.exit(1);
  }

  // Load current settings (may be empty/missing/corrupt)
  let settings = loadJSON(settingsPath) || {};
  if (!settings.hooks) settings.hooks = {};

  let restored = 0;

  // For each event in source, check if aicodesight hooks exist in settings
  for (const [event, matchers] of Object.entries(source.hooks)) {
    if (!Array.isArray(matchers)) continue;

    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = [];
    }

    for (const matcher of matchers) {
      // Check if this exact aicodesight matcher already exists
      const exists = settings.hooks[event].some(
        m => m._source === 'aicodesight' && m.matcher === matcher.matcher
      );

      if (!exists) {
        settings.hooks[event].push(matcher);
        restored++;
      }
    }
  }

  if (restored > 0) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.error('[aicodesight restore] ' + restored + ' hooks restored in settings.json');
  }

  return restored;
}

// Support both direct execution and require()
if (require.main === module) {
  main();
} else {
  module.exports = { main };
}
`;
}

/**
 * Adds memory lifecycle hooks to settings without requiring the guard pipeline.
 * Used by both generateHooksSettings and standalone memory init.
 */
export function addMemoryHooks(settings: Record<string, any>): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // PreCompact: save working state before context summarization (auto + manual)
  if (!settings.hooks.PreCompact) {
    settings.hooks.PreCompact = [];
  }
  settings.hooks.PreCompact.push({
    matcher: 'auto|manual',
    hooks: [
      {
        type: 'command',
        command: hookCommand('pre-compact-save.js'),
      },
    ],
    _source: 'aicodesight',
  });

  // SessionStart("compact"): restore context after auto-compact
  if (!settings.hooks.SessionStart) {
    settings.hooks.SessionStart = [];
  }
  settings.hooks.SessionStart.push({
    matcher: 'compact',
    hooks: [
      {
        type: 'command',
        command: hookCommand('compact-restore.js'),
      },
    ],
    _source: 'aicodesight',
  });

  // SessionStart("resume"): also restore on session resume
  settings.hooks.SessionStart.push({
    matcher: 'resume',
    hooks: [
      {
        type: 'command',
        command: hookCommand('compact-restore.js'),
      },
    ],
    _source: 'aicodesight',
  });
}
