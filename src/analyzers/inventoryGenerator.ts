import * as path from 'path';
import * as fs from 'fs';
import {
  Project, SyntaxKind,
} from 'ts-morph';
import {
  FileInfo, ExportInfo, InventoryData, FileClassification, ProjectStats,
  GENERIC_FILE_NAMES, SOURCE_EXTENSIONS, EXCLUDE_DIRS,
} from '../types';
import { walkDirectory } from '../shared/walkDirectory';
import { extractSignature } from './extractSignature';
import { extractCSharpExports } from './extractCSharpExports';

function classifyFile(lines: number): FileClassification {
  if (lines > 800) return 'critical';
  if (lines > 500) return 'high';
  if (lines > 350) return 'medium';
  return 'ok';
}

function isGenericName(fileName: string): boolean {
  const baseName = path.basename(fileName, path.extname(fileName)).toLowerCase();
  return GENERIC_FILE_NAMES.some(g => baseName === g || baseName.startsWith(g));
}

function extractExportsWithTsMorph(filePath: string, project: Project): ExportInfo[] {
  const exports: ExportInfo[] = [];

  try {
    const sourceFile = project.addSourceFileAtPath(filePath);

    // Named exports (export function, export class, export const, etc.)
    for (const decl of sourceFile.getExportedDeclarations()) {
      const [name, nodes] = decl;
      if (name === 'default') continue;

      for (const node of nodes) {
        let type: ExportInfo['type'] = 'other';
        const kind = node.getKind();

        if (kind === SyntaxKind.FunctionDeclaration) type = 'function';
        else if (kind === SyntaxKind.ClassDeclaration) type = 'class';
        else if (kind === SyntaxKind.TypeAliasDeclaration) type = 'type';
        else if (kind === SyntaxKind.InterfaceDeclaration) type = 'interface';
        else if (kind === SyntaxKind.VariableDeclaration) type = 'const';
        else if (kind === SyntaxKind.EnumDeclaration) type = 'enum';

        let signature = extractSignature(node, kind);
        // Discard signatures polluted with resolved node_modules import paths
        if (signature && signature.includes('import(') && signature.includes('node_modules')) {
          signature = undefined;
        }

        exports.push({
          name,
          type,
          line: node.getStartLineNumber(),
          ...(signature ? { signature } : {}),
        });
      }
    }

    // Default export
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      exports.push({
        name: 'default',
        type: 'other',
        line: 1,
      });
    }

    project.removeSourceFile(sourceFile);
  } catch {
    // Fallback: regex-based extraction
    return extractExportsWithRegex(filePath);
  }

  return exports;
}

function extractExportsWithRegex(filePath: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const patterns: Array<{ regex: RegExp; type: ExportInfo['type'] }> = [
    { regex: /export\s+(?:async\s+)?function\s+(\w+)/, type: 'function' },
    { regex: /export\s+class\s+(\w+)/, type: 'class' },
    { regex: /export\s+type\s+(\w+)/, type: 'type' },
    { regex: /export\s+interface\s+(\w+)/, type: 'interface' },
    { regex: /export\s+(?:const|let|var)\s+(\w+)/, type: 'const' },
    { regex: /export\s+enum\s+(\w+)/, type: 'enum' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { regex, type } of patterns) {
      const match = line.match(regex);
      if (match) {
        exports.push({ name: match[1], type, line: i + 1 });
      }
    }
  }

  return exports;
}

function collectSourceFiles(dir: string, _baseDir: string, excludeDirs: string[]): string[] {
  const files: string[] = [];
  walkDirectory(dir, { excludeDirs, filterExt: SOURCE_EXTENSIONS }, (fullPath) => files.push(fullPath));
  return files;
}

export function generateInventory(dir: string, excludeDirs: string[] = EXCLUDE_DIRS): InventoryData {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      skipLibCheck: true,
    },
  });

  const filePaths = collectSourceFiles(dir, dir, excludeDirs);
  const files: FileInfo[] = [];

  const stats: ProjectStats = {
    totalFiles: 0,
    criticalFiles: 0,
    highFiles: 0,
    mediumFiles: 0,
    okFiles: 0,
    genericFiles: 0,
    totalLines: 0,
    totalExports: 0,
  };

  for (const filePath of filePaths) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lineCount = content.split('\n').length;
    const relativePath = path.relative(dir, filePath).replace(/\\/g, '/');
    const classification = classifyFile(lineCount);
    const generic = isGenericName(filePath);
    const isCSharp = path.extname(filePath) === '.cs';
    const exports = isCSharp
      ? extractCSharpExports(filePath)
      : extractExportsWithTsMorph(filePath, project);

    files.push({
      path: relativePath,
      lines: lineCount,
      exports,
      classification,
      isGeneric: generic,
    });

    stats.totalFiles++;
    stats.totalLines += lineCount;
    stats.totalExports += exports.length;
    if (generic) stats.genericFiles++;

    switch (classification) {
      case 'critical': stats.criticalFiles++; break;
      case 'high': stats.highFiles++; break;
      case 'medium': stats.mediumFiles++; break;
      case 'ok': stats.okFiles++; break;
    }
  }

  // Sort by lines descending
  files.sort((a, b) => b.lines - a.lines);

  return {
    generatedAt: new Date().toISOString(),
    files,
    stats,
  };
}
