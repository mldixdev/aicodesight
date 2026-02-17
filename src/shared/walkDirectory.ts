import * as path from 'path';
import * as fs from 'fs';

export interface WalkOptions {
  excludeDirs?: string[];
  excludeHiddenDirs?: boolean;
  maxDepth?: number;
  filterExt?: string[];
}

/**
 * Generic recursive directory walker with callback pattern.
 * Replaces 8+ duplicate walk() implementations across analyzers.
 */
export function walkDirectory(
  dir: string,
  options: WalkOptions,
  callback: (fullPath: string, entry: fs.Dirent) => void,
  depth = 0,
): void {
  if (options.maxDepth !== undefined && depth > options.maxDepth) return;

  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (options.excludeDirs?.includes(entry.name)) continue;
      if (options.excludeHiddenDirs && entry.name.startsWith('.')) continue;
      walkDirectory(path.join(dir, entry.name), options, callback, depth + 1);
    } else {
      if (options.filterExt && !options.filterExt.includes(path.extname(entry.name).toLowerCase())) continue;
      callback(path.join(dir, entry.name), entry);
    }
  }
}

/**
 * Collects file paths matching a single extension.
 * Convenience wrapper for the common "find all .ts files" pattern.
 */
export function findFilesByExtension(
  dir: string,
  ext: string,
  excludeDirs: string[],
  excludeHiddenDirs = false,
): string[] {
  const results: string[] = [];
  walkDirectory(
    dir,
    { excludeDirs, filterExt: [ext.startsWith('.') ? ext : `.${ext}`], excludeHiddenDirs },
    (fullPath) => results.push(fullPath),
  );
  return results;
}