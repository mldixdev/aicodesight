/**
 * Capability Indexer — Intent Registry v2.
 *
 * Generates a flat list of capability entries from the project registry.
 * Each entry profiles an exported function/type with its signature shape
 * and file-level side effects.
 *
 * Unlike v1 (which clustered by normalized intent and produced false positives),
 * v2 generates entries without any algorithmic similarity judgment.
 * Entries start as "extracted" (from code) and can be enriched with
 * AI-declared intents (description, domain, action, entity) via:
 * - Intent declarations in the transcript (parsed by pre-compact hook)
 * - Camino A enrichment sessions
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  RegistryData,
  CapabilityEntry, CapabilityIndexData, CapabilityIndexSummary,
} from '../types';
import { classifySignature } from './signatureClassifier';

// ── File content cache ──────────────────────────────────────────

const contentCache = new Map<string, string | null>();

function readFileContent(filePath: string): string | null {
  if (contentCache.has(filePath)) return contentCache.get(filePath)!;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    contentCache.set(filePath, content);
    return content;
  } catch {
    contentCache.set(filePath, null);
    return null;
  }
}

// ── Effect detection ────────────────────────────────────────────

const EFFECT_PATTERNS: Array<{ pattern: RegExp; effect: string }> = [
  { pattern: /\bfs\.\w+/,                    effect: 'filesystem' },
  { pattern: /\breadFileSync\b|\breadFile\b/, effect: 'filesystem' },
  { pattern: /\bwriteFileSync\b|\bwriteFile\b/, effect: 'filesystem' },
  { pattern: /\bfetch\s*\(|\baxios\b|\bhttp\.\w+/, effect: 'http' },
  { pattern: /\.query\s*\(|\.execute\s*\(|\.findOne\s*\(|\.findMany\s*\(/, effect: 'database' },
  { pattern: /\bconsole\.(log|error|warn|info)\b/, effect: 'console' },
  { pattern: /\bprocess\.(exit|env|cwd|argv)\b/, effect: 'process' },
];

const effectsCache = new Map<string, string[]>();

function detectEffects(filePath: string): string[] {
  const cached = effectsCache.get(filePath);
  if (cached) return cached;

  const content = readFileContent(filePath);
  if (!content) {
    effectsCache.set(filePath, []);
    return [];
  }

  const effects: string[] = [];
  for (const { pattern, effect } of EFFECT_PATTERNS) {
    if (pattern.test(content)) {
      if (!effects.includes(effect)) effects.push(effect);
    }
  }

  effectsCache.set(filePath, effects);
  return effects;
}

// ── Import extraction for dependsOn ─────────────────────────────

const NAMED_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

function parseNamedImports(content: string): Array<{ names: string[]; fromPath: string }> {
  const results: Array<{ names: string[]; fromPath: string }> = [];
  let match: RegExpExecArray | null;

  NAMED_IMPORT_RE.lastIndex = 0;
  while ((match = NAMED_IMPORT_RE.exec(content)) !== null) {
    const fromPath = match[2];
    if (!fromPath.startsWith('.')) continue; // only internal imports

    const names = match[1]
      .split(',')
      .map(n => {
        const trimmed = n.trim();
        const asMatch = trimmed.match(/^(\w+)\s+as\s+/);
        return asMatch ? asMatch[1] : trimmed;
      })
      .filter(n => /^\w+$/.test(n));

    if (names.length > 0) {
      results.push({ names, fromPath });
    }
  }

  return results;
}

const fileDepsCache = new Map<string, string[]>();

function extractFileDependsOn(filePath: string, knownExports: Set<string>): string[] {
  const cached = fileDepsCache.get(filePath);
  if (cached) return cached;

  const content = readFileContent(filePath);
  if (!content) {
    fileDepsCache.set(filePath, []);
    return [];
  }

  const imports = parseNamedImports(content);
  const deps: string[] = [];

  for (const imp of imports) {
    for (const name of imp.names) {
      if (knownExports.has(name) && !deps.includes(name)) {
        deps.push(name);
      }
    }
  }

  deps.sort();
  fileDepsCache.set(filePath, deps);
  return deps;
}

// ── @intent header extraction ────────────────────────────────────

interface IntentMetadata {
  description: string | null;
  domain: string | null;
  action: string | null;
  entity: string | null;
  dependsOn: string[] | null;
}

/**
 * Parses @intent tags from a text block (JSDoc comment or file header).
 * Shared parser used by both file-level and per-export extraction.
 */
function parseIntentFromBlock(block: string): IntentMetadata | null {
  if (!block.includes('@intent ')) return null;

  const metadata: IntentMetadata = {
    description: null, domain: null, action: null, entity: null, dependsOn: null,
  };

  const intentMatch = block.match(/@intent\s+(.+?)(?=\s*\*\/|\n\s*\*?\s*@|$)/s);
  if (intentMatch) {
    metadata.description = intentMatch[1].replace(/\n\s*\*\s*/g, ' ').trim();
  }

  const domainMatch = block.match(/@domain\s+(\S+)/);
  if (domainMatch) metadata.domain = domainMatch[1];

  const actionMatch = block.match(/@action\s+(\S+)/);
  if (actionMatch) metadata.action = actionMatch[1];

  const entityMatch = block.match(/@entity\s+(\S+)/);
  if (entityMatch) metadata.entity = entityMatch[1];

  const depsMatch = block.match(/@depends-on\s+(.+?)(?=\s*\*\/|\n\s*\*?\s*@|$)/);
  if (depsMatch) {
    const rawDeps = depsMatch[1]
      .split(/[,\s]+/)
      .map(d => d.replace(/^\*\s*/, '').trim())
      .filter(d => d.length > 0 && d !== 'none');
    if (rawDeps.length > 0) metadata.dependsOn = rawDeps;
  }

  if (!metadata.description) return null;
  return metadata;
}

// ── File-level @intent (header of file, first 30 lines) ─────────

/**
 * Extracts a block of consecutive C# XML doc comments (/// lines) from text
 * and returns the stripped content (without /// prefix). Returns null if none found.
 */
function extractXmlDocBlock(text: string): string | null {
  const lines = text.split('\n');
  let blockStart = -1;
  let blockEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('///')) {
      if (blockStart === -1) blockStart = i;
      blockEnd = i;
    } else if (blockStart !== -1) {
      break; // first contiguous block only
    }
  }

  if (blockStart === -1) return null;

  const block = lines.slice(blockStart, blockEnd + 1)
    .map(l => l.replace(/^\s*\/\/\/\s?/, ''))
    .join('\n')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ''); // strip XML tags (<summary>, </summary>, etc.)

  return block.includes('@intent ') ? block : null;
}

const intentCache = new Map<string, IntentMetadata | null>();

function extractIntentMetadata(filePath: string): IntentMetadata | null {
  if (intentCache.has(filePath)) return intentCache.get(filePath)!;

  const content = readFileContent(filePath);
  if (!content) {
    intentCache.set(filePath, null);
    return null;
  }

  const header = content.split('\n').slice(0, 30).join('\n');

  // Try JSDoc block first (/** ... */) — works for TS/JS
  const firstJsdoc = header.match(/\/\*\*[\s\S]*?\*\//);
  if (firstJsdoc) {
    const result = parseIntentFromBlock(firstJsdoc[0]);
    if (result) {
      intentCache.set(filePath, result);
      return result;
    }
  }

  // Try C# XML doc comments (consecutive /// lines)
  const xmlDocBlock = extractXmlDocBlock(header);
  if (xmlDocBlock) {
    const result = parseIntentFromBlock(xmlDocBlock);
    intentCache.set(filePath, result);
    return result;
  }

  intentCache.set(filePath, null);
  return null;
}

// ── Per-export @intent (JSDoc preceding each export declaration) ──

const exportIntentCache = new Map<string, IntentMetadata | null>();

/**
 * Extracts @intent from the JSDoc block immediately preceding an export.
 * Uses the export's line number to look backward and find the JSDoc.
 * Returns null if no JSDoc with @intent precedes the export.
 */
function extractIntentForExport(filePath: string, exportLine: number): IntentMetadata | null {
  const cacheKey = `${filePath}::${exportLine}`;
  if (exportIntentCache.has(cacheKey)) return exportIntentCache.get(cacheKey)!;

  const content = readFileContent(filePath);
  if (!content) {
    exportIntentCache.set(cacheKey, null);
    return null;
  }

  const lines = content.split('\n');
  const exportIdx = exportLine - 1; // 1-based to 0-based

  if (exportIdx < 1 || exportIdx >= lines.length) {
    exportIntentCache.set(cacheKey, null);
    return null;
  }

  // Look backward from export line, skip blank lines
  let searchIdx = exportIdx - 1;
  while (searchIdx >= 0 && lines[searchIdx].trim() === '') searchIdx--;

  if (searchIdx < 0) {
    exportIntentCache.set(cacheKey, null);
    return null;
  }

  let result: IntentMetadata | null = null;

  // Try JSDoc block (*/)
  if (lines[searchIdx].trim().endsWith('*/')) {
    let jsdocStart = searchIdx;
    while (jsdocStart > 0 && !lines[jsdocStart].includes('/**')) jsdocStart--;
    const jsdocBlock = lines.slice(jsdocStart, searchIdx + 1).join('\n');
    result = parseIntentFromBlock(jsdocBlock);
  }
  // Try C# XML doc comments (/// lines)
  else if (lines[searchIdx].trim().startsWith('///')) {
    let blockStart = searchIdx;
    while (blockStart > 0 && lines[blockStart - 1].trim().startsWith('///')) blockStart--;
    const xmlLines = lines.slice(blockStart, searchIdx + 1)
      .map(l => l.replace(/^\s*\/\/\/\s?/, ''))
      .join('\n')
      .replace(/<\/?[a-zA-Z][^>]*>/g, '');
    result = parseIntentFromBlock(xmlLines);
  }

  exportIntentCache.set(cacheKey, result);
  return result;
}

// ── Data constant filter ────────────────────────────────────────

/**
 * Identifies `const` exports that are data constants (label maps, config
 * values, env vars, static arrays) rather than functional capabilities.
 * These add noise to the capability index without aiding duplication detection.
 */
function isDataConstant(type: string, signature?: string): boolean {
  if (type !== 'const') return false;

  // Arrow functions are functional — keep
  if (signature && signature.includes('=>')) return false;

  // React components — keep
  if (signature && /React\.(FC|Component|memo|forwardRef)/.test(signature)) return false;

  // No signature at all — likely a primitive/string constant
  if (!signature) return true;

  // Record<...> are label/lookup maps
  if (/^Record</.test(signature)) return true;

  // Typed arrays (e.g., SectionId[], readonly [...])
  if (/\[\]$/.test(signature) || /^readonly\s+\[/.test(signature)) return true;

  // Simple type references without method shapes (e.g., SupabaseClient, CorsOptions, string)
  // A service object will have { methodA(...), methodB(...) } shape
  if (/^\w+$/.test(signature)) return true;

  // Object with methods → functional (service objects) — keep
  if (signature.startsWith('{') && /\w+\s*\(/.test(signature)) return false;

  // Plain object literals without methods → config/data
  if (signature.startsWith('{') && !/\w+\s*\(/.test(signature)) return true;

  return false;
}

// ── Main generation ─────────────────────────────────────────────

export function generateCapabilityIndex(
  registry: RegistryData,
  targetDir: string,
  existingIndex?: CapabilityIndexData,
): CapabilityIndexData {
  effectsCache.clear();
  contentCache.clear();
  fileDepsCache.clear();
  intentCache.clear();
  exportIntentCache.clear();

  // Build lookup of existing enriched/declared entries to preserve during regeneration
  const previousEntries = new Map<string, CapabilityEntry>();
  if (existingIndex) {
    for (const entry of existingIndex.entries) {
      if (entry.source === 'enriched' || entry.source === 'declared') {
        previousEntries.set(`${entry.name}::${entry.file}`, entry);
      }
    }
  }

  // Normalize unmapped entries into same shape as module exports: [filePath, exportName, RegistryExport]
  // Unmapped keys are "dirPath/filename:exportName"
  const unmappedExports: Array<[string, string, typeof registry.modules[string]['exports'][string]]> = [];
  if (registry.unmapped) {
    for (const [key, exp] of Object.entries(registry.unmapped)) {
      const colonIdx = key.lastIndexOf(':');
      if (colonIdx === -1) continue;
      const dirAndFile = key.substring(0, colonIdx);
      const exportName = key.substring(colonIdx + 1);
      // dirAndFile is like "smartcare-app/backend/src/services/pdfService.ts" — use as filePath directly
      unmappedExports.push([dirAndFile.replace(/\\/g, '/'), exportName, exp]);
    }
  }

  // Build set of all known project export names for cross-referencing
  const knownExports = new Set<string>();
  for (const mod of Object.values(registry.modules)) {
    for (const exportName of Object.keys(mod.exports)) {
      knownExports.add(exportName);
    }
  }
  for (const [, exportName] of unmappedExports) {
    knownExports.add(exportName);
  }

  // Pre-compute self-exports per file (exports from the same file should not be deps)
  const selfExportsByFile = new Map<string, Set<string>>();
  for (const [modulePath, mod] of Object.entries(registry.modules)) {
    for (const [exportName, exp] of Object.entries(mod.exports)) {
      const filePath = `${modulePath}/${exp.file}`.replace(/\\/g, '/');
      let selfSet = selfExportsByFile.get(filePath);
      if (!selfSet) {
        selfSet = new Set();
        selfExportsByFile.set(filePath, selfSet);
      }
      selfSet.add(exportName);
    }
  }
  for (const [filePath, exportName] of unmappedExports) {
    let selfSet = selfExportsByFile.get(filePath);
    if (!selfSet) {
      selfSet = new Set();
      selfExportsByFile.set(filePath, selfSet);
    }
    selfSet.add(exportName);
  }

  // Pre-compute non-data-constant export count per file.
  // File-level @intent only applies as 'declared' for single-export files;
  // multi-export files need per-export @intent or Sonnet enrichment.
  const exportCountByFile = new Map<string, number>();
  for (const [modulePath, mod] of Object.entries(registry.modules)) {
    for (const [, exp] of Object.entries(mod.exports)) {
      if (isDataConstant(exp.type, exp.signature)) continue;
      const filePath = `${modulePath}/${exp.file}`.replace(/\\/g, '/');
      exportCountByFile.set(filePath, (exportCountByFile.get(filePath) || 0) + 1);
    }
  }
  for (const [filePath, , exp] of unmappedExports) {
    if (isDataConstant(exp.type, exp.signature)) continue;
    exportCountByFile.set(filePath, (exportCountByFile.get(filePath) || 0) + 1);
  }

  const entries: CapabilityEntry[] = [];
  let hasEnrichedOrDeclared = false;

  function addEntry(exportName: string, exp: { type: string; file?: string; line: number; signature?: string }, filePath: string): void {
    // Skip data constants (label maps, config values, env vars)
    if (isDataConstant(exp.type, exp.signature)) return;

    const isFunctionLike = exp.type === 'function' ||
      (exp.type === 'const' && exp.signature?.includes('=>'));

    const fullPath = path.join(targetDir, filePath);
    const signatureShape = isFunctionLike ? classifySignature(exp.signature) : 'unknown';
    const effects = isFunctionLike ? detectEffects(fullPath) : [];

    const rawDeps = extractFileDependsOn(fullPath, knownExports);
    const selfExports = selfExportsByFile.get(filePath);
    const deps = selfExports ? rawDeps.filter(d => !selfExports.has(d)) : rawDeps;
    const staticDepsOn = deps.length > 0 ? deps : null;

    // Priority: per-export @intent > file-level @intent (single-export only) > enriched > extracted
    // File-level @intent applied to multi-export files would give all exports the same generic
    // description and mark them as 'declared', blocking Sonnet enrichment permanently.
    const prev = previousEntries.get(`${exportName}::${filePath}`);
    const perExportIntent = extractIntentForExport(fullPath, exp.line);
    const fileExportCount = exportCountByFile.get(filePath) || 1;
    const intent = perExportIntent ?? (fileExportCount === 1 ? extractIntentMetadata(fullPath) : null);

    if (intent) {
      // @intent header found — always use fresh from source
      hasEnrichedOrDeclared = true;
      entries.push({
        name: exportName, type: exp.type as CapabilityEntry['type'], file: filePath, line: exp.line,
        signature: exp.signature, signatureShape, effects,
        description: intent.description, domain: intent.domain,
        action: intent.action, entity: intent.entity,
        dependsOn: intent.dependsOn ?? staticDepsOn, source: 'declared',
      });
    } else if (prev) {
      // Preserve previous enriched/declared metadata
      hasEnrichedOrDeclared = true;
      entries.push({
        name: exportName, type: exp.type as CapabilityEntry['type'], file: filePath, line: exp.line,
        signature: exp.signature, signatureShape, effects,
        description: prev.description, domain: prev.domain, action: prev.action, entity: prev.entity,
        dependsOn: prev.dependsOn ?? staticDepsOn, source: prev.source,
      });
    } else {
      entries.push({
        name: exportName, type: exp.type as CapabilityEntry['type'], file: filePath, line: exp.line,
        signature: exp.signature, signatureShape, effects,
        description: null, domain: null, action: null, entity: null,
        dependsOn: staticDepsOn, source: 'extracted',
      });
    }
  }

  // Process module exports
  for (const [modulePath, mod] of Object.entries(registry.modules)) {
    for (const [exportName, exp] of Object.entries(mod.exports)) {
      const filePath = `${modulePath}/${exp.file}`.replace(/\\/g, '/');
      addEntry(exportName, exp, filePath);
    }
  }

  // Process unmapped exports (files not belonging to any detected module)
  for (const [filePath, exportName, exp] of unmappedExports) {
    addEntry(exportName, exp, filePath);
  }

  return {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    source: hasEnrichedOrDeclared ? 'hybrid' : 'static',
    entries,
  };
}

// ── Analysis ────────────────────────────────────────────────────

export function analyzeCapabilityIndex(data: CapabilityIndexData): CapabilityIndexSummary {
  let declaredCount = 0;
  let extractedCount = 0;
  let enrichedCount = 0;

  for (const entry of data.entries) {
    if (entry.source === 'declared') declaredCount++;
    else if (entry.source === 'enriched') enrichedCount++;
    else extractedCount++;
  }

  return {
    totalEntries: data.entries.length,
    declaredCount,
    extractedCount,
    enrichedCount,
  };
}
