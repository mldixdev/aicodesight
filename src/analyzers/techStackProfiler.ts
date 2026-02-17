import * as path from 'path';
import * as fs from 'fs';
import { ProjectProfile, TechStackProfile, StackLayer, StackLibrary, LibraryCategory, StackSelection } from '../types';
import { findFilesByExtension } from '../shared/walkDirectory';

const LIBRARY_CATEGORIES: Record<string, LibraryCategory> = {
  // Data fetching
  '@tanstack/react-query': 'data-fetching',
  'swr': 'data-fetching',
  'axios': 'data-fetching',
  // Routing
  '@tanstack/react-router': 'routing',
  'react-router': 'routing',
  'react-router-dom': 'routing',
  'next': 'routing',
  // State
  'zustand': 'state',
  '@reduxjs/toolkit': 'state',
  'jotai': 'state',
  'recoil': 'state',
  // UI Components
  '@tanstack/react-table': 'ui-components',
  'lucide-react': 'ui-components',
  '@radix-ui/react-dialog': 'ui-components',
  '@radix-ui/react-select': 'ui-components',
  // Styling
  'tailwindcss': 'styling',
  '@tailwindcss/vite': 'styling',
  'sass': 'styling',
  'styled-components': 'styling',
  // Forms
  'react-hook-form': 'forms',
  '@hookform/resolvers': 'forms',
  'formik': 'forms',
  // Validation
  'zod': 'validation',
  'yup': 'validation',
  'joi': 'validation',
  // Charts
  'recharts': 'charts',
  'chart.js': 'charts',
  'd3': 'charts',
  // Testing
  'vitest': 'testing',
  'jest': 'testing',
  '@testing-library/react': 'testing',
  'playwright': 'testing',
  // Auth
  'next-auth': 'auth',
  'jsonwebtoken': 'auth',
  // ORM
  'prisma': 'orm',
  '@prisma/client': 'orm',
  'typeorm': 'orm',
  'drizzle-orm': 'orm',
  // .NET libraries
  'Microsoft.EntityFrameworkCore': 'orm',
  'Microsoft.AspNetCore.Authentication.JwtBearer': 'auth',
  'AutoMapper': 'mapping',
  'Serilog': 'logging',
  'FluentValidation': 'validation',
  'ClosedXML': 'export',
  'QuestPDF': 'export',
  'Swashbuckle.AspNetCore': 'other',
};

const FRONTEND_PRIMARIES = ['react', 'next', 'vue', 'nuxt', 'angular', 'svelte', 'solid-js'];
const BACKEND_PRIMARIES_JS = ['express', 'fastify', 'nestjs', 'hono', 'koa'];

function categorize(libName: string): LibraryCategory {
  // Exact match
  if (LIBRARY_CATEGORIES[libName]) return LIBRARY_CATEGORIES[libName];
  // Prefix match (for @radix-ui/*, etc.)
  for (const [key, cat] of Object.entries(LIBRARY_CATEGORIES)) {
    if (libName.startsWith(key)) return cat;
  }
  // shadcn detected via components.json
  if (libName === 'shadcn' || libName === 'shadcn-ui') return 'ui-components';
  return 'other';
}

function detectBuildTool(deps: Record<string, string>): string | undefined {
  if (deps['vite'] || deps['@vitejs/plugin-react']) return 'Vite';
  if (deps['next']) return 'Next.js';
  if (deps['webpack']) return 'Webpack';
  if (deps['turbo'] || deps['turbopack']) return 'Turbopack';
  return undefined;
}

function parsePackageJson(targetDir: string): { frontend: StackLayer | null; backend: StackLayer | null } {
  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { frontend: null, backend: null };

  let pkg: any;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); } catch { return { frontend: null, backend: null }; }

  const allDeps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
  const libs: StackLibrary[] = [];

  for (const [name, version] of Object.entries(allDeps)) {
    const cat = categorize(name);
    if (cat !== 'other' || FRONTEND_PRIMARIES.includes(name) || BACKEND_PRIMARIES_JS.includes(name)) {
      libs.push({ name, version: String(version).replace(/[\^~]/, ''), category: cat });
    }
  }

  // Detect frontend primary
  let frontendPrimary: string | undefined;
  for (const p of FRONTEND_PRIMARIES) {
    if (allDeps[p]) { frontendPrimary = `${p.charAt(0).toUpperCase() + p.slice(1)} ${String(allDeps[p]).replace(/[\^~]/, '')}`; break; }
  }

  // Detect backend primary (JS)
  let backendPrimary: string | undefined;
  for (const p of BACKEND_PRIMARIES_JS) {
    if (allDeps[p]) { backendPrimary = `${p.charAt(0).toUpperCase() + p.slice(1)} ${String(allDeps[p]).replace(/[\^~]/, '')}`; break; }
  }

  const frontendLibs = libs.filter(l => !BACKEND_PRIMARIES_JS.includes(l.name));
  const backendLibs = libs.filter(l => BACKEND_PRIMARIES_JS.includes(l.name) || ['orm', 'auth', 'logging'].includes(l.category));

  const frontend: StackLayer | null = frontendPrimary ? {
    primary: frontendPrimary,
    libraries: frontendLibs,
    buildTool: detectBuildTool(allDeps),
  } : null;

  const backend: StackLayer | null = backendPrimary ? {
    primary: backendPrimary,
    libraries: backendLibs,
  } : null;

  return { frontend, backend };
}

function parseCsproj(targetDir: string, excludeDirs: string[]): StackLayer | null {
  const csprojFiles = findFilesRecursive(targetDir, '.csproj', excludeDirs);
  if (csprojFiles.length === 0) return null;

  const allLibs: StackLibrary[] = [];
  let primaryVersion = '.NET';

  for (const file of csprojFiles) {
    const content = fs.readFileSync(file, 'utf-8');

    // Detect target framework
    const tfMatch = content.match(/<TargetFramework>net(\d+\.\d+)<\/TargetFramework>/);
    if (tfMatch) primaryVersion = `.NET ${tfMatch[1]}`;

    // Extract PackageReferences
    const pkgRefRegex = /<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?/g;
    let match;
    while ((match = pkgRefRegex.exec(content)) !== null) {
      const name = match[1];
      const version = match[2];
      const cat = categorize(name);
      allLibs.push({ name, version, category: cat });
    }
  }

  if (allLibs.length === 0 && primaryVersion === '.NET') return null;

  return {
    primary: primaryVersion,
    libraries: allLibs,
    buildTool: 'dotnet',
  };
}

function parseMdForStack(targetDir: string): { frontend: StackLayer | null; backend: StackLayer | null; database: StackLayer | null } {
  const mdFiles = findFilesRecursive(targetDir, '.md', ['node_modules', '.git', '.claude', 'dist', 'bin', 'obj']);
  let frontend: StackLayer | null = null;
  let backend: StackLayer | null = null;
  let database: StackLayer | null = null;

  for (const file of mdFiles) {
    let content: string;
    try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }

    // Look for "Frontend" or "Paquetes Frontend" section
    if (!frontend) {
      const feMatch = content.match(/#{1,3}\s*(?:Paquetes?\s+)?(?:Frontend|Front[\s-]?end)[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|\n---|\z)/i);
      if (feMatch) {
        const section = feMatch[1];
        frontend = parseStackSection(section, 'frontend') ?? parsePackageTable(section, 'frontend');
      }
    }

    // Look for "Backend" or "Paquetes Backend" section
    if (!backend) {
      const beMatch = content.match(/#{1,3}\s*(?:Paquetes?\s+)?(?:Backend|Back[\s-]?end)[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|\n---|\z)/i);
      if (beMatch) {
        const section = beMatch[1];
        backend = parseStackSection(section, 'backend') ?? parsePackageTable(section, 'backend');
      }
    }

    // Look for "Database" section
    if (!database) {
      const dbMatch = content.match(/#{1,3}\s*(?:Database|Base\s+de\s+[Dd]atos|DB)[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|\n---|\z)/i);
      if (dbMatch) {
        const section = dbMatch[1];
        const dbName = extractDbName(section);
        if (dbName) {
          database = { primary: dbName, libraries: [] };
        }
      }
    }

    // Fallback: search entire file content for database mentions
    if (!database) {
      const dbName = extractDbName(content);
      if (dbName) {
        database = { primary: dbName, libraries: [] };
      }
    }
  }

  return { frontend, backend, database };
}

function parseStackSection(text: string, layer: 'frontend' | 'backend'): StackLayer | null {
  const libs: StackLibrary[] = [];
  let primary = '';

  // Extract items from bullet points or inline mentions
  const lines = text.split('\n');
  for (const line of lines) {
    // Match patterns like "- React 19" or "- TanStack Query v5"
    const itemMatch = line.match(/[-*]\s+\*?\*?([^*\n]+)/);
    if (!itemMatch) continue;
    const item = itemMatch[1].trim();

    // Try to identify the library
    for (const [libName, cat] of Object.entries(LIBRARY_CATEGORIES)) {
      const shortName = libName.replace(/^@[^/]+\//, '');
      if (item.toLowerCase().includes(shortName.toLowerCase())) {
        const vMatch = item.match(/v?(\d+[\d.]*)/);
        libs.push({ name: libName, version: vMatch?.[1], category: cat });
      }
    }

    // Detect primary framework
    if (layer === 'frontend') {
      for (const p of ['React', 'Vue', 'Angular', 'Svelte', 'Next.js']) {
        if (item.includes(p)) {
          const vMatch = item.match(/(\d+[\d.]*)/);
          primary = vMatch ? `${p} ${vMatch[1]}` : p;
        }
      }
    }
    if (layer === 'backend') {
      for (const p of ['.NET', 'Express', 'Fastify', 'NestJS', 'Django', 'Spring']) {
        if (item.includes(p)) {
          const vMatch = item.match(/(\d+[\d.]*)/);
          primary = vMatch ? `${p} ${vMatch[1]}` : p;
        }
      }
    }

    // shadcn detection
    if (item.toLowerCase().includes('shadcn')) {
      libs.push({ name: 'shadcn-ui', category: 'ui-components' });
    }
    // Tailwind
    if (item.toLowerCase().includes('tailwind')) {
      const vMatch = item.match(/v?(\d+[\d.]*)/);
      libs.push({ name: 'tailwindcss', version: vMatch?.[1], category: 'styling' });
    }
    // Zod
    if (item.toLowerCase().includes('zod')) {
      libs.push({ name: 'zod', category: 'validation' });
    }
    // React Hook Form
    if (item.toLowerCase().includes('react hook form')) {
      libs.push({ name: 'react-hook-form', category: 'forms' });
    }
    // Recharts
    if (item.toLowerCase().includes('recharts')) {
      libs.push({ name: 'recharts', category: 'charts' });
    }
    // date-fns
    if (item.toLowerCase().includes('date-fns')) {
      libs.push({ name: 'date-fns', category: 'other' });
    }
    // lucide
    if (item.toLowerCase().includes('lucide')) {
      libs.push({ name: 'lucide-react', category: 'ui-components' });
    }
  }

  if (!primary && libs.length === 0) return null;

  // Dedupe libs
  const seen = new Set<string>();
  const dedupedLibs = libs.filter(l => {
    if (seen.has(l.name)) return false;
    seen.add(l.name);
    return true;
  });

  return { primary: primary || (layer === 'frontend' ? 'Unknown Frontend' : 'Unknown Backend'), libraries: dedupedLibs };
}

/**
 * Parse a markdown table of packages: | Paquete/Package | Version | Purpose |
 */
function parsePackageTable(text: string, layer: 'frontend' | 'backend'): StackLayer | null {
  // Look for a table with Paquete/Package header
  const tableMatch = text.match(/\|[^\n]*(?:Paquete|Package|Nombre)[^\n]*\|\n\|[-:\s|]+\|\n((?:\|[^\n]*\|\n?)+)/i);
  if (!tableMatch) return null;

  const rows = tableMatch[1].trim().split('\n');
  const libs: StackLibrary[] = [];
  let primary = '';

  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cols.length < 2) continue;

    const pkgName = cols[0].replace(/\*\*/g, '').trim();
    const version = cols[1]?.replace(/\*\*/g, '').trim();

    // Detect primary
    if (layer === 'frontend') {
      for (const p of ['react', 'vue', 'angular', 'svelte', 'next']) {
        if (pkgName.toLowerCase() === p) {
          primary = `${pkgName.charAt(0).toUpperCase() + pkgName.slice(1)} ${version}`;
        }
      }
    }
    if (layer === 'backend') {
      if (pkgName.toLowerCase().includes('entityframework') || pkgName.toLowerCase().includes('.net')) {
        if (!primary) primary = `.NET`;
      }
    }

    // Try to categorize by the LIBRARY_CATEGORIES map or by keywords
    let cat = categorize(pkgName);
    // Also try matching partial names for table format (e.g. "shadcn/ui", "@tanstack/react-query")
    if (cat === 'other') {
      for (const [key, keyCat] of Object.entries(LIBRARY_CATEGORIES)) {
        if (pkgName.includes(key.split('/').pop() || '') || key.includes(pkgName)) {
          cat = keyCat;
          break;
        }
      }
    }

    libs.push({ name: pkgName, version: version?.replace(/\.x$/, '') || undefined, category: cat });
  }

  if (libs.length === 0) return null;

  return { primary: primary || (layer === 'frontend' ? 'Unknown Frontend' : 'Unknown Backend'), libraries: libs };
}

function extractDbName(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('sql server') || lower.includes('mssql')) return 'SQL Server';
  if (lower.includes('postgresql') || lower.includes('postgres')) return 'PostgreSQL';
  if (lower.includes('mysql')) return 'MySQL';
  if (lower.includes('sqlite')) return 'SQLite';
  if (lower.includes('mongodb') || lower.includes('mongo')) return 'MongoDB';
  return null;
}

function findFilesRecursive(dir: string, ext: string, excludeDirs: string[]): string[] {
  return findFilesByExtension(dir, ext, excludeDirs);
}

function hasShadcn(targetDir: string): boolean {
  return fs.existsSync(path.join(targetDir, 'components.json'));
}

export function profileTechStack(
  targetDir: string,
  profile: ProjectProfile,
  excludeDirs: string[],
): TechStackProfile {
  // 1. Parse package.json (most reliable for JS/TS projects)
  const fromPkg = parsePackageJson(targetDir);

  // 2. Parse .csproj (for .NET projects)
  const fromCsproj = parseCsproj(targetDir, excludeDirs);

  // 3. Parse .md files (fallback / complementary)
  const fromMd = parseMdForStack(targetDir);

  // Merge: prefer package.json/csproj over .md, but .md fills gaps
  let frontend = fromPkg.frontend ?? fromMd.frontend;
  let backend = fromCsproj ?? fromPkg.backend ?? fromMd.backend;
  const database = fromMd.database;

  // Enrich frontend with shadcn if components.json exists
  if (frontend && hasShadcn(targetDir)) {
    const hasShadcnLib = frontend.libraries.some(l => l.name.includes('shadcn'));
    if (!hasShadcnLib) {
      frontend.libraries.push({ name: 'shadcn-ui', category: 'ui-components' });
    }
  }

  // If .md detected libraries that package.json missed, merge them
  if (frontend && fromMd.frontend) {
    const existingNames = new Set(frontend.libraries.map(l => l.name));
    for (const lib of fromMd.frontend.libraries) {
      if (!existingNames.has(lib.name)) frontend.libraries.push(lib);
    }
  }
  if (backend && fromMd.backend) {
    const existingNames = new Set(backend.libraries.map(l => l.name));
    for (const lib of fromMd.backend.libraries) {
      if (!existingNames.has(lib.name)) backend.libraries.push(lib);
    }
  }

  const detected = !!(frontend || backend || database);

  return { frontend, backend, database, detected };
}

// === Build from interactive selection ===

const SELECTION_LIB_MAP: Record<string, { name: string; category: LibraryCategory }> = {
  'tanstack-query': { name: '@tanstack/react-query', category: 'data-fetching' },
  'tanstack-table': { name: '@tanstack/react-table', category: 'ui-components' },
  'tanstack-router': { name: '@tanstack/react-router', category: 'routing' },
  'tailwind': { name: 'tailwindcss', category: 'styling' },
  'shadcn': { name: 'shadcn-ui', category: 'ui-components' },
  'zustand': { name: 'zustand', category: 'state' },
  'react-hook-form': { name: 'react-hook-form', category: 'forms' },
  'zod': { name: 'zod', category: 'validation' },
  // .NET
  'efcore': { name: 'Microsoft.EntityFrameworkCore', category: 'orm' },
  'mediatr': { name: 'MediatR', category: 'other' },
  'fluentvalidation': { name: 'FluentValidation', category: 'validation' },
  'automapper': { name: 'AutoMapper', category: 'mapping' },
  'signalr': { name: 'Microsoft.AspNetCore.SignalR', category: 'other' },
  // JS ORMs
  'prisma': { name: '@prisma/client', category: 'orm' },
  'typeorm': { name: 'typeorm', category: 'orm' },
  'drizzle': { name: 'drizzle-orm', category: 'orm' },
};

export function buildTechStackFromSelection(selection: StackSelection): TechStackProfile {
  let frontend: StackLayer | null = null;
  let backend: StackLayer | null = null;
  let database: StackLayer | null = null;

  if (selection.frontend) {
    const libs: StackLibrary[] = selection.frontend.libraries
      .filter(id => SELECTION_LIB_MAP[id])
      .map(id => ({ name: SELECTION_LIB_MAP[id].name, category: SELECTION_LIB_MAP[id].category }));

    frontend = { primary: selection.frontend.framework, libraries: libs };
  }

  if (selection.backend) {
    const libs: StackLibrary[] = selection.backend.libraries
      .filter(id => SELECTION_LIB_MAP[id])
      .map(id => ({ name: SELECTION_LIB_MAP[id].name, category: SELECTION_LIB_MAP[id].category }));

    if (selection.backend.framework === '.NET') {
      backend = { primary: '.NET', libraries: libs, buildTool: 'dotnet' };
    } else {
      backend = { primary: selection.backend.framework, libraries: libs };
    }
  }

  if (selection.database) {
    database = { primary: selection.database.engine, libraries: [] };
  }

  return { frontend, backend, database, detected: true };
}
