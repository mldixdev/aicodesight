/**
 * # Canonical Resolver — Intelligent duplicate resolution
 *
 * ## Problem
 *
 * When duplicate exports are detected (same name in multiple files),
 * we need to determine which is the "canonical" version — the one the AI should use
 * and the others ignore. Without this, the AI doesn't know which to pick or creates a third.
 *
 * The naive approach (pick the first alphabetically) fails because
 * filesystem order has no relation to code quality or intent.
 *
 * ## Solution: Multi-signal scoring
 *
 * Each location of a duplicate is scored with 8 independent signals.
 * The location with the highest score is canonical. The difference between first
 * and second determines the confidence level.
 *
 * ## Signals and weights
 *
 * | #  | Signal                   | Range      | Logic                                                     |
 * |----|--------------------------|------------|-----------------------------------------------------------|
 * | S1 | Semantic name            | +15 to +40 | The filename matches the export.                          |
 * |    |                          |            | +40 if exact (formatCurrency.ts → formatCurrency)         |
 * |    |                          |            | +15 per partial word (validation.ts → validateEmail)      |
 * | S2 | Semantic folder          | +12        | The folder contains a word from the export.               |
 * |    |                          |            | E.g.: formatting/ for formatCurrency                      |
 * | S3 | shared/common location   | +15        | Code intentionally placed as shared.                      |
 * | S4 | Dependency relationship  | +25 / -15  | If another duplicate's file imports THIS file,            |
 * |    |                          |            | this is the original (+25). If THIS imports from other,   |
 * |    |                          |            | this is the copy (-15).                                   |
 * | S5 | Popularity (importers)   | 0 to +18   | More files import this = more established.                |
 * |    |                          |            | Formula: min(importedByCount * 3, 18)                     |
 * | S6 | Generic file             | -25        | utils.ts, helpers.ts penalized.                           |
 * |    |                          |            | They are "junk drawers", not intentional locations.       |
 * | S7 | File focus               | -12 to +18 | Small files with few exports = purpose-built.             |
 * |    |                          |            | Large files with many exports = grab bag.                 |
 * |    |                          |            | Lines: >500 → -12, >300 → -6, <=80 → +10                |
 * |    |                          |            | Exports: >10 → -12, <=3 → +8                             |
 * | S8 | Function cluster         | 0 to +15   | If the file has other functions with common words         |
 * |    |                          |            | (e.g.: formatDate alongside formatCurrency), it's the     |
 * |    |                          |            | "home" for that type of functionality. +5 per fn, max 15. |
 *
 * ## Tiebreakers (when scores are equal)
 *
 * 1. More importers wins
 * 2. Fewer lines wins (more focused file)
 *
 * ## Confidence levels
 *
 * Based on the difference (gap) between #1 and #2 scores:
 *
 * | Gap    | Confidence | AI action                                      |
 * |--------|------------|------------------------------------------------|
 * | >= 20  | high       | Use canonical directly, IGNORE alternatives    |
 * | 10-19  | medium     | Use canonical, but mention uncertainty          |
 * | < 10   | low        | Ask user which is canonical                     |
 *
 * ## Resolved example
 *
 * Given: formatCurrency exists in 3 files:
 *
 * | File                                  | S1  | S2  | S3  | S4  | S5  | S6  | S7      | S8  | Total |
 * |---------------------------------------|-----|-----|-----|-----|-----|-----|---------|-----|-------|
 * | src/shared/formatting/formatCurrency.ts| +40 | +12 | +15 |  0  | +9  |  0  | +10,+8  |  0  |  94   |
 * | src/utils.ts                          |  0  |  0  |  0  | +25 | +18 | -25 | -12,-12 | +15 |   9   |
 * | src/helpers.ts                        |  0  |  0  |  0  | -15 | +6  | -25 |  -6,0   | +10 | -30   |
 *
 * Result: formatCurrency.ts wins with high confidence (gap: 85).
 * The dedicated file beats the generic one, even though utils.ts has more importers.
 *
 * ## Known limitations
 *
 * - S4 depends on DependencyData.mostImported (top 30). Rarely imported files
 *   won't have this signal.
 * - S1 uses substring matching, which can produce false positives with short names.
 *   Words of <=2 characters are filtered to mitigate this.
 * - S8 compares exact camelCase words. "format" matches "formatDate" but
 *   not "formatter" (stemming would be needed for that).
 * - The first run has no prior data for comparison. The resolver works
 *   with current data only.
 *
 * ## Integration
 *
 * Used by:
 * - unifiedTemplate.ts: Output with confidence tiers or simplified based on flags
 *
 * Receives DuplicateData.duplicates that is pre-filtered (only 'accidental' category),
 * without barrels or cross-stack mirrors.
 */

import * as path from 'path';
import {
  DuplicateData,
  DuplicateLocation,
  InventoryData,
  FileInfo,
  DependencyData,
  DependencyEntry,
} from '../types';
import { splitCamelCase } from './intentExtractor';

// === Public types ===

export type CanonicalConfidence = 'high' | 'medium' | 'low';

export interface ScoredLocation {
  file: string;
  line: number;
  score: number;
  reasons: string[];
  signature?: string;
}

export interface ResolvedDuplicate {
  name: string;
  type: string;
  canonical: ScoredLocation;
  alternatives: ScoredLocation[];
  confidence: CanonicalConfidence;
}

// === Internals ===

function findFileInfo(inventory: InventoryData, filePath: string): FileInfo | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  return inventory.files.find(f => f.path.replace(/\\/g, '/') === normalized);
}

function findDepEntry(deps: DependencyData, filePath: string): DependencyEntry | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  return deps.mostImported.find(d => d.file.replace(/\\/g, '/') === normalized);
}

function scoreLocation(
  exportName: string,
  location: DuplicateLocation,
  allLocations: DuplicateLocation[],
  inventory: InventoryData,
  deps: DependencyData,
): ScoredLocation {
  let score = 0;
  const reasons: string[] = [];

  const fileInfo = findFileInfo(inventory, location.file);
  const depEntry = findDepEntry(deps, location.file);
  const normalizedPath = location.file.replace(/\\/g, '/');

  const ext = path.extname(location.file);
  const fileName = path.basename(location.file, ext).toLowerCase();
  const exportWords = splitCamelCase(exportName);

  // ─── Signal 1: Semantic name match (filename contains export keywords) ───
  // This is the strongest "this file was MADE for this function" signal.
  // "validateEmail" in "validation.ts" → "validat" matches.
  // "formatCurrency" in "formatCurrency.ts" → exact match.
  let semanticHits = 0;
  for (const word of exportWords) {
    // Check substring match (handles "validate" ↔ "validation")
    if (fileName.includes(word) || word.includes(fileName.replace(/\./g, ''))) {
      semanticHits++;
    }
  }
  if (semanticHits > 0) {
    // Exact filename match (formatCurrency.ts for formatCurrency) gets max bonus
    const exportNameLower = exportName.charAt(0).toLowerCase() + exportName.slice(1);
    if (fileName === exportNameLower || fileName === exportName.toLowerCase()) {
      score += 40;
      reasons.push('exact filename match');
    } else {
      score += semanticHits * 15;
      reasons.push('semantic name match');
    }
  }

  // ─── Signal 2: Directory semantic match ───
  // "formatCurrency" in "formatting/" or "currency/" → bonus
  const parts = normalizedPath.split('/');
  const dirName = parts.length > 1 ? parts[parts.length - 2].toLowerCase() : '';
  for (const word of exportWords) {
    if (dirName.includes(word) || word.includes(dirName)) {
      score += 12;
      reasons.push(`folder "${dirName}"`);
      break;
    }
  }

  // ─── Signal 3: shared/common location ───
  // Code intentionally placed in shared/ or common/ was meant to be reused
  if (normalizedPath.includes('/shared/') || normalizedPath.includes('/common/')) {
    score += 15;
    reasons.push('in shared/common');
  }

  // ─── Signal 4: Dependency relationship ───
  // If another duplicate location's file imports THIS file, this is likely the original.
  // This is a very strong signal — it means another file with the same export
  // already depends on this file, suggesting this is the source.
  if (depEntry) {
    for (const other of allLocations) {
      if (other.file === location.file) continue;
      const otherNormalized = other.file.replace(/\\/g, '/');
      if (depEntry.importedBy.some(imp => imp.replace(/\\/g, '/') === otherNormalized)) {
        score += 25;
        reasons.push(`${path.basename(other.file)} depends on this`);
        break;
      }
    }
  }

  // Reverse: if THIS file imports from another duplicate location, it's likely the copy
  for (const other of allLocations) {
    if (other.file === location.file) continue;
    const otherDepEntry = findDepEntry(deps, other.file);
    if (otherDepEntry) {
      const thisNormalized = normalizedPath;
      if (otherDepEntry.importedBy.some(imp => imp.replace(/\\/g, '/') === thisNormalized)) {
        score -= 15;
        reasons.push(`imports from ${path.basename(other.file)}`);
        break;
      }
    }
  }

  // ─── Signal 5: Import count (general popularity) ───
  // More importers = more established = more likely to be the "real" one
  if (depEntry && depEntry.importedByCount > 0) {
    score += Math.min(depEntry.importedByCount * 3, 18);
    if (depEntry.importedByCount >= 3) {
      reasons.push(`${depEntry.importedByCount} importers`);
    }
  }

  // ─── Signal 6: Generic file penalty ───
  // Functions in utils.ts, helpers.ts etc. are less canonical — these are
  // "junk drawer" files where things end up by convenience, not by design
  if (fileInfo?.isGeneric) {
    score -= 25;
    reasons.push('generic file');
  }

  // ─── Signal 7: File focus (size + export count) ───
  // A small file with few exports is likely purpose-built for its content
  // A large file with many exports is a grab bag
  if (fileInfo) {
    if (fileInfo.lines > 500) {
      score -= 12;
    } else if (fileInfo.lines > 300) {
      score -= 6;
    } else if (fileInfo.lines <= 80) {
      score += 10;
      reasons.push('focused file');
    }

    if (fileInfo.exports.length > 10) {
      score -= 12;
      reasons.push(`${fileInfo.exports.length} exports`);
    } else if (fileInfo.exports.length <= 3) {
      score += 8;
    }
  }

  // ─── Signal 8: Cluster detection ───
  // If this file has other exports with semantically related names,
  // it's the "home" for this type of functionality.
  // e.g. utils.ts has formatCurrency, formatDate, formatPhone → "format" cluster
  // This bonus makes the file a better candidate than one with just the one function.
  if (fileInfo && fileInfo.exports.length > 1) {
    const relatedCount = fileInfo.exports.filter(e => {
      if (e.name === exportName) return false;
      const eWords = splitCamelCase(e.name);
      return exportWords.some(w => eWords.some(ew => ew === w));
    }).length;

    if (relatedCount > 0) {
      score += Math.min(relatedCount * 5, 15);
      reasons.push(`${relatedCount + 1} related functions`);
    }
  }

  // ─── Signal 9: Signature awareness ───
  // If this location has a type signature and others don't, it's from a
  // better-analyzed source (ts-morph vs regex fallback).
  // If both have signatures but they differ, they're likely different functions
  // that happen to share a name — reduce overall confidence.
  if (location.signature) {
    const othersWithSigs = allLocations.filter(
      o => o.file !== location.file && o.signature,
    );
    if (othersWithSigs.length === 0) {
      // Only this one has a signature → better source
      score += 5;
      reasons.push('has type signature');
    } else {
      // Compare signatures — if different, penalize (not a true duplicate)
      for (const other of othersWithSigs) {
        if (other.signature !== location.signature) {
          score -= 10;
          reasons.push('signature differs');
          break;
        }
      }
    }
  }

  return {
    file: location.file,
    line: location.line,
    score,
    reasons,
    ...(location.signature ? { signature: location.signature } : {}),
  };
}

// === Public API ===

/**
 * Resolves which location of each duplicate export is the "canonical" version.
 *
 * Uses 8 signals to score each location:
 * 1. Semantic name match (filename ↔ export name)
 * 2. Directory semantic match
 * 3. shared/common location bonus
 * 4. Dependency relationship (is another dup's file importing this one?)
 * 5. General import count (popularity)
 * 6. Generic file penalty (utils.ts, helpers.ts)
 * 7. File focus (size + export count)
 * 8. Cluster detection (related exports in same file)
 *
 * Returns results with confidence levels:
 * - high: score gap ≥ 20 — clear winner, AI can act confidently
 * - medium: score gap 10-19 — likely winner, AI should mention uncertainty
 * - low: score gap < 10 — ambiguous, AI should ask user to decide
 */
export function resolveCanonicals(
  duplicates: DuplicateData,
  inventory: InventoryData,
  deps: DependencyData,
): ResolvedDuplicate[] {
  return duplicates.duplicates.map(dup => {
    const scored = dup.locations.map(loc =>
      scoreLocation(dup.name, loc, dup.locations, inventory, deps),
    );

    // Sort by score descending, tiebreak by import count then fewer exports
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker 1: more importers wins
      const aImports = findDepEntry(deps, a.file)?.importedByCount ?? 0;
      const bImports = findDepEntry(deps, b.file)?.importedByCount ?? 0;
      if (bImports !== aImports) return bImports - aImports;
      // Tiebreaker 2: fewer lines wins
      const aLines = findFileInfo(inventory, a.file)?.lines ?? 999;
      const bLines = findFileInfo(inventory, b.file)?.lines ?? 999;
      return aLines - bLines;
    });

    const canonical = scored[0];
    const alternatives = scored.slice(1);

    // Confidence based on gap between top two
    const gap = alternatives.length > 0 ? canonical.score - alternatives[0].score : 100;
    let confidence: CanonicalConfidence;
    if (gap >= 20) {
      confidence = 'high';
    } else if (gap >= 10) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      name: dup.name,
      type: dup.type,
      canonical,
      alternatives,
      confidence,
    };
  });
}
