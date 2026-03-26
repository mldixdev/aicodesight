import { PatternModule } from './patternTypes';
import {
  TechStackProfile, FolderNode, CodePattern, DataFlow, SharedUtility,
  DesignTokenHint, AntiDuplicationEntry, AntiPatternEntry, DomainGrouping,
} from '../../types';

type ArrayOrFn<T> = T[] | ((stack: TechStackProfile) => T[]);

function normalize<T>(input: ArrayOrFn<T> | undefined, fallback: T[] = []): (stack: TechStackProfile) => T[] {
  if (!input) return () => fallback;
  if (typeof input === 'function') return input;
  return () => input;
}

export interface PatternModuleConfig {
  id: string;
  name: string;
  activationCheck: (stack: TechStackProfile) => boolean;
  folderSuggestions: ArrayOrFn<FolderNode>;
  codePatterns: ArrayOrFn<CodePattern>;
  dataFlows?: ArrayOrFn<DataFlow>;
  sharedUtilities?: ArrayOrFn<SharedUtility>;
  designTokens?: ArrayOrFn<DesignTokenHint>;
  antiDuplicationEntries?: ArrayOrFn<AntiDuplicationEntry>;
  antiPatterns?: ArrayOrFn<AntiPatternEntry>;
  domainGroupings?: ArrayOrFn<DomainGrouping>;
}

export function createPatternModule(config: PatternModuleConfig): PatternModule {
  return {
    id: config.id,
    name: config.name,
    activationCheck: config.activationCheck,
    folderSuggestions: normalize(config.folderSuggestions),
    codePatterns: normalize(config.codePatterns),
    dataFlows: normalize(config.dataFlows),
    sharedUtilities: normalize(config.sharedUtilities),
    designTokens: normalize(config.designTokens),
    antiDuplicationEntries: normalize(config.antiDuplicationEntries),
    antiPatterns: normalize(config.antiPatterns),
    domainGroupings: normalize(config.domainGroupings),
  };
}
