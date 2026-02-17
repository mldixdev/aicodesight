import * as path from 'path';
import * as fs from 'fs';
import { InventoryData, DetectedModule, ModuleMapData, EXCLUDE_DIRS } from '../types';
import { walkDirectory } from '../shared/walkDirectory';

/**
 * Detect meaningful modules in the project.
 *
 * A "module" is a directory or project that acts as a reusable unit:
 * - JS/TS: directories with barrel files (index.ts/index.js) that re-export
 * - .NET: each .csproj project
 * - Monorepo: each package in packages/
 *
 * The goal is to pre-populate the "Available modules" section in CLAUDE.md
 * so the AI knows what exists from the first session.
 */

// Directories that signal intentionally shared/reusable code
const SHARED_DIRS = ['shared', 'common', 'lib', 'core', 'utils', 'helpers', 'packages'];

function detectBarrelModules(dir: string, inventory: InventoryData): DetectedModule[] {
  const modules: DetectedModule[] = [];

  // Find all barrel files (index.ts, index.js, index.tsx, index.jsx)
  const barrelFiles = inventory.files.filter(f => {
    const base = path.basename(f.path);
    return /^index\.(ts|tsx|js|jsx)$/.test(base);
  });

  for (const barrel of barrelFiles) {
    const barrelDir = path.dirname(barrel.path);
    if (barrelDir === '.' || barrelDir === '') continue; // Skip root index

    const dirName = path.basename(barrelDir);
    const exportNames = barrel.exports
      .filter(e => e.name !== 'default')
      .map(e => e.name);

    if (exportNames.length === 0) continue; // Empty barrel, skip

    // Check if this is inside a shared/common/packages directory
    const pathParts = barrelDir.replace(/\\/g, '/').split('/');
    const isShared = pathParts.some(p => SHARED_DIRS.includes(p.toLowerCase()));

    // For non-shared directories, only include if it has meaningful exports (3+)
    if (!isShared && exportNames.length < 3) continue;

    const topExports = exportNames.slice(0, 10);

    modules.push({
      path: barrelDir.replace(/\\/g, '/'),
      name: dirName,
      type: 'barrel',
      exports: topExports,
      totalExports: exportNames.length,
    });
  }

  return modules;
}

function detectCsprojModules(dir: string, excludeDirs: string[]): DetectedModule[] {
  const modules: DetectedModule[] = [];

  walkDirectory(dir, { excludeDirs, maxDepth: 3, filterExt: ['.csproj'] }, (fullPath) => {
    const projectName = path.basename(fullPath, '.csproj');
    const projectDir = path.relative(dir, path.dirname(fullPath)).replace(/\\/g, '/') || '.';

    // Parse .csproj for SDK type to generate description
    let description: string | undefined;
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('Microsoft.NET.Sdk.Web')) {
        description = 'ASP.NET Core Web API/MVC project';
      } else if (content.includes('Microsoft.NET.Sdk.Worker')) {
        description = '.NET Worker Service';
      } else if (content.includes('Microsoft.NET.Sdk.BlazorWebAssembly')) {
        description = 'Blazor WebAssembly project';
      } else if (content.includes('xunit') || content.includes('NUnit') || content.includes('MSTest')) {
        description = 'Test project';
      } else {
        description = '.NET Class Library';
      }
    } catch {
      description = '.NET project';
    }

    // Find public types in this project's files
    const projectExports = findCSharpPublicTypes(path.dirname(fullPath), dir, excludeDirs);

    modules.push({
      path: projectDir,
      name: projectName,
      type: 'csproj',
      exports: projectExports.slice(0, 15),
      totalExports: projectExports.length,
      description,
    });
  });

  return modules;
}

function findCSharpPublicTypes(projectDir: string, _baseDir: string, excludeDirs: string[]): string[] {
  const types: string[] = [];
  const classRegex = /^\s*public\s+(?:sealed\s+|abstract\s+|static\s+|partial\s+)*(?:class|record|struct|interface|enum)\s+(\w+)/;

  walkDirectory(projectDir, { excludeDirs, filterExt: ['.cs'] }, (fullPath) => {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(classRegex);
        if (match) types.push(match[1]);
      }
    } catch { /* ignore unreadable files */ }
  });

  return types;
}

function detectPackageModules(dir: string, excludeDirs: string[]): DetectedModule[] {
  const modules: DetectedModule[] = [];
  const packagesDir = path.join(dir, 'packages');

  if (!fs.existsSync(packagesDir)) return modules;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return modules;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || excludeDirs.includes(entry.name)) continue;

    const pkgDir = path.join(packagesDir, entry.name);
    const pkgJsonPath = path.join(pkgDir, 'package.json');

    if (!fs.existsSync(pkgJsonPath)) continue;

    let description: string | undefined;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      description = pkg.description || undefined;
    } catch {
      // ignore
    }

    const relativePath = `packages/${entry.name}`;

    modules.push({
      path: relativePath,
      name: entry.name,
      type: 'package',
      exports: [], // Package-level exports are complex; the barrel detection handles internal modules
      totalExports: 0,
      description,
    });
  }

  return modules;
}

/**
 * Detect significant directories that aren't barrels but contain related files.
 * For example: src/services/ with 5 service files, src/components/ with UI components.
 * Only includes directories with 3+ source files that aren't already detected as barrels.
 */
function detectSignificantDirectories(
  dir: string,
  inventory: InventoryData,
  existingPaths: Set<string>,
  parentModulePaths: string[],
): DetectedModule[] {
  const modules: DetectedModule[] = [];

  // Group files by their parent directory
  const dirMap = new Map<string, { exports: string[]; fileCount: number }>();

  for (const file of inventory.files) {
    const fileDir = path.dirname(file.path).replace(/\\/g, '/');
    if (fileDir === '.' || fileDir === '' || existingPaths.has(fileDir)) continue;

    // Skip directories that are children of csproj/package modules
    // e.g. "Backend/PortalIndicadores.Data/PortalIndicadores.Data/Models" is a child of
    // the csproj at "Backend/PortalIndicadores.Data/PortalIndicadores.Data"
    const isChildOfModule = parentModulePaths.some(parentPath =>
      fileDir.startsWith(parentPath + '/'),
    );
    if (isChildOfModule) continue;

    if (!dirMap.has(fileDir)) {
      dirMap.set(fileDir, { exports: [], fileCount: 0 });
    }
    const entry = dirMap.get(fileDir)!;
    entry.fileCount++;
    for (const exp of file.exports) {
      if (exp.name !== 'default') {
        entry.exports.push(exp.name);
      }
    }
  }

  for (const [dirPath, data] of dirMap.entries()) {
    // Only include directories with meaningful content
    if (data.fileCount < 3 || data.exports.length < 3) continue;

    const pathParts = dirPath.split('/');
    const dirName = pathParts[pathParts.length - 1];

    modules.push({
      path: dirPath,
      name: dirName,
      type: 'directory',
      exports: data.exports.slice(0, 15),
      totalExports: data.exports.length,
    });
  }

  return modules;
}

export function detectModules(dir: string, inventory: InventoryData, excludeDirs: string[] = EXCLUDE_DIRS): ModuleMapData {
  // Detect different types of modules
  const barrelModules = detectBarrelModules(dir, inventory);
  const csprojModules = detectCsprojModules(dir, excludeDirs);
  const packageModules = detectPackageModules(dir, excludeDirs);

  // Collect already-detected paths to avoid duplication
  // Include both exact paths and all parent paths (so child dirs of csproj projects are excluded)
  const existingPaths = new Set<string>();
  for (const m of [...barrelModules, ...csprojModules, ...packageModules]) {
    existingPaths.add(m.path);
  }

  // Detect significant directories not already captured
  // Pass parent module paths so child directories are filtered out
  const parentModulePaths = [...csprojModules, ...packageModules].map(m => m.path);
  const dirModules = detectSignificantDirectories(dir, inventory, existingPaths, parentModulePaths);

  // Filter barrel modules that are children of csproj/package modules
  // e.g. "Backend/Project/Project/Services" barrel is internal to the csproj
  const filteredBarrels = barrelModules.filter(barrel =>
    !parentModulePaths.some(parentPath => barrel.path.startsWith(parentPath + '/')),
  );

  // Combine and sort: csproj/packages first (project-level), then barrels, then directories
  const allModules = [
    ...csprojModules,
    ...packageModules,
    ...filteredBarrels,
    ...dirModules,
  ];

  return { modules: allModules };
}
