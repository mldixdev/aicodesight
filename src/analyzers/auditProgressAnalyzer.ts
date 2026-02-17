import * as path from 'path';
import * as fs from 'fs';
import {
  InventoryData, DuplicateData, ProgressReport, FileSizeChange,
} from '../types';

export function loadPreviousData(claudeDir: string): { inventory: InventoryData | null; duplicates: DuplicateData | null } {
  let inventory: InventoryData | null = null;
  let duplicates: DuplicateData | null = null;

  const inventoryPath = path.join(claudeDir, 'inventory.json');
  const duplicatesPath = path.join(claudeDir, 'duplicates.json');

  if (fs.existsSync(inventoryPath)) {
    try { inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8')); } catch { /* ignore */ }
  }
  if (fs.existsSync(duplicatesPath)) {
    try { duplicates = JSON.parse(fs.readFileSync(duplicatesPath, 'utf-8')); } catch { /* ignore */ }
  }

  return { inventory, duplicates };
}

export function analyzeProgress(
  currentInventory: InventoryData,
  currentDuplicates: DuplicateData,
  prevInventory: InventoryData,
  prevDuplicates: DuplicateData,
): ProgressReport {
  const prevNames = new Set(prevDuplicates.duplicates.map(d => d.name));
  const currNames = new Set(currentDuplicates.duplicates.map(d => d.name));

  const newDuplicates = currentDuplicates.duplicates.filter(d => !prevNames.has(d.name));
  const resolvedDuplicates = prevDuplicates.duplicates.filter(d => !currNames.has(d.name));
  const unchangedDuplicates = currentDuplicates.duplicates.filter(d => prevNames.has(d.name));

  const prevMap = new Map(prevInventory.files.map(f => [f.path, f]));
  const currMap = new Map(currentInventory.files.map(f => [f.path, f]));

  const grownFiles: FileSizeChange[] = [];
  const shrunkFiles: FileSizeChange[] = [];
  const newFiles: string[] = [];
  const removedFiles: string[] = [];

  for (const [filePath, currFile] of currMap) {
    const prevFile = prevMap.get(filePath);
    if (!prevFile) {
      newFiles.push(filePath);
    } else {
      const delta = currFile.lines - prevFile.lines;
      if (delta > 10) {
        grownFiles.push({ file: filePath, previousLines: prevFile.lines, currentLines: currFile.lines, delta });
      } else if (delta < -10) {
        shrunkFiles.push({ file: filePath, previousLines: prevFile.lines, currentLines: currFile.lines, delta });
      }
    }
  }

  for (const filePath of prevMap.keys()) {
    if (!currMap.has(filePath)) removedFiles.push(filePath);
  }

  grownFiles.sort((a, b) => b.delta - a.delta);
  shrunkFiles.sort((a, b) => a.delta - b.delta);

  return {
    previousDate: prevInventory.generatedAt,
    newDuplicates,
    resolvedDuplicates,
    unchangedDuplicates,
    grownFiles,
    shrunkFiles,
    newFiles,
    removedFiles,
  };
}
