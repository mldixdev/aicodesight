import * as path from 'path';
import { InventoryData, DuplicateGroup, DuplicateData, DuplicateLocation, DuplicateCategory } from '../types';

const BARREL_NAMES = new Set(['index']);
const CS_EXTENSIONS = new Set(['.cs']);
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function isBarrelFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext).toLowerCase();
  return BARREL_NAMES.has(base);
}

function getStack(filePath: string): 'backend' | 'frontend' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();
  if (CS_EXTENSIONS.has(ext)) return 'backend';
  if (TS_EXTENSIONS.has(ext)) return 'frontend';
  return 'unknown';
}

/**
 * Categorize a duplicate group based on its locations and signatures.
 *
 * Decision tree:
 * 1. Remove barrel locations → if only 1 non-barrel left → 'barrel'
 * 2. If remaining locations span different stacks (.cs vs .ts) → 'cross-stack'
 * 3. If signatures available and differ → 'polymorphic'
 * 4. Otherwise → 'accidental' (genuine duplicate)
 */
function categorize(
  nonBarrelLocs: DuplicateLocation[],
): DuplicateCategory {
  // Cross-stack check
  const stacks = new Set(nonBarrelLocs.map(l => getStack(l.file)));
  if (stacks.has('backend') && (stacks.has('frontend') || stacks.has('unknown'))) {
    return 'cross-stack';
  }

  // Signature comparison — polymorphic if signatures differ
  const withSigs = nonBarrelLocs.filter(l => l.signature);
  if (withSigs.length >= 2) {
    const uniqueSigs = new Set(withSigs.map(l => l.signature));
    if (uniqueSigs.size > 1) {
      return 'polymorphic';
    }
  }

  return 'accidental';
}

export function detectDuplicates(inventory: InventoryData): DuplicateData {
  // Group exports by name (excluding 'default')
  const exportMap = new Map<string, DuplicateLocation[]>();

  for (const file of inventory.files) {
    for (const exp of file.exports) {
      if (exp.name === 'default') continue;

      const key = exp.name;
      if (!exportMap.has(key)) {
        exportMap.set(key, []);
      }
      exportMap.get(key)!.push({
        file: file.path,
        line: exp.line,
        ...(exp.signature ? { signature: exp.signature } : {}),
      });
    }
  }

  const accidentalDups: DuplicateGroup[] = [];
  const crossStackMirrors: DuplicateGroup[] = [];

  for (const [name, locations] of exportMap.entries()) {
    // Deduplicate by file
    const uniqueFiles = new Map<string, DuplicateLocation>();
    for (const loc of locations) {
      if (!uniqueFiles.has(loc.file)) {
        uniqueFiles.set(loc.file, loc);
      }
    }

    if (uniqueFiles.size < 2) continue;

    // Determine export type from first occurrence
    const firstFile = inventory.files.find(f => f.path === locations[0].file);
    const exportInfo = firstFile?.exports.find(e => e.name === name);
    const exportType = exportInfo?.type || 'other';

    // Separate barrel from non-barrel locations
    const allLocs = Array.from(uniqueFiles.values());
    const nonBarrelLocs = allLocs.filter(l => !isBarrelFile(l.file));

    // If after removing barrels only 1 or 0 unique files remain → barrel re-export, skip
    if (nonBarrelLocs.length < 2) continue;

    const category = categorize(nonBarrelLocs);

    const group: DuplicateGroup = {
      name,
      type: exportType,
      locations: nonBarrelLocs, // Only report non-barrel locations
      category,
    };

    if (category === 'cross-stack') {
      crossStackMirrors.push(group);
    } else if (category === 'accidental') {
      accidentalDups.push(group);
    }
    // 'polymorphic' → not reported (different functions sharing a name)
  }

  // Sort by number of locations descending
  accidentalDups.sort((a, b) => b.locations.length - a.locations.length);
  crossStackMirrors.sort((a, b) => b.locations.length - a.locations.length);

  return {
    generatedAt: new Date().toISOString(),
    duplicates: accidentalDups,
    totalDuplicateNames: accidentalDups.length,
    crossStackMirrors: crossStackMirrors.length > 0 ? crossStackMirrors : undefined,
  };
}
