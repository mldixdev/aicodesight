import { InventoryData, DuplicationReport } from '../types';
import { detectDuplicates } from './duplicateDetector';

export function analyzeDuplication(inventory: InventoryData): DuplicationReport {
  const duplicateData = detectDuplicates(inventory);

  // Count duplicates per file
  const fileDupCount = new Map<string, number>();
  for (const dup of duplicateData.duplicates) {
    for (const loc of dup.locations) {
      fileDupCount.set(loc.file, (fileDupCount.get(loc.file) || 0) + 1);
    }
  }

  const filesWithMostDuplicates = Array.from(fileDupCount.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    duplicates: duplicateData.duplicates,
    totalDuplicateNames: duplicateData.totalDuplicateNames,
    filesWithMostDuplicates,
  };
}
