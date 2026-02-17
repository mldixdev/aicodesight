/**
 * @intent Pre-compute BGE-small embeddings for capability-index entries during aicodesight update
 * @domain embeddings
 * @depends-on types
 */
import * as path from 'path';
import * as fs from 'fs';
import { CapabilityIndexData } from '../types';
import { createSpinner } from '../reporters/consoleReporter';

export interface EmbeddingEntry {
  name: string;
  file: string;
  description: string;
  embedding: number[]; // 384-dim
}

export interface EmbeddingsCacheData {
  version: '1.0';
  model: 'Xenova/bge-small-en-v1.5';
  dimensions: 384;
  generatedAt: string;
  entries: EmbeddingEntry[];
}

/**
 * Pre-computes embeddings for all capability-index entries with descriptions.
 * Requires @xenova/transformers — returns null if not available.
 * Writes result to `.claude/embeddings-cache.json`.
 */
export async function computeEmbeddingsCache(
  capabilityIndex: CapabilityIndexData,
  claudeDir: string,
): Promise<EmbeddingsCacheData | null> {
  // Filter entries that have enriched descriptions
  const entries = capabilityIndex.entries.filter(
    (e) => e.description !== null && e.description !== '',
  );

  if (entries.length === 0) {
    return null;
  }

  // Dynamic import — graceful if not installed
  let pipeline: any;
  try {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
  } catch {
    return null;
  }

  const spinner = createSpinner('Computing semantic embeddings...');
  spinner.start();

  try {
    const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');

    const embeddingEntries: EmbeddingEntry[] = [];

    for (const entry of entries) {
      const text = `${entry.name} — ${entry.description}`;
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      embeddingEntries.push({
        name: entry.name,
        file: entry.file,
        description: entry.description!,
        embedding: Array.from(output.data) as number[],
      });
    }

    const cacheData: EmbeddingsCacheData = {
      version: '1.0',
      model: 'Xenova/bge-small-en-v1.5',
      dimensions: 384,
      generatedAt: new Date().toISOString(),
      entries: embeddingEntries,
    };

    const cachePath = path.join(claudeDir, 'embeddings-cache.json');
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');

    spinner.succeed(`${embeddingEntries.length} embeddings computed`);
    return cacheData;
  } catch (err: any) {
    spinner.fail(`Error computing embeddings: ${err.message}`);
    return null;
  }
}
