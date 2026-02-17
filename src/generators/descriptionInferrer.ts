import * as path from 'path';
import { FileInfo, InventoryData } from '../types';

/**
 * Infer semantic descriptions for files and directories, and group
 * files adaptively so the "Current project structure" section
 * reflects the REAL state without losing information.
 *
 * Two main problems this solves:
 *
 * 1. **Grouping too coarse**: A fixed 2-level grouping (e.g. "Frontend/src/")
 *    can swallow 100+ files into a single line. The fix: when a group exceeds
 *    MAX_GROUP_SIZE, it's automatically expanded one level deeper.
 *
 * 2. **Descriptions not semantic**: Listing export names or saying "Functions"
 *    doesn't tell the AI what a directory *does*. The fix: map known directory
 *    and file names to purpose-based descriptions (e.g. "Services", "UI Components").
 *
 * The goal is output like the spec:
 *   - src/components/ — UI Components (45 files)
 *   - src/services/ — Services (12 files)
 *   - src/auth.ts — Authentication and authorization
 */

const MAX_GROUP_SIZE = 10;

// Directory name → semantic description (case-insensitive matching)
const DIR_DESCRIPTIONS: Record<string, string> = {
  // JS/TS (lowercase)
  services: 'Services',
  service: 'Services',
  components: 'UI Components',
  component: 'UI Components',
  controllers: 'Controllers',
  controller: 'Controllers',
  models: 'Data models',
  model: 'Data models',
  entities: 'Entities',
  entity: 'Entities',
  hooks: 'React hooks',
  hook: 'React hooks',
  utils: 'General utilities',
  utilities: 'General utilities',
  helpers: 'Helpers',
  helper: 'Helpers',
  middleware: 'Middleware',
  middlewares: 'Middleware',
  routes: 'Routes/endpoints',
  route: 'Routes/endpoints',
  stores: 'State/stores',
  store: 'State/stores',
  state: 'State',
  types: 'Types and interfaces',
  interfaces: 'Interfaces',
  config: 'Configuration',
  configuration: 'Configuration',
  configs: 'Configuration',
  pages: 'Pages',
  page: 'Pages',
  views: 'Views',
  view: 'Views',
  api: 'API endpoints',
  apis: 'API endpoints',
  lib: 'Internal library',
  shared: 'Shared code',
  common: 'Shared code',
  core: 'Application core',
  validators: 'Validations',
  validation: 'Validations',
  guards: 'Authorization guards',
  pipes: 'Transformation pipes',
  interceptors: 'Interceptors',
  filters: 'Filters',
  decorators: 'Decorators',
  schemas: 'Data schemas',
  schema: 'Data schemas',
  migrations: 'DB migrations',
  seeds: 'DB seeds',
  fixtures: 'Test fixtures',
  tests: 'Tests',
  test: 'Tests',
  __tests__: 'Tests',
  specs: 'Tests',
  spec: 'Tests',
  styles: 'CSS styles',
  css: 'CSS styles',
  assets: 'Static assets',
  images: 'Images',
  icons: 'Icons',
  layouts: 'Layouts',
  layout: 'Layouts',
  templates: 'Templates',
  template: 'Templates',
  features: 'Feature modules',
  feature: 'Feature modules',
  modules: 'Modules',
  module: 'Modules',
  providers: 'Providers',
  provider: 'Providers',
  resolvers: 'GraphQL resolvers',
  resolver: 'GraphQL resolvers',
  subscribers: 'Subscribers/listeners',
  listeners: 'Event listeners',
  events: 'Domain events',
  commands: 'Commands (CQRS)',
  queries: 'Queries (CQRS)',
  handlers: 'Handlers',
  dtos: 'DTOs',
  dto: 'DTOs',
  mappers: 'Mappers/transformations',
  adapters: 'Adapters',
  ports: 'Ports (hexagonal)',
  infrastructure: 'Infrastructure',
  domain: 'Domain',
  application: 'Application layer',
  presentation: 'Presentation layer',
  persistence: 'Persistence',
  repositories: 'Data repositories',
  repository: 'Data repositories',
  // .NET (PascalCase — matched via lowercase)
  configurations: 'EF Configuration',
  extensions: 'Extension methods',
  enums: 'Enumerations',
  exceptions: 'Custom exceptions',
  constants: 'Constants',
  contexts: 'DbContexts',
  hubs: 'SignalR hubs',
  workers: 'Background workers',
  jobs: 'Scheduled jobs/tasks',
};

// .NET project name suffix → semantic description (e.g. "MyApp.Data" → "Data layer")
const DOTNET_PROJECT_SUFFIXES: Record<string, string> = {
  data: 'Data layer',
  dal: 'Data access layer',
  core: 'Business logic',
  business: 'Business logic',
  domain: 'Domain',
  api: 'API endpoints',
  web: 'Web layer',
  services: 'Services',
  service: 'Services',
  infrastructure: 'Infrastructure',
  shared: 'Shared code',
  common: 'Shared code',
  tests: 'Tests',
  test: 'Tests',
  models: 'Data models',
  entities: 'Entities',
  dtos: 'DTOs',
  contracts: 'Contracts/interfaces',
  client: 'HTTP client',
  workers: 'Background workers',
  jobs: 'Scheduled jobs/tasks',
  messaging: 'Messaging',
  notifications: 'Notifications',
  auth: 'Authentication',
  identity: 'Identity/authentication',
};

// File basename → semantic description (case-insensitive, without extension)
const FILE_DESCRIPTIONS: Record<string, string> = {
  auth: 'Authentication and authorization',
  authentication: 'Authentication',
  authorization: 'Authorization',
  database: 'Database / queries',
  db: 'Database',
  validation: 'Data validations',
  validators: 'Validators',
  config: 'Configuration',
  configuration: 'Configuration',
  constants: 'Constants',
  types: 'Types and interfaces',
  interfaces: 'Interfaces',
  routes: 'Route definitions',
  router: 'Main router',
  middleware: 'Middleware',
  logger: 'Logging',
  errors: 'Error handling',
  exceptions: 'Custom exceptions',
  index: 'Barrel/re-exports',
  main: 'Entry point',
  app: 'Main application',
  server: 'HTTP server',
  client: 'HTTP client',
  api: 'API endpoints',
  store: 'Global state',
  state: 'State',
  context: 'React context',
  theme: 'Theme/styles',
  i18n: 'Internationalization',
  locale: 'Localization',
  seed: 'Data seed',
  migration: 'Migration',
  schema: 'Data schema',
  // .NET
  startup: 'Startup configuration',
  program: 'Program entry point',
  appsettings: 'Application configuration',
};

/**
 * Infer a semantic description for a single file.
 * Returns the description or null if no pattern matches.
 */
export function inferFileDescription(file: FileInfo): string {
  const ext = path.extname(file.path);
  const baseName = path.basename(file.path, ext).toLowerCase();

  // Direct name match
  if (FILE_DESCRIPTIONS[baseName]) {
    return FILE_DESCRIPTIONS[baseName];
  }

  // Check if any known key is a substring of the filename
  // e.g., "authMiddleware" matches "auth" → but we want the more specific match
  // Sort by length descending to prefer longer (more specific) matches
  const sortedKeys = Object.keys(FILE_DESCRIPTIONS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (key.length >= 4 && baseName.includes(key)) {
      return FILE_DESCRIPTIONS[key];
    }
  }

  // Infer from export types
  if (file.exports.length > 0) {
    const types = file.exports.map(e => e.type);
    const allSameType = types.every(t => t === types[0]);

    if (allSameType && file.exports.length > 1) {
      const typeLabel = getTypeLabel(types[0]);
      if (typeLabel) {
        const names = file.exports.map(e => e.name).join(', ');
        return `${typeLabel}: ${names}`;
      }
    }

    // Default: list all export names
    return file.exports.map(e => e.name).join(', ');
  }

  return 'no exports';
}

/**
 * Infer a semantic description for a directory based on its name
 * and the files it contains. Returns the description or null if
 * no pattern matches (in which case the caller should list exports).
 */
export function inferDirectoryDescription(
  dirName: string,
  files: FileInfo[],
): string {
  // Extract the last directory segment for matching
  const segments = dirName.replace(/\\/g, '/').split('/');
  const lastSegment = segments[segments.length - 1].toLowerCase();

  // Direct name match
  if (DIR_DESCRIPTIONS[lastSegment]) {
    return DIR_DESCRIPTIONS[lastSegment];
  }

  // .NET project suffix matching (e.g. "PortalIndicadores.Data" → "Data" → "Data layer")
  if (lastSegment.includes('.')) {
    const dotParts = lastSegment.split('.');
    const lastDotPart = dotParts[dotParts.length - 1];
    if (DOTNET_PROJECT_SUFFIXES[lastDotPart]) {
      return DOTNET_PROJECT_SUFFIXES[lastDotPart];
    }
  }

  // Check parent+child combo for 2-level dirs like "src/services"
  if (segments.length >= 2) {
    const secondSegment = segments[segments.length - 1].toLowerCase();
    if (DIR_DESCRIPTIONS[secondSegment]) {
      return DIR_DESCRIPTIONS[secondSegment];
    }
  }

  // Infer from file patterns inside the directory
  const fileNames = files.map(f => path.basename(f.path).toLowerCase());

  // Check for common suffixes: *.controller.ts, *.service.ts, etc.
  const suffixCounts = new Map<string, number>();
  for (const name of fileNames) {
    const parts = name.split('.');
    if (parts.length >= 3) {
      // e.g., user.controller.ts → "controller"
      const suffix = parts[parts.length - 2];
      suffixCounts.set(suffix, (suffixCounts.get(suffix) || 0) + 1);
    }
  }

  // If a majority share the same suffix, use it
  if (suffixCounts.size > 0) {
    const [topSuffix, count] = [...suffixCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (count >= files.length * 0.5 && DIR_DESCRIPTIONS[topSuffix]) {
      return DIR_DESCRIPTIONS[topSuffix];
    }
    if (count >= files.length * 0.5 && DIR_DESCRIPTIONS[topSuffix + 's']) {
      return DIR_DESCRIPTIONS[topSuffix + 's'];
    }
  }

  // No inference possible — return empty to signal "list exports instead"
  // NOTE: We intentionally do NOT fall back to export-type labels like "Functions"
  // or "Classes" because those are too generic to be useful for directories.
  // The caller should list actual export names when no semantic description is available.
  return '';
}

/**
 * Collapse duplicated path segments for display.
 * e.g. "Backend/PortalIndicadores.Data/PortalIndicadores.Data" → "Backend/PortalIndicadores.Data"
 */
export function collapseGroupPath(groupPath: string): string {
  const segments = groupPath.replace(/\\/g, '/').split('/');
  if (segments.length >= 2) {
    const last = segments[segments.length - 1].toLowerCase();
    const prev = segments[segments.length - 2].toLowerCase();
    if (last === prev) {
      return segments.slice(0, -1).join('/');
    }
  }
  return groupPath;
}

function getTypeLabel(type: string): string | null {
  switch (type) {
    case 'function': return 'Functions';
    case 'class': return 'Classes';
    case 'interface': return 'Interfaces';
    case 'type': return 'Types';
    case 'enum': return 'Enumerations';
    case 'const': return 'Constants';
    default: return null;
  }
}

/**
 * Directory group for the project structure section.
 */
export interface DirectoryGroup {
  path: string;          // directory path ('' for root files)
  files: FileInfo[];
  totalLines: number;
}

/**
 * Group inventory files into adaptive directory groups.
 *
 * Strategy:
 * 1. Start by grouping at depth 2 (e.g. "Frontend/src/", "Backend/API/")
 * 2. If a group has > MAX_GROUP_SIZE files, expand it one level deeper
 *    (e.g. "Frontend/src/" → "Frontend/src/components/", "Frontend/src/services/", etc.)
 * 3. Root files (no directory) are returned separately.
 *
 * This ensures no group is so large that it hides the internal structure,
 * while keeping small directories compact.
 */
export function buildAdaptiveGroups(inventory: InventoryData): {
  rootFiles: FileInfo[];
  groups: DirectoryGroup[];
} {
  const rootFiles: FileInfo[] = [];

  // Step 1: initial grouping at depth 2
  const initialGroups = new Map<string, FileInfo[]>();

  for (const file of inventory.files) {
    const parts = file.path.replace(/\\/g, '/').split('/');
    if (parts.length <= 1) {
      rootFiles.push(file);
    } else {
      const key = parts.length > 2
        ? parts.slice(0, 2).join('/')
        : parts.slice(0, -1).join('/');
      if (!initialGroups.has(key)) initialGroups.set(key, []);
      initialGroups.get(key)!.push(file);
    }
  }

  // Step 2: expand large groups one level deeper
  const finalGroups = new Map<string, FileInfo[]>();

  for (const [key, files] of initialGroups) {
    if (files.length <= MAX_GROUP_SIZE) {
      finalGroups.set(key, files);
    } else {
      // Split into sub-groups at one more level of depth
      const depth = key.split('/').length;
      const subGroups = new Map<string, FileInfo[]>();

      for (const file of files) {
        const parts = file.path.replace(/\\/g, '/').split('/');
        const subKey = parts.length > depth + 1
          ? parts.slice(0, depth + 1).join('/')
          : key; // file sits directly in this directory, keep in parent group
        if (!subGroups.has(subKey)) subGroups.set(subKey, []);
        subGroups.get(subKey)!.push(file);
      }

      for (const [subKey, subFiles] of subGroups) {
        finalGroups.set(subKey, subFiles);
      }
    }
  }

  // Step 3: convert to DirectoryGroup array, sorted by total lines descending
  const groups: DirectoryGroup[] = [];
  for (const [groupPath, files] of finalGroups) {
    groups.push({
      path: groupPath,
      files,
      totalLines: files.reduce((sum, f) => sum + f.lines, 0),
    });
  }
  groups.sort((a, b) => b.totalLines - a.totalLines);

  return { rootFiles, groups };
}
