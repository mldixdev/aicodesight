import * as path from 'path';
import * as fs from 'fs';
import { InventoryData, DependencyData, DependencyEntry } from '../types';

interface ImportInfo {
  fromFile: string;
  toFile: string;
}

function resolveImportPath(importPath: string, fromFile: string, baseDir: string): string | null {
  // Only resolve relative imports
  if (!importPath.startsWith('.')) return null;

  const fromDir = path.dirname(path.join(baseDir, fromFile));
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];

  // Try exact path
  let resolved = path.resolve(fromDir, importPath);

  // Try with extensions
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt)) {
      return path.relative(baseDir, withExt).replace(/\\/g, '/');
    }
  }

  // Try as directory with index
  for (const ext of extensions) {
    const indexFile = path.join(resolved, `index${ext}`);
    if (fs.existsSync(indexFile)) {
      return path.relative(baseDir, indexFile).replace(/\\/g, '/');
    }
  }

  return null;
}

function extractImports(filePath: string, baseDir: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const fullPath = path.join(baseDir, filePath);

  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return imports;
  }

  // Match ES import statements
  const importRegex = /import\s+(?:(?:\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]/g;
  // Match require statements
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  const patterns = [importRegex, requireRegex];

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];
      const resolved = resolveImportPath(importPath, filePath, baseDir);
      if (resolved) {
        imports.push({
          fromFile: filePath,
          toFile: resolved,
        });
      }
    }
  }

  return imports;
}

/**
 * Build a map of C# namespace → files that declare that namespace.
 * Then for each file, extract `using ProjectNamespace.X;` and resolve
 * to the files that declare that namespace.
 *
 * This is approximate — C# namespaces don't map 1:1 to files — but
 * good enough to identify which files are most depended upon.
 */
function buildCSharpDependencies(
  dir: string,
  inventory: InventoryData,
  importCountMap: Map<string, Set<string>>,
): void {
  // Step 1: Build namespace → files map
  const namespaceToFiles = new Map<string, string[]>();
  // Detect project root namespace (from .csproj RootNamespace or folder name)
  const projectNamespaces = new Set<string>();

  for (const file of inventory.files) {
    if (!file.path.endsWith('.cs')) continue;
    const fullPath = path.join(dir, file.path);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    // Extract namespace declarations
    // Supports both: `namespace Foo.Bar { }` and `namespace Foo.Bar;` (file-scoped)
    const nsMatch = content.match(/namespace\s+([\w.]+)/);
    if (nsMatch) {
      const ns = nsMatch[1];
      if (!namespaceToFiles.has(ns)) {
        namespaceToFiles.set(ns, []);
      }
      namespaceToFiles.get(ns)!.push(file.path);
      // Track root namespace segments
      const rootPart = ns.split('.')[0];
      projectNamespaces.add(rootPart);
    }
  }

  // Step 2: For each C# file, extract using statements and resolve to project files
  for (const file of inventory.files) {
    if (!file.path.endsWith('.cs')) continue;
    const fullPath = path.join(dir, file.path);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const usingRegex = /^using\s+([\w.]+)\s*;/gm;
    let match: RegExpExecArray | null;
    while ((match = usingRegex.exec(content)) !== null) {
      const usedNamespace = match[1];
      // Only resolve project-internal namespaces (skip System.*, Microsoft.*, etc.)
      const rootPart = usedNamespace.split('.')[0];
      if (!projectNamespaces.has(rootPart)) continue;

      const targetFiles = namespaceToFiles.get(usedNamespace);
      if (targetFiles) {
        for (const targetFile of targetFiles) {
          if (targetFile === file.path) continue; // Don't count self-references
          if (importCountMap.has(targetFile)) {
            importCountMap.get(targetFile)!.add(file.path);
          }
        }
      }
    }
  }
}

export function mapDependencies(dir: string, inventory: InventoryData): DependencyData {
  const importCountMap = new Map<string, Set<string>>();

  // Initialize all files
  for (const file of inventory.files) {
    importCountMap.set(file.path, new Set());
  }

  // Extract JS/TS imports
  for (const file of inventory.files) {
    if (file.path.endsWith('.cs')) continue; // Skip C# files for JS import extraction
    const imports = extractImports(file.path, dir);
    for (const imp of imports) {
      if (importCountMap.has(imp.toFile)) {
        importCountMap.get(imp.toFile)!.add(imp.fromFile);
      }
    }
  }

  // Extract C# namespace-based dependencies
  const hasCSharp = inventory.files.some(f => f.path.endsWith('.cs'));
  if (hasCSharp) {
    buildCSharpDependencies(dir, inventory, importCountMap);
  }

  // Build sorted entries (only files imported by at least 1 other file)
  const entries: DependencyEntry[] = [];

  for (const [file, importedBy] of importCountMap.entries()) {
    if (importedBy.size > 0) {
      entries.push({
        file,
        importedByCount: importedBy.size,
        importedBy: Array.from(importedBy).sort(),
      });
    }
  }

  // Sort by import count descending
  entries.sort((a, b) => b.importedByCount - a.importedByCount);

  // Take top 30 most imported
  const mostImported = entries.slice(0, 30);

  return {
    generatedAt: new Date().toISOString(),
    mostImported,
  };
}
