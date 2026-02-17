import { createPatternModule } from './createPatternModule';

export const tanstackQueryPattern = createPatternModule({
  id: 'tanstack-query',
  name: 'TanStack Query',

  activationCheck: (stack) =>
    stack.frontend?.libraries.some(l =>
      l.name.includes('tanstack') && (l.category === 'data-fetching' || l.name.includes('query'))
    ) ?? false,

  folderSuggestions: [
    {
      path: 'src/features/{feature}',
      purpose: 'Frontend vertical slice: components, hooks, schemas, api, types — all together by domain',
      suggestedFiles: [
        'hooks/{feature}Keys.ts',
        'hooks/use{Feature}List.ts',
        'hooks/use{Feature}Detail.ts',
        'hooks/use{Feature}Mutations.ts',
        'api/{feature}Api.ts',
        'schemas/{feature}Schema.ts',
        '{feature}.types.ts',
        'index.ts',
      ],
    },
    {
      path: 'src/shared/http',
      purpose: 'Centralized HTTP client (apiClient) — used by ALL features',
      suggestedFiles: ['apiClient.ts', 'index.ts'],
    },
  ],

  codePatterns: [
    {
      name: 'Query Key Factory',
      context: 'Each feature has a centralized query key factory. Makes invalidation predictable and greppable.',
      stackRequirement: ['@tanstack/react-query'],
      example: `// src/features/users/hooks/usersKeys.ts
export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...usersKeys.lists(), filters] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (id: number) => [...usersKeys.details(), id] as const,
};`,
      antiPattern: 'DO NOT use loose strings as queryKey. Always use the factory for correct invalidation.',
    },
    {
      name: 'List Hook with useQuery',
      context: 'One hook per read operation. Lives in the same feature that consumes it.',
      stackRequirement: ['@tanstack/react-query'],
      example: `// src/features/users/hooks/useUsersList.ts
import { useQuery } from '@tanstack/react-query';
import { usersKeys } from './usersKeys';
import { fetchUsers } from '../api/usersApi';

export function useUsersList(filters: UserFilters) {
  return useQuery({
    queryKey: usersKeys.list(filters),
    queryFn: () => fetchUsers(filters),
  });
}`,
      antiPattern: 'DO NOT use useEffect + useState for fetch. TanStack Query handles cache, loading, error, refetch.',
    },
    {
      name: 'CRUD Mutation Hook',
      context: 'Mutations with automatic invalidation of related queries.',
      stackRequirement: ['@tanstack/react-query'],
      example: `// src/features/users/hooks/useUsersMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersKeys } from './usersKeys';
import { createUser, updateUser, deleteUser } from '../api/usersApi';

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.lists() }),
  });
}`,
    },
    {
      name: 'Per-Feature API Client',
      context: 'Each feature has its own api/ that uses the shared apiClient. Functions live alongside the feature.',
      stackRequirement: ['@tanstack/react-query'],
      example: `// src/features/users/api/usersApi.ts
import { apiClient } from '@/shared/http/apiClient';
import type { User, UserFilters, CreateUserDto } from '../users.types';

export async function fetchUsers(filters: UserFilters): Promise<User[]> {
  return apiClient.get('/users', { params: filters });
}

export async function createUser(data: CreateUserDto): Promise<User> {
  return apiClient.post('/users', data);
}`,
      antiPattern: 'DO NOT use fetch() directly in components. Always go through apiClient for centralized headers, base URL and error handling.',
    },
  ],

  dataFlows: [
    {
      name: 'Read Flow (List)',
      layers: ['Component', 'useQuery Hook', 'API Client', 'Backend Endpoint', 'Database'],
      description: 'Component calls hook → TanStack Query checks cache → if stale, calls apiClient → backend endpoint → DB. All frontend code involved lives in features/{domain}/.',
    },
    {
      name: 'Write Flow (Mutation)',
      layers: ['Form', 'useMutation Hook', 'API Client', 'Backend Endpoint', 'Validation', 'Database', 'Cache Invalidation'],
      description: 'Form submit → useMutation → apiClient.post → endpoint validates → persists → onSuccess invalidates queries → UI updates automatically.',
    },
  ],

  sharedUtilities: [
    {
      name: 'apiClient',
      purpose: 'Centralized HTTP client with base URL, JWT auth headers, error interceptors',
      suggestedPath: 'src/shared/http/apiClient.ts',
      stackReason: 'TanStack Query queryFn needs a consistent fetch wrapper — one place for headers and error handling',
    },
    {
      name: 'queryClient',
      purpose: 'QueryClient instance with defaultOptions (staleTime, retry, refetchOnWindowFocus)',
      suggestedPath: 'src/lib/queryClient.ts',
      stackReason: 'TanStack Query needs a shared instance for the QueryClientProvider',
    },
  ],

  antiDuplicationEntries: [
    { need: 'Fetch data from the server', solution: 'TanStack Query hook from the feature', canonicalPath: 'src/features/{feature}/hooks/' },
    { need: 'Mutate data (create/edit/delete)', solution: 'useMutation + invalidation from the feature', canonicalPath: 'src/features/{feature}/hooks/' },
    { need: 'Call any API endpoint', solution: 'Shared apiClient', canonicalPath: 'src/shared/http/apiClient.ts' },
    { need: 'Configure QueryClient', solution: 'Shared queryClient', canonicalPath: 'src/lib/queryClient.ts' },
  ],

  antiPatterns: [
    { pattern: 'useEffect + useState for fetch', reason: 'Re-implements cache, loading, error that TanStack Query already solves', alternative: 'useQuery with query key factory' },
    { pattern: 'fetch() directly in components', reason: 'Each component reinvents headers, auth, error handling', alternative: 'apiClient.get/post() centralized in shared/http/' },
    { pattern: 'Hardcoded strings as queryKey', reason: 'Fragile invalidation, silent typos', alternative: 'Query key factory per feature' },
    { pattern: 'Hooks and API in separate folders from feature', reason: 'Scatters code of a domain — the AI cannot discover it together', alternative: 'Everything inside features/{domain}/ (hooks/, api/, schemas/)' },
  ],
});
