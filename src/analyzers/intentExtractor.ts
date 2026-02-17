/**
 * Intent extraction utilities.
 *
 * Provides `splitCamelCase` for splitting PascalCase/camelCase identifiers
 * into words. Used by canonicalResolver and capabilityIndexer.
 *
 * The synonym-based normalization (VERB_SYNONYMS, NOUN_DOMAINS) was removed
 * because algorithmic semantic matching produced too many false positives.
 * Intent declarations are now handled by the AI via the intent protocol.
 */

// ── CamelCase splitter ──────────────────────────────────────────

/**
 * Split camelCase/PascalCase into words.
 * "formatCurrency"  → ["format", "currency"]
 * "validateEmail"   → ["validate", "email"]
 * "IUserService"    → ["user", "service"]  (single chars filtered)
 * "handleHTTPError" → ["handle", "http", "error"]
 *
 * Also used by canonicalResolver.ts — single source of truth.
 */
export function splitCamelCase(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 2);
}
