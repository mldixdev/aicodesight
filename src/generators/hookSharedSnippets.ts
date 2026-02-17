/**
 * Shared JavaScript snippets used by both pre-compact-save.js and compact-restore.js hooks.
 * Returns raw JS code strings for template string interpolation.
 * Eliminates duplication of findProjectRoot() and loadJSON() across hooks.
 */

export function jsFindProjectRoot(): string {
  return `function findProjectRoot() {
  // Prefer CWD — hooks run from the project root
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.claude', 'inventory.json')) ||
      fs.existsSync(path.join(cwd, 'CLAUDE.md'))) {
    return cwd;
  }

  // Try CLAUDE_PROJECT_DIR with normalization
  if (process.env.CLAUDE_PROJECT_DIR) {
    const resolved = path.resolve(process.env.CLAUDE_PROJECT_DIR);
    if (fs.existsSync(resolved)) return resolved;
  }

  // Fallback: walk up from cwd
  let dir = cwd;
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.claude', 'inventory.json'))) return dir;
    if (fs.existsSync(path.join(dir, 'CLAUDE.md'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}`;
}

export function jsLoadJSON(): string {
  return `function loadJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}`;
}
