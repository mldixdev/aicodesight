import { PatternModule } from './patternTypes';
import {
  TechStackProfile, FolderNode, CodePattern, DataFlow, SharedUtility,
  DesignTokenHint, AntiDuplicationEntry, AntiPatternEntry, DomainGrouping,
} from '../../types';

export interface PatternModuleConfig {
  id: string;
  name: string;
  activationCheck: (stack: TechStackProfile) => boolean;
  folderSuggestions: FolderNode[];
  codePatterns: CodePattern[];
  dataFlows?: DataFlow[];
  sharedUtilities?: SharedUtility[];
  designTokens?: DesignTokenHint[];
  antiDuplicationEntries?: AntiDuplicationEntry[];
  antiPatterns?: AntiPatternEntry[];
  domainGroupings?: DomainGrouping[];
}

export function createPatternModule(config: PatternModuleConfig): PatternModule {
  return {
    id: config.id,
    name: config.name,
    activationCheck: config.activationCheck,
    folderSuggestions: () => config.folderSuggestions,
    codePatterns: () => config.codePatterns,
    dataFlows: () => config.dataFlows ?? [],
    sharedUtilities: () => config.sharedUtilities ?? [],
    designTokens: () => config.designTokens ?? [],
    antiDuplicationEntries: () => config.antiDuplicationEntries ?? [],
    antiPatterns: () => config.antiPatterns ?? [],
    domainGroupings: () => config.domainGroupings ?? [],
  };
}
