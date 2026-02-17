// === Project Detection ===

export interface ProjectProfile {
  type: 'new' | 'organized' | 'legacy';
  structure: 'monorepo' | 'single-package';
  frameworks: string[];
  language: 'typescript' | 'javascript' | 'csharp' | 'mixed';
  stats: ProjectStats;
}

export interface ProjectStats {
  totalFiles: number;
  criticalFiles: number;
  highFiles: number;
  mediumFiles: number;
  okFiles: number;
  genericFiles: number;
  totalLines: number;
  totalExports: number;
}

// === Inventory ===

export type FileClassification = 'critical' | 'high' | 'medium' | 'ok';

export interface ExportInfo {
  name: string;
  type: 'function' | 'class' | 'type' | 'interface' | 'const' | 'enum' | 'other';
  line: number;
  signature?: string;
}

export interface FileInfo {
  path: string;
  lines: number;
  exports: ExportInfo[];
  classification: FileClassification;
  isGeneric: boolean;
}

export interface InventoryData {
  generatedAt: string;
  files: FileInfo[];
  stats: ProjectStats;
}

// === Duplicates ===

export type DuplicateCategory =
  | 'accidental'    // same code/signature, unintentional location — consolidate
  | 'cross-stack'   // API mirror (backend .cs ↔ frontend .ts) — document as pair
  | 'polymorphic'   // same name, different signatures — not real duplication
  | 'barrel';       // re-export from index.ts — filtered out, not reported

export interface DuplicateLocation {
  file: string;
  line: number;
  signature?: string;
}

export interface DuplicateGroup {
  name: string;
  type: string;
  locations: DuplicateLocation[];
  /** Category assigned by the detector. Absent in legacy data (pre-categorization). */
  category?: DuplicateCategory;
}

export interface DuplicateData {
  generatedAt: string;
  duplicates: DuplicateGroup[];
  totalDuplicateNames: number;
  /** Cross-stack DTO mirrors, separated from duplicates for distinct rendering. */
  crossStackMirrors?: DuplicateGroup[];
}

// === Dependency Map ===

export interface DependencyEntry {
  file: string;
  importedByCount: number;
  importedBy: string[];
}

export interface DependencyData {
  generatedAt: string;
  mostImported: DependencyEntry[];
}

// === Audit ===

export type AuditFocus = 'duplication' | 'size' | 'naming' | 'all';

export interface AuditReport {
  generatedAt: string;
  duplication: DuplicationReport;
  size: SizeReport;
  conventions: ConventionReport;
  progress: ProgressReport | null;  // null if no prior data exists
}

// -- Duplication section --
export interface DuplicationReport {
  duplicates: DuplicateGroup[];
  totalDuplicateNames: number;
  filesWithMostDuplicates: Array<{ file: string; count: number }>;
}

// -- Size section --
export interface OversizedFile {
  file: string;
  lines: number;
  exports: number;
  classification: FileClassification;
  isGeneric: boolean;
}

export interface SizeReport {
  oversizedFiles: OversizedFile[];       // >350 lines
  heavyExporters: OversizedFile[];       // >5 exports
  totalOversized: number;
  totalHeavyExporters: number;
  averageFileSize: number;
}

// -- Conventions section --
export type ConventionSeverity = 'error' | 'warning';

export interface ConventionIssue {
  file: string;
  severity: ConventionSeverity;
  rule: string;
  message: string;
  suggestion?: string;
}

export interface ConventionReport {
  issues: ConventionIssue[];
  namingIssues: number;
  missingBarrels: number;
  totalIssues: number;
  compliancePercent: number;  // % of files meeting conventions
}

// -- Progress section (comparison with previous data) --
export interface ProgressReport {
  previousDate: string;
  newDuplicates: DuplicateGroup[];
  resolvedDuplicates: DuplicateGroup[];
  unchangedDuplicates: DuplicateGroup[];
  grownFiles: FileSizeChange[];
  shrunkFiles: FileSizeChange[];
  newFiles: string[];
  removedFiles: string[];
}

export interface FileSizeChange {
  file: string;
  previousLines: number;
  currentLines: number;
  delta: number;
}

// === Modules ===

export interface DetectedModule {
  path: string;                // relative path (e.g. "src/shared/formatting")
  name: string;                // human-readable name (e.g. "formatting")
  type: 'barrel' | 'csproj' | 'package' | 'directory';
  exports: string[];           // key export names (top 10)
  totalExports: number;
  description?: string;        // auto-generated hint (e.g. ".NET Core Web API project")
}

export interface ModuleMapData {
  modules: DetectedModule[];
}

// === Registry ===

export interface RegistryExport {
  type: ExportInfo['type'];
  signature?: string;
  file: string;
  line: number;
}

export interface RegistryModule {
  type: DetectedModule['type'];
  description?: string;
  exports: Record<string, RegistryExport>;
  dependsOn?: string[];
}

export interface RegistryData {
  version: string;
  generatedAt: string;
  modules: Record<string, RegistryModule>;
  unmapped?: Record<string, RegistryExport>;
}

// === Template Section Flags ===

export type ProjectType = ProjectProfile['type'];
export type SectionVerbosity = 'light' | 'medium' | 'verbose';

export interface TemplateSectionFlags {
  // Prescriptive sections (from newTemplate)
  principles: boolean;
  recommendedStructure: boolean;
  blueprintRef: boolean;
  conventionsFull: boolean;
  cssRules: boolean;
  additionalRules: boolean;

  // Verbosity-variant sections
  antiDuplication: SectionVerbosity;
  variationRule: SectionVerbosity;
  locationRule: SectionVerbosity;

  // Data rendering modes
  duplicates: 'conditional' | 'resolved' | 'confidence-tiers';
  largeFiles: 'conditional' | 'flat' | 'split-by-severity';
  genericFiles: 'conditional' | 'always';
  criticalDeps: 'standard' | 'with-warning';

  // Behavior sections
  oportunistic: 'none' | 'proactive' | 'cautious';
  capabilityIndex: boolean;
  intentProtocol: boolean;
  namingMinimas: boolean;
  autoMaintenance: 'standard' | 'extended';
  postCompact: 'standard' | 'extended';
  referenceFiles: 'with-blueprint' | 'standard-4' | 'full-7';
}

export interface StructuralDuplicationSummary {
  totalPatterns: number;
  totalLocations: number;
  estimatedDuplicateLines: number;
  /** Number of file pairs sharing ≥ significantPairThreshold patterns */
  significantPairCount: number;
  /** Threshold used for "significant" pair classification */
  significantPairThreshold: number;
  filePairs: Array<{
    fileA: string;
    fileB: string;
    sharedPatterns: number;
    exampleLine: { file: string; line: number };
  }>;
  topFiles: Array<{
    file: string;
    patternCount: number;
  }>;
}

export interface ClaudeMdOptions {
  blueprintGenerated?: boolean;
  sectionFlags?: TemplateSectionFlags;
  structuralSummary?: StructuralDuplicationSummary;
  capabilityIndex?: CapabilityIndexData;
}

// === Capability Index (Intent Registry v2) ===

export interface CapabilityEntry {
  name: string;
  type: ExportInfo['type'];
  file: string;
  line: number;
  signature?: string;
  signatureShape: string;
  effects: string[];
  description: string | null;
  domain: string | null;
  action: string | null;
  entity: string | null;
  dependsOn: string[] | null;
  source: 'declared' | 'extracted' | 'enriched';
}

export interface CapabilityIndexData {
  version: '2.0';
  generatedAt: string;
  source: 'static' | 'hybrid';
  entries: CapabilityEntry[];
}

export interface CapabilityIndexSummary {
  totalEntries: number;
  declaredCount: number;
  extractedCount: number;
  enrichedCount: number;
}

export interface AiArchMeta {
  version: 1;
  createdAt: string;
  updatedAt: string;
  initType: ProjectType;
  initFrameworks: string[];
  initStructure: 'monorepo' | 'single-package';
  initLanguage: ProjectProfile['language'];
  stackSelection: StackSelection | null;
  sections: TemplateSectionFlags;
  blueprintGenerated: boolean;
}

// === Command Options ===

export type HooksMode = 'yes' | 'no' | 'warn';

export interface InitOptions {
  type: 'auto' | 'new' | 'legacy';
  hooks: HooksMode;
  dryRun: boolean;
  directory: string;
  blueprint: boolean;
  interactive: boolean;
  embeddings?: boolean;
}

// === Stack Selection (Interactive Prompt) ===

export interface StackSelection {
  projectType: 'fullstack' | 'frontend' | 'backend' | 'library';
  frontend?: {
    framework: string;
    libraries: string[];
  };
  backend?: {
    framework: string;
    libraries: string[];
  };
  database?: {
    engine: string;
    orm?: string;
  };
  monorepo: boolean;
}

export interface AuditOptions {
  focus: AuditFocus;
  format: 'console' | 'md' | 'json';
  output?: string;
  directory: string;
}

export type UpdateTarget = 'claude-md' | 'inventory' | 'duplicates' | 'hooks' | 'registry' | 'memory' | 'blueprint' | 'all';

export interface UpdateOptions {
  directory: string;
  only: UpdateTarget;
  dryRun: boolean;
  embeddings?: boolean;
}

// === Guard System ===

export type GuardSeverity = 'block' | 'warn' | 'info' | 'off';

export interface GuardMessage {
  severity: GuardSeverity;
  text: string;
  suggestion?: string;
  identifier?: string;
}

export interface GuardResult {
  guardName: string;
  passed: boolean;
  messages: GuardMessage[];
}

export interface GuardConfig {
  mode: HooksMode;
  guards: Record<string, {
    severity: GuardSeverity;
    [key: string]: any;
  }>;
  whitelist: string[];
  zones?: Record<string, string[]>;
}

export interface GuardMemoryEntry {
  count: number;
  lastSeen: string;
  files: string[];
}

export interface GuardMemory {
  warnings: Record<string, GuardMemoryEntry>;
  lastUpdated: string;
}

// === Working Memory (Context Persistence) ===

export interface WorkingMemoryDecision {
  what: string;
  why: string;
  timestamp: string;
}

export interface WorkingMemoryFileChange {
  file: string;
  action: string;
  session: string;
  timestamp: string;
}

export interface WorkingMemoryTask {
  description: string;
  plan: string[];
  completedSteps: number[];
  decisions: WorkingMemoryDecision[];
}

export interface WorkingMemoryBashCommand {
  command: string;
  timestamp: string;
}

export interface WorkingMemory {
  version: string;
  lastUpdated: string;
  currentTask: WorkingMemoryTask | null;
  recentChanges: WorkingMemoryFileChange[];
  bashCommands: WorkingMemoryBashCommand[];
  filesRead: string[];
  rejectedApproaches: string[];
  activeModules: string[];
  sessionNotes: string[];
}

// === Generic ===

// === Domain Context ===

export interface DomainField {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencedEntity?: string;
}

export interface DomainRelationship {
  targetEntity: string;
  type: 'one-to-many' | 'many-to-one' | 'many-to-many' | 'belongs-to';
  foreignKey?: string;
}

export interface DomainEntity {
  name: string;
  type: 'catalog' | 'transactional' | 'relation' | 'unknown';
  fields: DomainField[];
  relationships: DomainRelationship[];
  source: 'schema-file' | 'md-file' | 'sql-file' | 'csharp-model' | 'prisma' | 'inferred';
  recordCount?: number;
}

export interface DomainModule {
  name: string;
  description: string;
  entities: string[];
  source: string;
}

export interface DomainContext {
  entities: DomainEntity[];
  modules: DomainModule[];
  dataSourceHints: string[];
}

// === Tech Stack Profile ===

export type LibraryCategory =
  | 'routing' | 'state' | 'data-fetching' | 'ui-components' | 'styling'
  | 'forms' | 'validation' | 'orm' | 'auth' | 'testing' | 'charts'
  | 'export' | 'logging' | 'mapping' | 'other';

export interface StackLibrary {
  name: string;
  version?: string;
  category: LibraryCategory;
}

export interface StackLayer {
  primary: string;
  libraries: StackLibrary[];
  buildTool?: string;
}

export interface TechStackProfile {
  frontend: StackLayer | null;
  backend: StackLayer | null;
  database: StackLayer | null;
  detected: boolean;
}

// === Blueprint ===

export interface FolderNode {
  path: string;
  purpose: string;
  children?: FolderNode[];
  suggestedFiles?: string[];
}

export interface CodePattern {
  name: string;
  context: string;
  stackRequirement: string[];
  example: string;
  antiPattern?: string;
}

export interface DataFlow {
  name: string;
  layers: string[];
  description: string;
}

export interface SharedUtility {
  name: string;
  purpose: string;
  suggestedPath: string;
  stackReason: string;
}

export interface DesignTokenHint {
  category: string;
  suggestion: string;
}

export interface AntiDuplicationEntry {
  need: string;
  solution: string;
  canonicalPath: string;
}

export interface AntiPatternEntry {
  pattern: string;
  reason: string;
  alternative: string;
}

export interface DomainGrouping {
  groupName: string;
  entities: string[];
  sharedResources: string[];
}

export interface BlueprintData {
  generatedAt: string;
  techStack: TechStackProfile;
  domain: DomainContext;
  folderStructure: FolderNode[];
  patterns: CodePattern[];
  dataFlows: DataFlow[];
  sharedUtilities: SharedUtility[];
  designTokens: DesignTokenHint[] | null;
  antiDuplicationMap: AntiDuplicationEntry[];
  antiPatterns: AntiPatternEntry[];
  domainGroupings: DomainGrouping[];
}

export const GENERIC_FILE_NAMES = [
  'utils', 'helpers', 'common', 'shared', 'misc',
  'tools', 'lib', 'functions', 'utilities', 'helper',
  // C# equivalents
  'extensions', 'constants', 'globals', 'basecontroller',
];

export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.cs'];

export const EXCLUDE_DIRS = [
  'node_modules', 'dist', 'build', '.next', 'out',
  'coverage', '.git', '.claude', '__pycache__',
  // .NET
  'bin', 'obj', '.vs', 'Migrations',
];

/**
 * Load per-project exclude dirs from .claude/aicodesight-config.json.
 * User excludes are additive — they extend EXCLUDE_DIRS, never replace.
 */
export function loadExcludeDirs(targetDir: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  const configPath = path.join(targetDir, '.claude', 'aicodesight-config.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (Array.isArray(config.excludeDirs)) {
      return [...new Set([...EXCLUDE_DIRS, ...config.excludeDirs.filter((d: unknown) => typeof d === 'string')])];
    }
  } catch { /* no config or malformed — use defaults */ }
  return EXCLUDE_DIRS;
}
