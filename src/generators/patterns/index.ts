import { TechStackProfile } from '../../types';
import { PatternModule, ResolvedPatterns } from './patternTypes';
import { tanstackQueryPattern } from './tanstackQuery.patterns';
import { dotnetMinimalApiPattern } from './dotnetMinimalApi.patterns';
import { shadcnTailwindPattern } from './shadcnTailwind.patterns';

const allPatterns: PatternModule[] = [
  tanstackQueryPattern,
  dotnetMinimalApiPattern,
  shadcnTailwindPattern,
];

export function resolvePatterns(
  stack: TechStackProfile,
): ResolvedPatterns {
  const active = allPatterns.filter(p => p.activationCheck(stack));

  const patterns = active.flatMap(p => p.codePatterns());
  const folders = active.flatMap(p => p.folderSuggestions());
  const flows = active.flatMap(p => p.dataFlows());
  const utilities = dedupeByName(active.flatMap(p => p.sharedUtilities()));
  const tokens = active.flatMap(p => p.designTokens?.() ?? []);
  const antiDuplication = active.flatMap(p => p.antiDuplicationEntries?.() ?? []);
  const antiPatterns = active.flatMap(p => p.antiPatterns?.() ?? []);
  const domainGroupings = active.flatMap(p => p.domainGroupings?.() ?? []);

  return { patterns, folders, flows, utilities, tokens, antiDuplication, antiPatterns, domainGroupings };
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

export { PatternModule, ResolvedPatterns } from './patternTypes';
export { createPatternModule, type PatternModuleConfig } from './createPatternModule';
