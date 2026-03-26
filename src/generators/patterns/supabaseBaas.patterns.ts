/**
 * @intent Supabase BaaS pattern module — folder suggestions and anti-duplication guidance for Supabase projects
 * @domain generators/patterns
 * @depends-on createPatternModule
 */
import { createPatternModule } from './createPatternModule';

export const supabaseBaasPattern = createPatternModule({
  id: 'supabase-baas',
  name: 'Supabase BaaS',

  activationCheck: (stack) => {
    const checkLibs = (libs: { name: string; category: string }[]) =>
      libs.some(l => l.category === 'baas' && l.name.includes('supabase'));

    return (
      (stack.backend?.libraries && checkLibs(stack.backend.libraries)) ||
      (stack.frontend?.libraries && checkLibs(stack.frontend.libraries)) ||
      false
    );
  },

  folderSuggestions: [
    {
      path: 'src/infrastructure/supabase/',
      purpose: 'Supabase client initialization and configuration — single source of truth',
      suggestedFiles: ['client.ts', 'index.ts'],
    },
    {
      path: 'src/modules/{domain}/services/',
      purpose: 'Service files with Supabase queries grouped by domain — one service per domain',
      suggestedFiles: ['{domain}Service.ts'],
    },
  ],

  codePatterns: [
    {
      name: 'One service per domain',
      context: 'All Supabase queries for a domain (products, auth, orders) go in a single service file. Check if a service already exists before creating a new one.',
      stackRequirement: ['@supabase/supabase-js'],
      example: `// src/modules/products/services/productService.ts
// All product queries here: getProducts, createProduct, updateProduct, deleteProduct
// src/modules/auth/services/authService.ts
// All auth operations here: signIn, signUp, signOut, getProfile`,
      antiPattern: 'DO NOT scatter Supabase queries across components or create multiple service files for the same domain.',
    },
    {
      name: 'Centralized client',
      context: 'The Supabase client is initialized once in src/infrastructure/supabase/client.ts. All services import from there.',
      stackRequirement: ['@supabase/supabase-js'],
      example: `// src/infrastructure/supabase/client.ts — single client instance
// Import: import { supabase } from '@/infrastructure/supabase';`,
      antiPattern: 'DO NOT call createClient() in multiple files or import Supabase SDK directly in components.',
    },
  ],

  antiDuplicationEntries: [
    {
      need: 'Query to a Supabase table',
      solution: 'Consolidate all queries for a table into the domain service file',
      canonicalPath: 'src/modules/{domain}/services/{domain}Service.ts',
    },
    {
      need: 'Supabase client instance',
      solution: 'Import from the centralized client — never call createClient() elsewhere',
      canonicalPath: 'src/infrastructure/supabase/client.ts',
    },
  ],

  antiPatterns: [
    {
      pattern: 'Supabase queries directly in components',
      reason: 'Disperses data access logic across UI — makes queries undiscoverable and duplicatable',
      alternative: 'Call domain services from hooks, hooks from components',
    },
    {
      pattern: 'New service file without checking existing ones',
      reason: 'A service for the same domain may already exist with related queries',
      alternative: 'Search src/modules/*/services/ for existing domain services before creating',
    },
  ],
});
