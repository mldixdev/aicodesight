import { InventoryData, SizeReport, OversizedFile } from '../types';

const LINE_THRESHOLD = 350;
const EXPORT_THRESHOLD = 5;

export function analyzeSize(inventory: InventoryData): SizeReport {
  const oversizedFiles: OversizedFile[] = inventory.files
    .filter(f => f.lines > LINE_THRESHOLD)
    .map(f => ({
      file: f.path,
      lines: f.lines,
      exports: f.exports.length,
      classification: f.classification,
      isGeneric: f.isGeneric,
    }))
    .sort((a, b) => b.lines - a.lines);

  const heavyExporters: OversizedFile[] = inventory.files
    .filter(f => {
      if (f.path.endsWith('/index.ts') || f.path.endsWith('/index.js')) return false;
      return f.exports.length > EXPORT_THRESHOLD;
    })
    .map(f => ({
      file: f.path,
      lines: f.lines,
      exports: f.exports.length,
      classification: f.classification,
      isGeneric: f.isGeneric,
    }))
    .sort((a, b) => b.exports - a.exports);

  const totalLines = inventory.files.reduce((sum, f) => sum + f.lines, 0);
  const averageFileSize = inventory.files.length > 0
    ? Math.round(totalLines / inventory.files.length)
    : 0;

  return {
    oversizedFiles,
    heavyExporters,
    totalOversized: oversizedFiles.length,
    totalHeavyExporters: heavyExporters.length,
    averageFileSize,
  };
}
