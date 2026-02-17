import { HooksMode, GuardConfig } from '../../types';

type ProjectLanguage = 'typescript' | 'javascript' | 'csharp' | 'mixed';

/**
 * Generates the default guard-config.json for a project.
 * Language-aware: sets appropriate thresholds per detected language.
 */
export function generateGuardConfig(mode: HooksMode, language: ProjectLanguage = 'typescript'): string {
  const hasCSharp = language === 'csharp' || language === 'mixed';

  const sizeGuard: GuardConfig['guards'][string] = {
    severity: 'warn' as const,
    maxLines: 350,
    maxExports: 5,
  };

  // C# is inherently more verbose than TS/JS — EF Core repos, controllers,
  // services with DI regularly exceed 350 lines as normal practice.
  // These overrides prevent noise that erodes trust in the guard system.
  if (hasCSharp) {
    sizeGuard.overrides = {
      '.cs': { maxLines: 500, maxExports: 8 },
    };
  }

  const config: GuardConfig = {
    mode,
    guards: {
      duplication: { severity: 'warn', fuzzyThreshold: 0.8 },
      size: sizeGuard,
      convention: { severity: 'info' },
      coherence: { severity: 'info' },
      dependency: { severity: 'off' },
      'structural-duplication': {
        severity: 'warn',
        thresholds: {
          useQuery: 3, className: 3, httpCalls: 3,
          formFields: 4, endpoints: 3, switchBranches: 4, tryCatch: 3,
        },
        disabledDetectors: [],
      },
      'intent-similarity': {
        severity: 'info',
      },
      'intent-declaration': {
        severity: 'warn',
      },
      'semantic-duplication': {
        severity: 'off',
        similarityThreshold: 0.66,
        blockThreshold: 0.85,
      },
    },
    whitelist: [],
    zones: {},
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generates the initial (empty) guard-memory.json.
 */
export function generateGuardMemory(): string {
  return JSON.stringify({
    warnings: {},
    lastUpdated: new Date().toISOString(),
  }, null, 2);
}
