import * as path from 'path';
import * as fs from 'fs';
import {
  InventoryData, ConventionIssue, ConventionReport,
  GENERIC_FILE_NAMES, SOURCE_EXTENSIONS, EXCLUDE_DIRS,
} from '../types';

// === Naming Convention Rules ===

const NAMING_PATTERNS: Array<{
  test: (fileName: string, ext: string) => boolean;
  rule: string;
  message: (fileName: string) => string;
  suggestion: (fileName: string) => string;
}> = [
  {
    // Generic file names: utils.ts, helpers.ts, misc.ts, etc.
    test: (fileName) => {
      const base = fileName.toLowerCase();
      return GENERIC_FILE_NAMES.some(g => base === g || base === `${g}s`);
    },
    rule: 'no-generic-names',
    message: (f) => `"${f}" is a generic name that attracts unrelated code`,
    suggestion: () => 'Rename with a descriptive name: verbNoun.ts (e.g.: formatCurrency.ts)',
  },
  {
    // .tsx files should be PascalCase (components)
    test: (fileName, ext) => {
      if (ext !== '.tsx') return false;
      if (fileName === 'index') return false;
      // Check if NOT PascalCase
      return !/^[A-Z][a-zA-Z0-9]*$/.test(fileName);
    },
    rule: 'component-pascal-case',
    message: (f) => `Component "${f}.tsx" does not use PascalCase`,
    suggestion: (f) => {
      const pascal = f.charAt(0).toUpperCase() + f.slice(1);
      return `Rename to ${pascal}.tsx`;
    },
  },
  {
    // Hook files should start with "use"
    test: (fileName, ext) => {
      if (ext !== '.ts' && ext !== '.tsx') return false;
      if (!fileName.startsWith('use')) return false;
      // Check proper camelCase after "use"
      if (fileName.length > 3 && fileName[3] !== fileName[3].toUpperCase()) {
        return true; // useauth instead of useAuth
      }
      return false;
    },
    rule: 'hook-naming',
    message: (f) => `Hook "${f}" should follow useName pattern (camelCase after "use")`,
    suggestion: (f) => {
      const after = f.slice(3);
      return `Rename to use${after.charAt(0).toUpperCase()}${after.slice(1)}`;
    },
  },
];

function checkFileNaming(filePath: string): ConventionIssue | null {
  const ext = path.extname(filePath);
  const fileName = path.basename(filePath, ext);

  // Skip index files and type definitions
  if (fileName === 'index' || fileName.endsWith('.d')) return null;

  for (const pattern of NAMING_PATTERNS) {
    if (pattern.test(fileName, ext)) {
      return {
        file: filePath,
        severity: 'warning',
        rule: pattern.rule,
        message: pattern.message(fileName),
        suggestion: pattern.suggestion(fileName),
      };
    }
  }

  return null;
}

// === Barrel File (index.ts) Checks ===

function findDirectoriesWithoutBarrels(dir: string, baseDir: string, excludeDirs: string[]): ConventionIssue[] {
  const issues: ConventionIssue[] = [];

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    const subdirs = entries.filter(e => e.isDirectory() && !excludeDirs.includes(e.name));
    const sourceFiles = entries.filter(
      e => e.isFile() && SOURCE_EXTENSIONS.includes(path.extname(e.name))
    );

    // If this directory has 2+ source files but no index.ts/index.js
    if (sourceFiles.length >= 2) {
      const hasBarrel = sourceFiles.some(
        f => f.name === 'index.ts' || f.name === 'index.tsx' || f.name === 'index.js' || f.name === 'index.jsx'
      );

      if (!hasBarrel) {
        const relativePath = path.relative(baseDir, current).replace(/\\/g, '/');
        // Only flag src directories, not root
        if (relativePath.startsWith('src')) {
          issues.push({
            file: relativePath + '/',
            severity: 'warning',
            rule: 'missing-barrel',
            message: `Directory with ${sourceFiles.length} source files without a barrel file (index.ts)`,
            suggestion: `Create ${relativePath}/index.ts that exports public modules`,
          });
        }
      }
    }

    for (const subdir of subdirs) {
      walk(path.join(current, subdir.name));
    }
  }

  walk(dir);
  return issues;
}

// === Heavy Export Files (>5 exports = "mini black boxes") ===

function checkHeavyExporters(inventory: InventoryData): ConventionIssue[] {
  const issues: ConventionIssue[] = [];
  const EXPORT_THRESHOLD = 5;

  for (const file of inventory.files) {
    // Skip barrel files
    if (file.path.endsWith('/index.ts') || file.path.endsWith('/index.js')) continue;

    if (file.exports.length > EXPORT_THRESHOLD) {
      issues.push({
        file: file.path,
        severity: 'warning',
        rule: 'too-many-exports',
        message: `${file.exports.length} exports in a single file (recommended max: ${EXPORT_THRESHOLD})`,
        suggestion: `Consider splitting into smaller files with 1 responsibility each`,
      });
    }
  }

  return issues;
}

// === Main ===

export function checkConventions(dir: string, inventory: InventoryData, excludeDirs: string[] = EXCLUDE_DIRS): ConventionReport {
  const issues: ConventionIssue[] = [];
  let namingIssues = 0;
  let missingBarrels = 0;

  // 1. Naming check on all files
  for (const file of inventory.files) {
    const issue = checkFileNaming(file.path);
    if (issue) {
      issues.push(issue);
      namingIssues++;
    }
  }

  // 2. Missing barrel files
  const barrelIssues = findDirectoriesWithoutBarrels(dir, dir, excludeDirs);
  issues.push(...barrelIssues);
  missingBarrels = barrelIssues.length;

  // 3. Heavy exporters
  const heavyIssues = checkHeavyExporters(inventory);
  issues.push(...heavyIssues);

  // Calculate compliance: files without issues / total files
  const filesWithIssues = new Set(issues.map(i => i.file)).size;
  const totalFiles = inventory.files.length;
  const compliancePercent = totalFiles > 0
    ? Math.round(((totalFiles - filesWithIssues) / totalFiles) * 100)
    : 100;

  return {
    issues,
    namingIssues,
    missingBarrels,
    totalIssues: issues.length,
    compliancePercent,
  };
}
