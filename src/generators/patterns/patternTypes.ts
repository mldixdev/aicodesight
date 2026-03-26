import {
  TechStackProfile, FolderNode,
  CodePattern, DataFlow, SharedUtility, DesignTokenHint,
  AntiDuplicationEntry, AntiPatternEntry, DomainGrouping,
} from '../../types';

export interface PatternModule {
  id: string;
  name: string;
  activationCheck: (stack: TechStackProfile) => boolean;
  folderSuggestions: (stack: TechStackProfile) => FolderNode[];
  codePatterns: (stack: TechStackProfile) => CodePattern[];
  dataFlows: (stack: TechStackProfile) => DataFlow[];
  sharedUtilities: (stack: TechStackProfile) => SharedUtility[];
  designTokens?: (stack: TechStackProfile) => DesignTokenHint[];
  antiDuplicationEntries?: (stack: TechStackProfile) => AntiDuplicationEntry[];
  antiPatterns?: (stack: TechStackProfile) => AntiPatternEntry[];
  domainGroupings?: (stack: TechStackProfile) => DomainGrouping[];
}

export interface ResolvedPatterns {
  patterns: CodePattern[];
  folders: FolderNode[];
  flows: DataFlow[];
  utilities: SharedUtility[];
  tokens: DesignTokenHint[];
  antiDuplication: AntiDuplicationEntry[];
  antiPatterns: AntiPatternEntry[];
  domainGroupings: DomainGrouping[];
}
