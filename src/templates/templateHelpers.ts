import { ProjectProfile, InventoryData, ModuleMapData, TemplateSectionFlags, ProjectType, CapabilityIndexData } from '../types';
import { ResolvedDuplicate } from '../analyzers/canonicalResolver';
import { inferFileDescription, inferDirectoryDescription, buildAdaptiveGroups, collapseGroupPath } from '../generators/descriptionInferrer';

// ── Naming Conventions ──────────────────────────────────────────────

/**
 * Builds naming conventions section.
 * @param wrapper 'standalone' wraps in <naming_conventions>, 'inline' uses ### Naming header
 */
export function buildNamingConventions(
  profile: ProjectProfile,
  wrapper: 'standalone' | 'inline',
): string {
  const hasReact = profile.frameworks.some(f => ['React', 'Next.js'].includes(f));
  const hasJsBackend = profile.frameworks.some(f => ['Express', 'Fastify', 'NestJS'].includes(f));
  const hasDB = profile.frameworks.some(f => ['Prisma', 'TypeORM'].includes(f));
  const hasDotNet = profile.frameworks.includes('.NET');
  const hasDotNetApi = profile.frameworks.includes('ASP.NET Core');
  const hasDotNetDb = profile.frameworks.includes('EF Core');
  const hasFluentValidation = profile.frameworks.includes('FluentValidation');
  const hasFrontend = hasReact || profile.frameworks.some(f => ['Vue', 'Angular', 'Svelte'].includes(f));
  const isMixed = hasDotNet && hasFrontend;

  let lines: string;

  if (wrapper === 'inline') {
    // Used inside <conventions> block (newTemplate style)
    lines = `### Naming`;

    if (hasDotNet) {
      if (isMixed) lines += `\n\n#### Backend (.NET)`;
      lines += `
- All public files and types: PascalCase.cs (e.g., UserService.cs, OrderValidator.cs)
- Interfaces: IPrefix.cs (e.g., IUserRepository.cs, IOrderService.cs)
- DTOs: NameDto.cs (e.g., CreateUserDto.cs, OrderResponseDto.cs)
- Directories: PascalCase (Features/, Shared/, Middleware/)
- NEVER: Helpers.cs, Utils.cs, Extensions.cs as catch-all files`;

      if (hasDotNetApi) {
        lines += `
- Endpoints: DomainEndpoints.cs (e.g., UserEndpoints.cs)
- Services: DomainService.cs (e.g., UserService.cs)
- Repositories: DomainRepository.cs (e.g., UserRepository.cs)`;
      }

      if (hasDotNetDb) {
        lines += `
- Entities: PascalCase.cs in the Feature (e.g., User.cs)
- Configurations: NameConfiguration.cs (e.g., UserConfiguration.cs)`;
      }

      if (hasFluentValidation) {
        lines += `
- Validators: NameValidator.cs (e.g., CreateUserValidator.cs)`;
      }
    }

    if (hasFrontend || hasJsBackend || (!hasDotNet && !hasFrontend && !hasJsBackend)) {
      if (isMixed) lines += `\n\n#### Frontend (TypeScript)`;

      lines += `
- Functions/utilities: verbNoun.ts (e.g., formatCurrency.ts, validateEmail.ts)
- Types: domain.types.ts (e.g., user.types.ts)
- NEVER: utils.ts, helpers.ts, misc.ts, common.ts`;

      if (hasJsBackend) {
        lines += `
- Services: verbNoun.service.ts (e.g., createUser.service.ts)
- Controllers: domain.controller.ts (e.g., user.controller.ts)
- Routes: domain.routes.ts (e.g., user.routes.ts)
- Validations: domain.validation.ts (e.g., user.validation.ts)
- Middleware: nameMiddleware.ts (e.g., authMiddleware.ts)`;
      }

      if (hasDB) {
        lines += `
- Queries: domain.queries.ts (e.g., user.queries.ts)`;
      }

      if (hasReact) {
        lines += `
- Components: PascalCase.tsx (e.g., UserCard.tsx)
- Pages: NamePage.tsx (e.g., LoginPage.tsx)
- Hooks: useName.ts (e.g., useAuth.ts)
- Stores: domain.store.ts (e.g., auth.store.ts)`;
      }

      if (!hasJsBackend && !hasReact && !hasDotNet) {
        lines += `

### If the project has a Backend
- Services: verbNoun.service.ts (e.g., createUser.service.ts)
- Controllers: domain.controller.ts (e.g., user.controller.ts)
- Routes: domain.routes.ts (e.g., user.routes.ts)
- Validations: domain.validation.ts (e.g., user.validation.ts)
- Middleware: nameMiddleware.ts (e.g., authMiddleware.ts)

### If the project has a Frontend
- Components: PascalCase.tsx (e.g., UserCard.tsx)
- Pages: NamePage.tsx (e.g., LoginPage.tsx)
- Hooks: useName.ts (e.g., useAuth.ts)
- Stores: domain.store.ts (e.g., auth.store.ts)`;
      }
    }

    return lines;
  }

  // wrapper === 'standalone' → <naming_conventions> XML wrapper
  lines = `<naming_conventions>
When creating NEW files:`;

  if (hasDotNet) {
    lines += `

### ${hasFrontend ? 'Backend (.NET)' : 'General (.NET)'}
- All public files and types: PascalCase.cs (e.g., UserService.cs, OrderValidator.cs)
- Interfaces: IPrefix.cs (e.g., IUserRepository.cs, IOrderService.cs)
- DTOs: NameDto.cs (e.g., CreateUserDto.cs, OrderResponseDto.cs)
- Directories: PascalCase (Features/, Shared/, Middleware/)
- NEVER: Helpers.cs, Utils.cs, Extensions.cs as catch-all files`;

    if (hasDotNetApi) {
      lines += `
- Endpoints: DomainEndpoints.cs (e.g., UserEndpoints.cs)
- Services: DomainService.cs (e.g., UserService.cs, PaymentService.cs)
- Repositories: DomainRepository.cs (e.g., UserRepository.cs)
- Middleware: NameMiddleware.cs (e.g., ExceptionHandlingMiddleware.cs)`;
    }

    if (hasDotNetDb) {
      lines += `

### Data (EF Core)
- Entities: PascalCase.cs in the Feature (e.g., User.cs, Order.cs)
- Configurations: NameConfiguration.cs (e.g., UserConfiguration.cs)
- Migrations: managed by EF CLI, don't create manually`;
    }

    if (hasFluentValidation) {
      lines += `
- Validators: NameValidator.cs (e.g., CreateUserValidator.cs)`;
    }
  }

  if (hasFrontend || hasJsBackend || !hasDotNet) {
    lines += `

### ${hasDotNet ? 'Frontend (TypeScript)' : 'General'}
- Functions/utilities: verbNoun.ts (e.g., formatCurrency.ts, validateEmail.ts)
- Types: domain.types.ts (e.g., user.types.ts)
- NEVER: utils.ts, helpers.ts, misc.ts, common.ts`;

    if (hasJsBackend) {
      lines += `

### Backend
- Services: verbNoun.service.ts (e.g., createUser.service.ts)
- Controllers: domain.controller.ts (e.g., user.controller.ts)
- Routes: domain.routes.ts (e.g., user.routes.ts)
- Validations: domain.validation.ts (e.g., user.validation.ts)
- Middleware: nameMiddleware.ts (e.g., authMiddleware.ts)`;
    }

    if (hasDB) {
      lines += `
- Queries: domain.queries.ts (e.g., user.queries.ts)`;
    }

    if (hasReact) {
      lines += `

### Frontend
- Components: PascalCase.tsx (e.g., UserCard.tsx)
- Pages: NamePage.tsx (e.g., LoginPage.tsx)
- Hooks: useName.ts (e.g., useAuth.ts)
- Stores: domain.store.ts (e.g., auth.store.ts)`;
    }

    if (!hasJsBackend && !hasReact && !hasDotNet) {
      lines += `
- Components: PascalCase.tsx (e.g., UserCard.tsx)
- Hooks: useName.ts (e.g., useAuth.ts)
- Services: domain.service.ts (e.g., payment.service.ts)`;
    }
  }

  lines += `
</naming_conventions>`;

  return lines;
}

// ── Recommended Structure (prescriptive, new projects) ──────────────

export function buildRecommendedStructure(profile: ProjectProfile): string {
  const hasDotNet = profile.frameworks.includes('.NET');

  if (profile.structure === 'monorepo') {
    const backendStructure = hasDotNet
      ? `Backend/               → .NET API (independent compilation with .csproj)
    Features/            → Vertical slices by domain (Users/, Payments/, Auth/)
    Shared/              → Reusable across 2+ backend features
      Database/          → AppDbContext, EF Core extensions
      Http/              → PagedResult<T>, ErrorResponse, middleware
      Auth/              → JWT, claims, auth middleware
    Middleware/           → Global HTTP middleware
    Program.cs           → Configuration and startup`
      : `backend/               → Backend API (independent compilation)
    src/
      features/          → Business domains (auth/, users/, payments/)
      shared/            → Reusable across 2+ backend features
        http/            → Response helpers, error handler, async wrapper
        database/        → Connection, query builder, pagination
        auth/            → Token service, hashing
      middleware/         → HTTP middleware
      config/            → Centralized configuration
      routes/            → Route definitions`;

    const barrelNote = hasDotNet
      ? `In frontend: each folder MUST have an index.ts (barrel) that exports public members.
In backend .NET: namespaces and using statements serve as barrels — don't create index files.`
      : `Each folder MUST have an index.ts (barrel) that exports public members.`;

    return `<recommended_structure>
Monorepo structure with independent packages:

${backendStructure}
  frontend/              → Frontend application (independent compilation)
    src/
      features/          → Features/pages by domain (auth/, users/, payments/)
      shared/            → Reusable across 2+ frontend features
        ui/              → Reusable components (Button, Modal, Form)
        hooks/           → Shared hooks (useDebounce, usePagination)
        formatting/      → Formatting utilities (formatCurrency, formatDate)
        styles/          → Design tokens, mixins, animations
        http/            → HTTP client, interceptors
      config/            → Centralized configuration
  common/                → Shared between frontend AND backend
    src/
      types/             → Shared DTOs and types
      validation/        → Shared validations (reusable Zod schemas)
      constants/         → Shared constants

Each package compiles independently.
${barrelNote}
Each feature contains EVERYTHING it needs: types, services, components, validations.
</recommended_structure>`;
  }

  const barrelNote = hasDotNet
    ? `In TypeScript code: each folder MUST have an index.ts (barrel) that exports public members.
In .NET code: namespaces and using statements serve as barrels.`
    : `Each folder MUST have an index.ts (barrel) that exports public members.`;

  return `<recommended_structure>
Recommended structure for the project:

src/
  features/              → Code organized by business domain
    auth/                → Everything auth-related together
    users/               → Everything user-related together
    payments/            → Everything payment-related together
  shared/                → Reusable across 2+ features
    ui/                  → Reusable components
    hooks/               → Shared hooks
    formatting/          → Formatting utilities
    styles/              → Design tokens, mixins, animations
    http/                → HTTP client, interceptors
  config/                → Centralized configuration
  types/                 → Global project types

${barrelNote}
Each feature contains EVERYTHING it needs: types, services, components, validations.
Don't move anything to shared/ preemptively — only when 2+ features need it.
</recommended_structure>`;
}

// ── Project Structure ───────────────────────────────────────────────

export interface BuildProjectStructureOptions {
  showLineCount: boolean;
  flagGenerics: boolean;
}

export function buildProjectStructure(
  inventory: InventoryData,
  opts: BuildProjectStructureOptions,
): string {
  if (inventory.files.length === 0) return 'Project has no detected source files.';

  const { rootFiles, groups } = buildAdaptiveGroups(inventory);
  const lines: string[] = [];

  for (const file of rootFiles) {
    const desc = inferFileDescription(file);
    const lineCount = opts.showLineCount ? ` (${file.lines} lines)` : '';
    const flag = opts.flagGenerics && file.isGeneric ? ' ⚠️ generic' : '';
    lines.push(`- ${file.path} — ${desc}${lineCount}${flag}`);
  }

  for (const group of groups) {
    if (group.files.length <= 2) {
      for (const file of group.files) {
        const desc = inferFileDescription(file);
        const lineCount = opts.showLineCount ? ` (${file.lines} lines)` : '';
        const flag = opts.flagGenerics && file.isGeneric ? ' ⚠️ generic' : '';
        lines.push(`- ${file.path} — ${desc}${lineCount}${flag}`);
      }
    } else {
      const dp = collapseGroupPath(group.path);
      const semanticDesc = inferDirectoryDescription(group.path, group.files);
      const genericCount = opts.flagGenerics ? group.files.filter(f => f.isGeneric).length : 0;
      const genericNote = genericCount > 0 ? ` (${genericCount} generic)` : '';
      const lineCountSuffix = opts.showLineCount ? `, ${group.totalLines} lines` : '';

      if (semanticDesc) {
        lines.push(`- ${dp}/ — ${semanticDesc} (${group.files.length} files${lineCountSuffix})${genericNote}`);
      } else {
        const allExports = group.files.flatMap(f => f.exports.map(e => e.name));
        const top = allExports.slice(0, 10);
        const more = allExports.length > 10 ? `, ... (+${allExports.length - 10})` : '';
        const exportSuffix = top.length > 0 ? `: ${top.join(', ')}${more}` : '';
        lines.push(`- ${dp}/ — ${group.files.length} files${lineCountSuffix}${genericNote}${exportSuffix}`);
      }
    }
  }

  return lines.join('\n');
}

// ── Signature Lookup ────────────────────────────────────────────────

export function buildSignatureLookup(
  modules: ModuleMapData,
  inventory: InventoryData,
): Map<string, Map<string, string>> {
  const lookup = new Map<string, Map<string, string>>();

  for (const mod of modules.modules) {
    const modPath = mod.path.replace(/\\/g, '/');
    const sigs = new Map<string, string>();

    for (const file of inventory.files) {
      const filePath = file.path.replace(/\\/g, '/');
      if (!filePath.startsWith(modPath + '/') && filePath !== modPath) continue;

      for (const exp of file.exports) {
        if (exp.signature && !sigs.has(exp.name)) {
          sigs.set(exp.name, exp.signature);
        }
      }
    }

    lookup.set(modPath, sigs);
  }

  return lookup;
}

// ── Modules Section ─────────────────────────────────────────────────

export function buildModulesSection(
  modules: ModuleMapData,
  inventory: InventoryData,
  emptyMessage: string,
  capabilityIndex?: CapabilityIndexData,
): string {
  if (modules.modules.length === 0) return emptyMessage;

  const sigLookup = buildSignatureLookup(modules, inventory);

  // Build description lookup from capability-index (enriched/declared entries only)
  const descLookup = new Map<string, string>();
  if (capabilityIndex) {
    for (const entry of capabilityIndex.entries) {
      if (entry.description && entry.source !== 'extracted') {
        descLookup.set(entry.name, entry.description);
      }
    }
  }

  const lines: string[] = [];

  for (const mod of modules.modules) {
    const dp = collapseGroupPath(mod.path);
    const desc = mod.description ? ` — ${mod.description}` : '';
    const exportCount = mod.totalExports > 10 ? ` (${mod.totalExports} exports)` : '';

    if (mod.exports.length === 0) {
      lines.push(`- **${dp}/**${desc}`);
      continue;
    }

    const modKey = mod.path.replace(/\\/g, '/');
    const sigs = sigLookup.get(modKey) || new Map<string, string>();
    const withSigs = mod.exports.filter(e => sigs.has(e));
    const withoutSigs = mod.exports.filter(e => !sigs.has(e));

    if (withSigs.length > 0) {
      // Prioritize exports that have enriched descriptions (they provide the most value)
      const sorted = [...withSigs].sort((a, b) => {
        const aHas = descLookup.has(a) ? 0 : 1;
        const bHas = descLookup.has(b) ? 0 : 1;
        return aHas - bHas;
      });

      lines.push(`- **${dp}/**${desc}${exportCount}:`);
      // Phase 1: Top 5 with full signature + description
      const detailed = sorted.slice(0, 5);
      for (const e of detailed) {
        const capDesc = descLookup.get(e);
        const suffix = capDesc ? ` — ${capDesc}` : '';
        lines.push(`  - \`${e}${sigs.get(e)}\`${suffix}`);
      }

      // Phase 2: Remaining enriched exports — compact format (name — desc, no signature)
      const remaining = sorted.slice(5).concat(withoutSigs);
      const enrichedRemaining = remaining.filter(e => descLookup.has(e));
      for (const e of enrichedRemaining) {
        lines.push(`  - ${e} — ${descLookup.get(e)}`);
      }

      // Phase 3: Non-enriched exports — just names
      const shownSoFar = detailed.length + enrichedRemaining.length;
      const nonEnriched = remaining.filter(e => !descLookup.has(e));
      if (nonEnriched.length > 0) {
        const showAll = nonEnriched.length <= 8;
        const shown = showAll ? nonEnriched : nonEnriched.slice(0, 5);
        const moreCount = mod.totalExports - shownSoFar - shown.length;
        const moreStr = moreCount > 0 ? `, ... +${moreCount} in capability-index.json` : '';
        lines.push(`  - ${shown.join(', ')}${moreStr}`);
      } else if (mod.totalExports > shownSoFar) {
        // All known exports shown but totalExports is higher (subset in mod.exports)
        const moreCount = mod.totalExports - shownSoFar;
        if (moreCount > 0) lines.push(`  - ... +${moreCount} in capability-index.json`);
      }
    } else {
      const exportList = mod.exports.join(', ');
      const more = mod.totalExports > mod.exports.length ? ', ...' : '';
      lines.push(`- **${dp}/**${desc}${exportCount}: \`${exportList}${more}\``);
    }
  }

  lines.push('');
  lines.push('<!-- Full details in .claude/capability-index.json -->');

  return lines.join('\n');
}

// ── Duplicate Section with confidence tiers (legacy style) ──────────

export function buildDuplicateSection(resolved: ResolvedDuplicate[]): string {
  if (resolved.length === 0) return 'No duplicates detected.';

  const highConfidence = resolved.filter(r => r.confidence === 'high');
  const mediumConfidence = resolved.filter(r => r.confidence === 'medium');
  const lowConfidence = resolved.filter(r => r.confidence === 'low');

  let section = '';

  if (highConfidence.length > 0) {
    section += highConfidence.slice(0, 10).map(r => {
      const reasons = r.canonical.reasons.length > 0 ? ` (${r.canonical.reasons.join(', ')})` : '';
      const ignoreList = r.alternatives.map(a => a.file).join(', ');
      const sig = r.canonical.signature ? `\n  Signature: \`${r.canonical.signature}\`` : '';
      return `- \`${r.name}\` (${r.type}) → use ${r.canonical.file}:${r.canonical.line}${reasons}, IGNORE ${ignoreList}${sig}`;
    }).join('\n');
  }

  if (mediumConfidence.length > 0) {
    if (section) section += '\n';
    section += '\nProbable (verify if the choice is correct):\n';
    section += mediumConfidence.slice(0, 5).map(r => {
      const reasons = r.canonical.reasons.length > 0 ? ` (${r.canonical.reasons.join(', ')})` : '';
      const sig = r.canonical.signature ? `\n  Signature: \`${r.canonical.signature}\`` : '';
      return `- \`${r.name}\` (${r.type}) → probable: ${r.canonical.file}:${r.canonical.line}${reasons}, alternative: ${r.alternatives[0]?.file || '?'}${sig}`;
    }).join('\n');
  }

  if (lowConfidence.length > 0) {
    if (section) section += '\n';
    section += '\nAmbiguous (DECIDE which is the canonical version):\n';
    section += lowConfidence.slice(0, 5).map(r => {
      const locations = [r.canonical, ...r.alternatives].map(l => `${l.file}:${l.line}`).join(' vs ');
      return `- \`${r.name}\` (${r.type}) → ${locations}`;
    }).join('\n');
  }

  return section;
}

// ── Default Section Flags ───────────────────────────────────────────

export function defaultSectionFlags(type: ProjectType): TemplateSectionFlags {
  switch (type) {
    case 'new':
      return {
        principles: true,
        recommendedStructure: true,
        blueprintRef: true,
        conventionsFull: true,
        cssRules: true,
        additionalRules: true,
        antiDuplication: 'medium',
        variationRule: 'medium',
        locationRule: 'medium',
        duplicates: 'conditional',
        largeFiles: 'conditional',
        genericFiles: 'conditional',
        criticalDeps: 'standard',
        oportunistic: 'none',
        capabilityIndex: false,
        intentProtocol: true,
        namingMinimas: false,
        autoMaintenance: 'standard',
        postCompact: 'standard',
        referenceFiles: 'with-blueprint',
      };

    case 'legacy':
      return {
        principles: false,
        recommendedStructure: false,
        blueprintRef: false,
        conventionsFull: false,
        cssRules: false,
        additionalRules: false,
        antiDuplication: 'verbose',
        variationRule: 'verbose',
        locationRule: 'verbose',
        duplicates: 'confidence-tiers',
        largeFiles: 'split-by-severity',
        genericFiles: 'always',
        criticalDeps: 'with-warning',
        oportunistic: 'cautious',
        capabilityIndex: true,
        intentProtocol: true,
        namingMinimas: true,
        autoMaintenance: 'extended',
        postCompact: 'extended',
        referenceFiles: 'full-7',
      };

    case 'organized':
    default:
      return {
        principles: false,
        recommendedStructure: false,
        blueprintRef: false,
        conventionsFull: false,
        cssRules: false,
        additionalRules: false,
        antiDuplication: 'medium',
        variationRule: 'medium',
        locationRule: 'medium',
        duplicates: 'resolved',
        largeFiles: 'flat',
        genericFiles: 'always',
        criticalDeps: 'standard',
        oportunistic: 'proactive',
        capabilityIndex: true,
        intentProtocol: true,
        namingMinimas: true,
        autoMaintenance: 'standard',
        postCompact: 'standard',
        referenceFiles: 'standard-4',
      };
  }
}
