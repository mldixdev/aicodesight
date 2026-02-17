/**
 * Signature shape classification for the Capability Index.
 *
 * Classifies TypeScript function signatures into semantic categories
 * using regex pattern matching on the signature strings already
 * available in registry.json (extracted by extractSignature.ts).
 *
 * Also provides member extraction for interface/type overlap detection.
 */

// ── Signature shapes ────────────────────────────────────────────

export type SignatureShape =
  | 'predicate'             // (T) => boolean
  | 'collection-transform'  // (T[]) => T[] or Array<T> => Array<U>
  | 'factory-text'          // () => string
  | 'factory-object'        // () => T (non-primitive, no params)
  | 'filesystem-scan'       // (dir: string, ...) => T
  | 'void-effect'           // (...) => void | Promise<void>
  | 'async-fetch'           // (...) => Promise<T>
  | 'callback-pattern'      // (..., callback: Function) => void
  | 'mapper'                // (T) => U (single param, different return)
  | 'unknown';

// ── Classification ──────────────────────────────────────────────

/**
 * Classify a function signature string into a semantic shape.
 *
 * Order matters — patterns are checked from most specific to least.
 * First match wins.
 *
 * @param signature - The signature string from registry (e.g. "(items: Item[]) => Item[]")
 * @returns The classified shape
 */
export function classifySignature(signature: string | undefined): SignatureShape {
  if (!signature) return 'unknown';

  // Normalize whitespace for consistent matching
  const sig = signature.replace(/\s+/g, ' ').trim();

  // 1. Predicate: returns boolean
  if (/=>\s*boolean\s*$/.test(sig) || /=>\s*bool\s*$/.test(sig)) {
    return 'predicate';
  }

  // 2. Collection transform: array in → array out
  // Matches: (items: T[]) => T[], (arr: Array<T>) => Array<U>
  if (hasArrayParam(sig) && hasArrayReturn(sig)) {
    return 'collection-transform';
  }

  // 3. Callback pattern: last param is a function, returns void
  if (/callback|cb\)?\s*:|=>\s*void\)?\s*\)\s*=>\s*void/i.test(sig)) {
    return 'callback-pattern';
  }

  // 4. Filesystem scan: first param is dir/path string
  if (/^\(?\s*(dir|path|directory|targetDir|baseDir)\s*:\s*string/.test(sig)) {
    return 'filesystem-scan';
  }

  // 5. Factory text: no params, returns string
  if (/^\(\s*\)\s*=>\s*string\s*$/.test(sig)) {
    return 'factory-text';
  }

  // 6. Factory object: no params, returns non-primitive
  if (/^\(\s*\)\s*=>/.test(sig) && !isPrimitiveReturn(sig)) {
    return 'factory-object';
  }

  // 7. Void effect: returns void or Promise<void>
  if (/=>\s*void\s*$/.test(sig) || /=>\s*Promise\s*<\s*void\s*>\s*$/.test(sig)) {
    return 'void-effect';
  }

  // 8. Async fetch: returns Promise<T> (non-void)
  if (/=>\s*Promise\s*</.test(sig)) {
    return 'async-fetch';
  }

  // 9. Mapper: single param, non-void return
  if (isSingleParam(sig) && !isVoidReturn(sig)) {
    return 'mapper';
  }

  return 'unknown';
}

// ── Helpers for signature analysis ──────────────────────────────

function hasArrayParam(sig: string): boolean {
  // Check for T[] or Array<T> in params (before =>)
  const arrowIdx = sig.indexOf('=>');
  if (arrowIdx < 0) return false;
  const params = sig.substring(0, arrowIdx);
  return /\w+\[\]/.test(params) || /Array\s*</.test(params);
}

function hasArrayReturn(sig: string): boolean {
  const arrowIdx = sig.lastIndexOf('=>');
  if (arrowIdx < 0) return false;
  const ret = sig.substring(arrowIdx + 2).trim();
  return /\w+\[\]/.test(ret) || /Array\s*</.test(ret);
}

function isPrimitiveReturn(sig: string): boolean {
  const arrowIdx = sig.lastIndexOf('=>');
  if (arrowIdx < 0) return false;
  const ret = sig.substring(arrowIdx + 2).trim();
  return /^(string|number|boolean|void|any|null|undefined|never)\s*$/.test(ret);
}

function isVoidReturn(sig: string): boolean {
  return /=>\s*(void|Promise\s*<\s*void\s*>)\s*$/.test(sig);
}

function isSingleParam(sig: string): boolean {
  const arrowIdx = sig.indexOf('=>');
  if (arrowIdx < 0) return false;
  const params = sig.substring(0, arrowIdx);
  // Count top-level commas (not nested in <> or {})
  let depth = 0;
  let commas = 0;
  for (const ch of params) {
    if (ch === '<' || ch === '(' || ch === '{') depth++;
    else if (ch === '>' || ch === ')' || ch === '}') depth--;
    else if (ch === ',' && depth <= 1) commas++;
  }
  return commas === 0;
}

// ── Member extraction for interface overlap ─────────────────────

/**
 * Extract member names from an interface/type signature string.
 *
 * Input:  "{ name: string; age: number; email: string ... +2 more }"
 * Output: ["name", "age", "email"]
 *
 * Works with the truncated signature format produced by extractSignature.ts.
 */
export function extractMembers(signature: string): string[] {
  if (!signature.startsWith('{')) return [];

  const members: string[] = [];

  // Remove outer braces
  const inner = signature.slice(1, signature.lastIndexOf('}')).trim();
  if (!inner) return [];

  // Split by semicolons at depth 0
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '{' || ch === '(' || ch === '<') depth++;
    else if (ch === '}' || ch === ')' || ch === '>') depth--;
    else if (ch === ';' && depth === 0) {
      const name = extractMemberName(current.trim());
      if (name) members.push(name);
      current = '';
      continue;
    }
    current += ch;
  }
  // Last segment (no trailing semicolon)
  const lastName = extractMemberName(current.trim());
  if (lastName) members.push(lastName);

  return members;
}

/**
 * Extract the member name from a member declaration string.
 * "name: string"     → "name"
 * "age?: number"     → "age"
 * "getData(): void"  → "getData"
 * "... +5 more"      → null (truncation marker)
 */
function extractMemberName(member: string): string | null {
  if (!member || member.startsWith('...')) return null;

  // Skip inheritance prefix: "extends Foo; "
  if (member.startsWith('extends ') || member.startsWith('implements ')) return null;

  // Match: name followed by : or ? or (
  const match = member.match(/^(\w+)\s*[?:(]/);
  if (match) return match[1];

  // Match: constructor
  if (member.startsWith('new(')) return 'constructor';

  return null;
}
