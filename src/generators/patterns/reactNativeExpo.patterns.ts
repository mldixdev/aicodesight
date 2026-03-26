/**
 * @intent Expo/React Native pattern module — folder suggestions and anti-duplication guidance for mobile projects
 * @domain generators/patterns
 * @depends-on createPatternModule
 */
import { createPatternModule } from './createPatternModule';

export const reactNativeExpoPattern = createPatternModule({
  id: 'react-native-expo',
  name: 'React Native / Expo',

  activationCheck: (stack) => {
    if (!stack.frontend) return false;
    return stack.frontend.libraries.some(l => l.category === 'mobile-framework');
  },

  folderSuggestions: [
    {
      path: 'app/',
      purpose: 'Screens via file-based routing (Expo Router)',
      suggestedFiles: ['_layout.tsx', 'index.tsx'],
    },
    {
      path: 'app/(group)/',
      purpose: 'Route groups for layout nesting — e.g., (auth)/, (admin)/, (tabs)/',
      suggestedFiles: ['_layout.tsx'],
    },
    {
      path: 'src/modules/{domain}/',
      purpose: 'Domain module: services, hooks, types, and barrel grouped by business domain',
      suggestedFiles: ['index.ts', 'types.ts'],
    },
    {
      path: 'src/modules/{domain}/services/',
      purpose: 'Service layer for the domain — API/BaaS calls',
      suggestedFiles: ['{domain}Service.ts'],
    },
    {
      path: 'src/modules/{domain}/hooks/',
      purpose: 'React hooks wrapping services for the domain',
      suggestedFiles: ['use{Domain}.ts'],
    },
    {
      path: 'src/shared/components/',
      purpose: 'Reusable UI components used across multiple modules (Button, Input, Card, etc.)',
      suggestedFiles: ['index.ts'],
    },
    {
      path: 'src/shared/hooks/',
      purpose: 'Shared hooks for cross-cutting concerns (state, utilities)',
      suggestedFiles: ['index.ts'],
    },
    {
      path: 'src/shared/theme/',
      purpose: 'Centralized design tokens: colors, typography, spacing, radii',
      suggestedFiles: ['tokens.ts', 'index.ts'],
    },
    {
      path: 'src/infrastructure/',
      purpose: 'External service clients (Supabase, Firebase, analytics, etc.)',
      suggestedFiles: [],
    },
  ],

  codePatterns: [
    {
      name: 'One module per domain',
      context: 'Group services/, hooks/, types.ts, and index.ts by business domain, not by file type. Check existing modules before creating a new one.',
      stackRequirement: [],
      example: `// src/modules/auth/
//   services/authService.ts
//   hooks/useAuth.ts
//   types.ts
//   index.ts`,
      antiPattern: 'DO NOT create a flat src/services/ or src/hooks/ directory with all domains mixed together.',
    },
    {
      name: 'Shared base components',
      context: 'Reusable UI components (Button, Input, Card, Avatar, Modal) live in src/shared/components/. Check there before creating a new component in a feature module.',
      stackRequirement: [],
      example: `// src/shared/components/Button.tsx — used by all modules
// src/shared/components/Input.tsx — used by all modules
// src/shared/components/index.ts — barrel export`,
      antiPattern: 'DO NOT recreate base UI components inside feature modules or inside app/ screens.',
    },
    {
      name: 'Centralized theme tokens',
      context: 'Colors, typography, spacing, and radii defined once in src/shared/theme/. Import tokens instead of hardcoding values.',
      stackRequirement: [],
      example: `// src/shared/theme/tokens.ts
// export const colors = { primary: { 50: '...', 500: '...', 900: '...' } };
// export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };`,
      antiPattern: 'DO NOT hardcode color values or spacing numbers directly in component styles.',
    },
  ],

  antiDuplicationEntries: [
    {
      need: 'Reusable UI component (Button, Card, Input)',
      solution: 'Check src/shared/components/ first — parameterize with variants/props',
      canonicalPath: 'src/shared/components/',
    },
    {
      need: 'Cross-cutting hook (auth, state, utilities)',
      solution: 'Check src/shared/hooks/ first — if cross-cutting, it belongs in shared',
      canonicalPath: 'src/shared/hooks/',
    },
    {
      need: 'Color, spacing, or typography value',
      solution: 'Import from src/shared/theme/tokens instead of hardcoding',
      canonicalPath: 'src/shared/theme/tokens.ts',
    },
  ],

  antiPatterns: [
    {
      pattern: 'UI components inside app/',
      reason: 'app/ is for screens/routing only — components in app/ are not discoverable by other screens',
      alternative: 'Place reusable components in src/shared/components/',
    },
    {
      pattern: 'New module without checking existing modules',
      reason: 'A module for the same domain may already exist with services and hooks',
      alternative: 'Search src/modules/ for existing domain modules before creating',
    },
    {
      pattern: 'Duplicating theme values',
      reason: 'Hardcoded values drift apart and become inconsistent',
      alternative: 'Import from src/shared/theme/',
    },
  ],
});
