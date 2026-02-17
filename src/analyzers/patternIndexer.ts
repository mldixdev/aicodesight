import * as path from 'path';
import * as fs from 'fs';
import { InventoryData, SOURCE_EXTENSIONS, StructuralDuplicationSummary } from '../types';

const WINDOW_SIZE = 4;
const MAX_FILE_LINES = 500;
const MAX_LOCATIONS_PER_HASH = 10;
const BARREL_NAMES = new Set(['index']);
const SIGNIFICANT_PAIR_THRESHOLD = 5;

// ── Types ────────────────────────────────────────────────────

export interface PatternIndexLocation {
  file: string;
  line: number;
}

export interface PatternIndexEntry {
  normalized: string;
  locations: PatternIndexLocation[];
}

export interface PatternIndex {
  version: 1;
  generatedAt: string;
  windowSize: number;
  fingerprints: Record<string, PatternIndexEntry>;
}

// ── Normalization (mirrors the guard's normalize function) ───

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'default', 'try', 'catch', 'finally', 'throw', 'new',
  'class', 'extends', 'import', 'export', 'from', 'async', 'await', 'yield',
  'typeof', 'instanceof', 'in', 'of', 'null', 'undefined', 'true', 'false', 'this',
  'void', 'delete', 'static', 'get', 'set', 'super', 'interface', 'type', 'enum',
  'public', 'private', 'protected', 'readonly', 'abstract', 'override', 'virtual',
  'using', 'namespace', 'partial', 'sealed', 'internal', 'string', 'int', 'bool',
  'var', 'object', 'dynamic', 'decimal', 'double', 'float', 'long', 'byte', 'Task',
  'Promise', 'Array', 'Map', 'Set', 'Record', 'Partial', 'Required', 'Omit', 'Pick',
]);

function normalize(line: string): string {
  return line
    .trim()
    .replace(/\/\/.*$/, '')                               // strip line comments
    .replace(/'[^']*'/g, '"_STR_"')                       // single-quoted strings
    .replace(/"[^"]*"/g, '"_STR_"')                       // double-quoted strings
    .replace(/`[^`]*`/g, '"_STR_"')                       // template literals (single-line)
    .replace(/\b\d+(\.\d+)?\b/g, '_NUM_')                 // numbers
    .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, (m) =>     // all identifiers
      KEYWORDS.has(m) ? m : '_ID_',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function isTrivialLine(trimmed: string): boolean {
  if (!trimmed) return true;
  if (trimmed.length <= 3) return true;                    // }, {, );, etc.
  if (/^(import|export)\s/.test(trimmed) && !trimmed.includes('function')) return true;
  if (/^\/\//.test(trimmed)) return true;                  // line comments
  if (/^\/\*/.test(trimmed) || /^\*/.test(trimmed)) return true; // block comments
  return false;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

// ── Main ─────────────────────────────────────────────────────

/**
 * Generates a pattern-index.json artifact that maps normalized code block
 * fingerprints to their source locations. Used by the structural-duplication
 * guard for cross-file pattern matching.
 */
export function generatePatternIndex(
  inventory: InventoryData,
  targetDir: string,
): PatternIndex {
  const fingerprints: Record<string, PatternIndexEntry> = {};

  for (const fileInfo of inventory.files) {
    // Skip large files (already flagged by size guard)
    if (fileInfo.lines > MAX_FILE_LINES) continue;

    // Skip barrels (re-exports, not real code)
    const baseName = path.basename(fileInfo.path, path.extname(fileInfo.path)).toLowerCase();
    if (BARREL_NAMES.has(baseName)) continue;

    // Only index source files
    const ext = path.extname(fileInfo.path).toLowerCase();
    if (!SOURCE_EXTENSIONS.includes(ext)) continue;

    // Read file content
    const fullPath = path.join(targetDir, fileInfo.path);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue; // file may have been deleted since inventory was generated
    }

    const lines = content.split('\n');

    // Filter to meaningful lines with their original line numbers
    const meaningful: Array<{ normalized: string; originalLine: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (isTrivialLine(trimmed)) continue;
      const norm = normalize(lines[i]);
      if (norm.length < 5) continue; // skip very short normalized lines
      meaningful.push({ normalized: norm, originalLine: i + 1 });
    }

    // Sliding window
    for (let i = 0; i <= meaningful.length - WINDOW_SIZE; i++) {
      const windowLines = meaningful.slice(i, i + WINDOW_SIZE);
      const key = windowLines.map(m => m.normalized).join('|');
      const hash = simpleHash(key);

      if (!fingerprints[hash]) {
        fingerprints[hash] = {
          normalized: key,
          locations: [],
        };
      }

      const entry = fingerprints[hash];

      // Don't add more locations if this hash is already too common
      if (entry.locations.length >= MAX_LOCATIONS_PER_HASH) continue;

      // Avoid duplicate location entries for the same file
      const alreadyHasFile = entry.locations.some(
        loc => loc.file === fileInfo.path && Math.abs(loc.line - windowLines[0].originalLine) < WINDOW_SIZE,
      );
      if (alreadyHasFile) continue;

      entry.locations.push({
        file: fileInfo.path,
        line: windowLines[0].originalLine,
      });
    }
  }

  // Prune: keep only fingerprints appearing in 2+ distinct files (cross-file duplication)
  // Also remove fingerprints that appear in too many locations (common boilerplate)
  for (const hash of Object.keys(fingerprints)) {
    const entry = fingerprints[hash];
    const distinctFiles = new Set(entry.locations.map(l => l.file));
    if (distinctFiles.size < 2) {
      delete fingerprints[hash];
    } else if (entry.locations.length >= MAX_LOCATIONS_PER_HASH) {
      // Mark as common — guard will skip these
      delete fingerprints[hash];
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    windowSize: WINDOW_SIZE,
    fingerprints,
  };
}

// ── Analysis ────────────────────────────────────────────────

/**
 * Analyzes a PatternIndex to produce a human-readable summary of
 * existing structural duplication across the project.
 */
export function analyzePatternIndex(index: PatternIndex): StructuralDuplicationSummary {
  const entries = Object.values(index.fingerprints);
  const windowSize = index.windowSize || WINDOW_SIZE;

  if (entries.length === 0) {
    return {
      totalPatterns: 0, totalLocations: 0, estimatedDuplicateLines: 0,
      significantPairCount: 0, significantPairThreshold: SIGNIFICANT_PAIR_THRESHOLD,
      filePairs: [], topFiles: [],
    };
  }

  let totalLocations = 0;
  const pairCounts = new Map<string, { count: number; example: { file: string; line: number } }>();
  const fileCounts = new Map<string, number>();

  for (const entry of entries) {
    totalLocations += entry.locations.length;

    // Count per-file participation
    for (const loc of entry.locations) {
      fileCounts.set(loc.file, (fileCounts.get(loc.file) || 0) + 1);
    }

    // Generate all unique file pairs for this fingerprint
    const uniqueFiles = [...new Set(entry.locations.map(l => l.file))];
    for (let i = 0; i < uniqueFiles.length; i++) {
      for (let j = i + 1; j < uniqueFiles.length; j++) {
        const a = uniqueFiles[i] < uniqueFiles[j] ? uniqueFiles[i] : uniqueFiles[j];
        const b = uniqueFiles[i] < uniqueFiles[j] ? uniqueFiles[j] : uniqueFiles[i];
        const key = `${a}\0${b}`;
        const existing = pairCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          pairCounts.set(key, { count: 1, example: entry.locations[0] });
        }
      }
    }
  }

  // Sort pairs by shared pattern count descending
  const filePairs = [...pairCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([key, val]) => {
      const [fileA, fileB] = key.split('\0');
      return { fileA, fileB, sharedPatterns: val.count, exampleLine: val.example };
    });

  // Sort files by participation count descending
  const topFiles = [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, patternCount]) => ({ file, patternCount }));

  // Significant pairs: only pairs above threshold contribute to estimated lines
  const significantPairs = filePairs.filter(p => p.sharedPatterns >= SIGNIFICANT_PAIR_THRESHOLD);
  const estimatedDuplicateLines = significantPairs.reduce(
    (sum, p) => sum + p.sharedPatterns * windowSize, 0,
  );

  return {
    totalPatterns: entries.length,
    totalLocations,
    estimatedDuplicateLines,
    significantPairCount: significantPairs.length,
    significantPairThreshold: SIGNIFICANT_PAIR_THRESHOLD,
    filePairs,
    topFiles,
  };
}
