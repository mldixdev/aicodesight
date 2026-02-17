import {
  TechStackProfile, FolderNode,
  CodePattern, DataFlow, SharedUtility, DesignTokenHint,
  AntiDuplicationEntry, AntiPatternEntry, DomainGrouping,
} from '../../types';

export interface PatternModule {
  id: string;
  name: string;
  activationCheck: (stack: TechStackProfile) => boolean;
  folderSuggestions: () => FolderNode[];
  codePatterns: () => CodePattern[];
  dataFlows: () => DataFlow[];
  sharedUtilities: () => SharedUtility[];
  designTokens?: () => DesignTokenHint[];
  antiDuplicationEntries?: () => AntiDuplicationEntry[];
  antiPatterns?: () => AntiPatternEntry[];
  domainGroupings?: () => DomainGrouping[];
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
