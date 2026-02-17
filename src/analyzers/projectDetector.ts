import * as path from 'path';
import * as fs from 'fs';
import { ProjectProfile, ProjectStats, GENERIC_FILE_NAMES, SOURCE_EXTENSIONS, EXCLUDE_DIRS } from '../types';
import { walkDirectory, findFilesByExtension } from '../shared/walkDirectory';

function countSourceFiles(dir: string, excludeDirs: string[]): { total: number; lines: number; genericCount: number } {
  let total = 0;
  let lines = 0;
  let genericCount = 0;

  walkDirectory(dir, { excludeDirs, filterExt: SOURCE_EXTENSIONS }, (fullPath, entry) => {
    total++;
    const content = fs.readFileSync(fullPath, 'utf-8');
    lines += content.split('\n').length;
    const baseName = path.basename(entry.name, path.extname(entry.name)).toLowerCase();
    if (GENERIC_FILE_NAMES.some(g => baseName === g || baseName.startsWith(g))) {
      genericCount++;
    }
  });

  return { total, lines, genericCount };
}

function findCsprojFiles(dir: string, excludeDirs: string[]): string[] {
  const results: string[] = [];
  walkDirectory(dir, { excludeDirs, maxDepth: 3, filterExt: ['.csproj'] }, (fullPath) => results.push(fullPath));
  return results;
}

function detectDotNetFrameworks(dir: string, excludeDirs: string[]): string[] {
  const frameworks: string[] = [];
  const csprojFiles = findCsprojFiles(dir, excludeDirs);
  if (csprojFiles.length === 0) return frameworks;

  frameworks.push('.NET');

  // Parse all .csproj files for PackageReference
  const allPackages = new Set<string>();
  for (const csproj of csprojFiles) {
    try {
      const content = fs.readFileSync(csproj, 'utf-8');
      const pkgRefs = content.matchAll(/<PackageReference\s+Include="([^"]+)"/gi);
      for (const match of pkgRefs) {
        allPackages.add(match[1].toLowerCase());
      }
      // Also check for Sdk attribute (web projects)
      if (content.includes('Microsoft.NET.Sdk.Web')) {
        allPackages.add('microsoft.aspnetcore');
      }
    } catch {
      // ignore unreadable csproj
    }
  }

  if (allPackages.has('microsoft.aspnetcore') ||
      [...allPackages].some(p => p.startsWith('microsoft.aspnetcore'))) {
    frameworks.push('ASP.NET Core');
  }
  if ([...allPackages].some(p => p.startsWith('microsoft.entityframeworkcore'))) {
    frameworks.push('EF Core');
  }
  if ([...allPackages].some(p => p.includes('blazor') || p.startsWith('microsoft.aspnetcore.components'))) {
    frameworks.push('Blazor');
  }
  if ([...allPackages].some(p => p.includes('mediatr'))) {
    frameworks.push('MediatR');
  }
  if ([...allPackages].some(p => p.includes('automapper'))) {
    frameworks.push('AutoMapper');
  }
  if ([...allPackages].some(p => p.includes('fluentvalidation'))) {
    frameworks.push('FluentValidation');
  }
  if ([...allPackages].some(p => p.includes('signalr'))) {
    frameworks.push('SignalR');
  }

  return frameworks;
}

function detectFrameworks(dir: string, excludeDirs: string[]): string[] {
  const frameworks: string[] = [];

  // Node.js ecosystem (package.json)
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps['next']) frameworks.push('Next.js');
      else if (allDeps['react']) frameworks.push('React');
      if (allDeps['vue']) frameworks.push('Vue');
      if (allDeps['angular'] || allDeps['@angular/core']) frameworks.push('Angular');
      if (allDeps['express']) frameworks.push('Express');
      if (allDeps['fastify']) frameworks.push('Fastify');
      if (allDeps['nestjs'] || allDeps['@nestjs/core']) frameworks.push('NestJS');
      if (allDeps['prisma'] || allDeps['@prisma/client']) frameworks.push('Prisma');
      if (allDeps['typeorm']) frameworks.push('TypeORM');
      if (allDeps['tailwindcss']) frameworks.push('Tailwind');
      if (allDeps['vite']) frameworks.push('Vite');
    } catch {
      // ignore malformed package.json
    }
  }

  // .NET ecosystem (.csproj / .sln)
  frameworks.push(...detectDotNetFrameworks(dir, excludeDirs));

  return frameworks;
}

function detectLanguage(dir: string, excludeDirs: string[]): 'typescript' | 'javascript' | 'csharp' | 'mixed' {
  let tsCount = 0;
  let jsCount = 0;
  let csCount = 0;

  walkDirectory(dir, { excludeDirs, filterExt: ['.ts', '.tsx', '.js', '.jsx', '.cs'] }, (_fullPath, entry) => {
    const ext = path.extname(entry.name);
    if (ext === '.ts' || ext === '.tsx') tsCount++;
    else if (ext === '.js' || ext === '.jsx') jsCount++;
    else if (ext === '.cs') csCount++;
  });

  const jsTotal = tsCount + jsCount;

  // Pure C# project
  if (csCount > 0 && jsTotal === 0) return 'csharp';
  // Pure TS project (tsconfig or only .ts files)
  if (csCount === 0 && tsCount > 0 && jsCount === 0) return 'typescript';
  if (csCount === 0 && tsCount > 0) {
    const tsConfig = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(tsConfig)) return 'typescript';
  }
  // Mixed (any combination of 2+ languages)
  if ((csCount > 0 && jsTotal > 0) || (tsCount > 0 && jsCount > 0)) return 'mixed';
  if (tsCount > 0) return 'typescript';
  if (jsCount > 0) return 'javascript';

  // Empty project (0 files): check for tsconfig.json, default to typescript
  const tsConfig = path.join(dir, 'tsconfig.json');
  if (fs.existsSync(tsConfig)) return 'typescript';
  return 'typescript';
}

function detectStructure(dir: string, excludeDirs: string[]): 'monorepo' | 'single-package' {
  const packagesDir = path.join(dir, 'packages');
  const lernaJson = path.join(dir, 'lerna.json');
  const pnpmWorkspace = path.join(dir, 'pnpm-workspace.yaml');

  if (fs.existsSync(packagesDir) || fs.existsSync(lernaJson) || fs.existsSync(pnpmWorkspace)) {
    return 'monorepo';
  }

  // Check package.json for workspaces
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.workspaces) return 'monorepo';
    } catch {
      // ignore
    }
  }

  // .NET: .sln with multiple .csproj = multi-project solution (≈ monorepo)
  const csprojFiles = findCsprojFiles(dir, excludeDirs);
  if (csprojFiles.length > 1) {
    return 'monorepo';
  }

  return 'single-package';
}

export function detectProject(dir: string, forceType?: string, excludeDirs: string[] = EXCLUDE_DIRS): ProjectProfile {
  const { total, lines, genericCount } = countSourceFiles(dir, excludeDirs);
  const frameworks = detectFrameworks(dir, excludeDirs);
  const language = detectLanguage(dir, excludeDirs);
  const structure = detectStructure(dir, excludeDirs);

  // Determine project type
  let type: 'new' | 'organized' | 'legacy';

  if (forceType && forceType !== 'auto') {
    type = forceType as 'new' | 'organized' | 'legacy';
  } else {
    // Heuristics:
    // - new: < 20 files
    // - legacy: high generic ratio (>30%), or many large files, or no clear structure
    // - organized: everything else
    const genericRatio = total > 0 ? genericCount / total : 0;

    if (total < 20) {
      type = 'new';
    } else if (genericRatio > 0.3 || (lines / Math.max(total, 1)) > 300) {
      type = 'legacy';
    } else {
      type = 'organized';
    }
  }

  const stats: ProjectStats = {
    totalFiles: total,
    criticalFiles: 0,  // Will be filled by inventoryGenerator
    highFiles: 0,
    mediumFiles: 0,
    okFiles: 0,
    genericFiles: genericCount,
    totalLines: lines,
    totalExports: 0,    // Will be filled by inventoryGenerator
  };

  return {
    type,
    structure,
    frameworks,
    language,
    stats,
  };
}
