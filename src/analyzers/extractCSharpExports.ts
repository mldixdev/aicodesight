import * as fs from 'fs';
import { ExportInfo } from '../types';
import { compressType, truncMemberSig } from './extractSignature';

export function extractCSharpExports(filePath: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return exports;
  }

  const lines = content.split('\n');

  // In C#, "public" types are the equivalent of "exports" — they're what other files can use.
  const patterns: Array<{ regex: RegExp; type: ExportInfo['type'] }> = [
    { regex: /^\s*public\s+(?:sealed\s+|abstract\s+|static\s+|partial\s+)*class\s+(\w+)/, type: 'class' },
    { regex: /^\s*public\s+(?:sealed\s+|readonly\s+|partial\s+)*(?:record\s+(?:struct\s+)?)(\w+)/, type: 'class' },
    { regex: /^\s*public\s+(?:readonly\s+|partial\s+)*struct\s+(\w+)/, type: 'class' },
    { regex: /^\s*public\s+interface\s+(\w+)/, type: 'interface' },
    { regex: /^\s*public\s+enum\s+(\w+)/, type: 'enum' },
    { regex: /^\s*public\s+delegate\s+\S+\s+(\w+)/, type: 'type' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { regex, type } of patterns) {
      const match = line.match(regex);
      if (match) {
        const signature = extractCSharpSignature(lines, i, type);
        exports.push({
          name: match[1],
          type,
          line: i + 1,
          ...(signature ? { signature } : {}),
        });
        break;
      }
    }
  }

  return exports;
}

function extractCSharpSignature(lines: string[], startIdx: number, type: ExportInfo['type']): string | undefined {
  try {
    const declLine = lines[startIdx];

    if (type === 'enum') {
      return extractCSharpEnumMembers(lines, startIdx);
    }

    // Extract inheritance/implementation from the declaration line
    let prefix: string | undefined;
    const inheritMatch = declLine.match(/:\s*(.+?)(?:\s*\{|\s*$)/);
    if (inheritMatch) {
      prefix = `: ${inheritMatch[1].trim()}`;
    }

    const memberParts: string[] = [];
    let totalMembers = 0;

    if (type === 'class') {
      const { methods, properties, totalCount } = extractCSharpPublicMembers(lines, startIdx);
      memberParts.push(...methods, ...properties);
      totalMembers = totalCount;
    } else if (type === 'interface') {
      const { methods, totalCount } = extractCSharpInterfaceMembers(lines, startIdx);
      memberParts.push(...methods);
      totalMembers = totalCount;
    }

    if (memberParts.length === 0 && !prefix) return undefined;
    return truncMemberSig(memberParts, totalMembers, prefix);
  } catch {
    return undefined;
  }
}

function extractCSharpEnumMembers(lines: string[], startIdx: number): string | undefined {
  const members: string[] = [];
  let braceFound = false;

  for (let i = startIdx; i < lines.length && i < startIdx + 50; i++) {
    const line = lines[i];
    if (line.includes('{')) { braceFound = true; continue; }
    if (!braceFound) continue;
    if (line.trim().startsWith('}')) break;

    const memberMatch = line.trim().match(/^(\w+)/);
    if (memberMatch && memberMatch[1] !== '/') {
      members.push(memberMatch[1]);
    }
  }

  if (members.length === 0) return undefined;
  if (members.length <= 10) {
    return `{ ${members.join(', ')} }`;
  }
  return `{ ${members.slice(0, 10).join(', ')} ... +${members.length - 10} more }`;
}

function extractCSharpPublicMembers(
  lines: string[], classStartIdx: number,
): { methods: string[]; properties: string[]; totalCount: number } {
  const methods: string[] = [];
  const properties: string[] = [];
  let totalCount = 0;
  let braceDepth = 0;
  let insideClass = false;

  for (let i = classStartIdx; i < lines.length && i < classStartIdx + 200; i++) {
    const line = lines[i];

    for (const ch of line) {
      if (ch === '{') { braceDepth++; insideClass = true; }
      if (ch === '}') braceDepth--;
    }

    if (insideClass && braceDepth <= 0) break;
    if (braceDepth !== 1) continue;

    // Match public methods
    const methodMatch = line.match(
      /^\s*public\s+(?:static\s+|virtual\s+|override\s+|async\s+)*(\S+)\s+(\w+)\s*\(([^)]*)\)/,
    );
    if (methodMatch) {
      const [, returnType, methodName, params] = methodMatch;
      if (returnType === methodName) continue; // Skip constructors
      totalCount++;
      if (methods.length < 8) {
        const cleanParams = params.trim().replace(/\s+/g, ' ')
          .replace(/\w+\.\w+<[^>]+>/g, m => compressType(m));
        methods.push(`${methodName}(${cleanParams}): ${compressType(returnType)}`);
      }
      continue;
    }

    // Match public properties: public Type Name { get; set; }
    const propMatch = line.match(
      /^\s*public\s+(?:required\s+|virtual\s+)*(\S+(?:<[^>]+>)?)\??\s+(\w+)\s*\{\s*get;/,
    );
    if (propMatch) {
      totalCount++;
      if (properties.length < 8) {
        const [, propType, propName] = propMatch;
        const optional = line.includes('?') && line.indexOf('?') < line.indexOf(propName) ? '?' : '';
        properties.push(`${propName}${optional}: ${compressType(propType)}`);
      }
    }
  }

  return { methods, properties, totalCount };
}

function extractCSharpInterfaceMembers(
  lines: string[], ifaceStartIdx: number,
): { methods: string[]; totalCount: number } {
  const methods: string[] = [];
  let totalCount = 0;
  let braceDepth = 0;
  let insideIface = false;

  for (let i = ifaceStartIdx; i < lines.length && i < ifaceStartIdx + 100; i++) {
    const line = lines[i];

    for (const ch of line) {
      if (ch === '{') { braceDepth++; insideIface = true; }
      if (ch === '}') braceDepth--;
    }

    if (insideIface && braceDepth <= 0) break;
    if (braceDepth !== 1) continue;

    // Interface methods (no 'public' keyword in C# interfaces)
    const methodMatch = line.match(
      /^\s*(?:Task<[^>]+>|Task|[\w.<>[\]?]+)\s+(\w+)\s*\(([^)]*)\)\s*;/,
    );
    if (methodMatch) {
      totalCount++;
      if (methods.length < 8) {
        const returnType = line.trim().split(/\s+/)[0];
        const [, methodName, params] = methodMatch;
        const cleanParams = params.trim().replace(/\s+/g, ' ');
        methods.push(`${methodName}(${cleanParams}): ${compressType(returnType)}`);
      }
      continue;
    }

    // Interface properties
    const propMatch = line.match(
      /^\s*(\S+(?:<[^>]+>)?)\??\s+(\w+)\s*\{\s*get;/,
    );
    if (propMatch) {
      totalCount++;
      if (methods.length < 8) {
        const [, propType, propName] = propMatch;
        methods.push(`${propName}: ${compressType(propType)}`);
      }
    }
  }

  return { methods, totalCount };
}
