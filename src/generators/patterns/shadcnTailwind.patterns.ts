import { createPatternModule } from './createPatternModule';

export const shadcnTailwindPattern = createPatternModule({
  id: 'shadcn-tailwind',
  name: 'shadcn/ui + Tailwind CSS',

  activationCheck: (stack) => {
    if (!stack.frontend) return false;
    const libs = stack.frontend.libraries;
    return libs.some(l =>
      l.name.includes('tailwind') || l.name.includes('shadcn') || l.category === 'styling'
    );
  },

  folderSuggestions: [
    { path: 'src/components/ui', purpose: 'Generated shadcn/ui components (Button, Dialog, Table, etc.)', suggestedFiles: [] },
    {
      path: 'src/components',
      purpose: 'Shared components built on top of shadcn/ui (used by multiple features)',
      suggestedFiles: ['DataTable.tsx', 'Pagination.tsx', 'ConfirmDialog.tsx', 'PageHeader.tsx'],
    },
    {
      path: 'src/features/{feature}/components',
      purpose: 'Feature-specific UI components — live alongside hooks, api, schemas of the same domain',
      suggestedFiles: [
        '{Feature}Table.tsx',
        '{Feature}Form.tsx',
        '{Feature}Filters.tsx',
      ],
    },
    {
      path: 'src/shared/formatting',
      purpose: 'Pure formatting functions — one file per function for maximum discoverability',
      suggestedFiles: ['formatCurrency.ts', 'formatDate.ts', 'formatNumber.ts', 'index.ts'],
    },
  ],

  codePatterns: [
    {
      name: 'Reusable DataTable with TanStack Table + shadcn',
      context: 'Shared component for all data tables in the system. Each feature only defines its columns.',
      stackRequirement: ['@tanstack/react-table', 'shadcn/ui'],
      example: `// src/components/DataTable.tsx
import { flexRender, type Table } from '@tanstack/react-table';
import { Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DataTableProps<T> {
  table: Table<T>;
}

export function DataTable<T>({ table }: DataTableProps<T>) {
  return (
    <UITable>
      <TableHeader>
        {table.getHeaderGroups().map(headerGroup => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <TableHead key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map(row => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map(cell => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </UITable>
  );
}`,
      antiPattern: 'DO NOT create a table component per feature. Use the generic DataTable and pass columns + data.',
    },
    {
      name: 'Form with React Hook Form + Zod + shadcn',
      context: 'Standard pattern for forms with validation. The form lives inside its feature.',
      stackRequirement: ['react-hook-form', 'zod', 'shadcn/ui'],
      example: `// src/features/users/components/UserForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { userSchema, type UserFormData } from '../schemas/userSchema';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function UserForm({ onSubmit, defaultValues }: UserFormProps) {
  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}`,
      antiPattern: 'DO NOT validate inline in the component. Define a reusable Zod schema in the feature schemas/.',
    },
    {
      name: 'Zod Schema per Feature',
      context: 'Reusable validation schemas between form and API. Live in the feature that uses them.',
      stackRequirement: ['zod'],
      example: `// src/features/users/schemas/userSchema.ts
import { z } from 'zod';

export const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
});

export type UserFormData = z.infer<typeof userSchema>;`,
      antiPattern: 'DO NOT duplicate validations. A Zod schema is used in the form AND can be sent to the backend for shared validation.',
    },
    {
      name: 'Formatting function (one file per function)',
      context: 'Each formatting function lives in its own file for maximum AI discoverability.',
      stackRequirement: [],
      example: `// src/shared/formatting/formatCurrency.ts
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(value);
}

// src/shared/formatting/formatDate.ts
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en').format(new Date(date));
}

// src/shared/formatting/index.ts — barrel for convenient imports
export { formatCurrency } from './formatCurrency';
export { formatDate } from './formatDate';`,
      antiPattern: 'DO NOT create a formatters.ts with multiple exports — the AI cannot discover individual functions inside multi-purpose files.',
    },
  ],

  sharedUtilities: [
    {
      name: 'DataTable',
      purpose: 'Generic table component integrating TanStack Table with shadcn/ui Table',
      suggestedPath: 'src/components/DataTable.tsx',
      stackReason: 'All list views use tables — a shared component avoids duplicating markup',
    },
    {
      name: 'Pagination',
      purpose: 'Server-side pagination component with shadcn/ui Button',
      suggestedPath: 'src/components/Pagination.tsx',
      stackReason: 'Tables with server data need consistent pagination',
    },
    {
      name: 'ConfirmDialog',
      purpose: 'Reusable confirmation dialog (delete, unsaved changes)',
      suggestedPath: 'src/components/ConfirmDialog.tsx',
      stackReason: 'All destructive actions need confirmation — one single component',
    },
    {
      name: 'formatCurrency',
      purpose: 'Centralized currency formatting',
      suggestedPath: 'src/shared/formatting/formatCurrency.ts',
      stackReason: 'One place for currency format — prevents each component from reinventing Intl.NumberFormat',
    },
    {
      name: 'formatDate',
      purpose: 'Centralized date formatting',
      suggestedPath: 'src/shared/formatting/formatDate.ts',
      stackReason: 'One place for date format — prevents inconsistencies across components',
    },
  ],

  designTokens: [
    {
      category: 'Tailwind v4 @theme',
      suggestion: `Define tokens in the main CSS using @theme:
\`\`\`css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.55 0.2 250);
  --color-secondary: oklch(0.65 0.15 170);
  --color-destructive: oklch(0.55 0.22 25);
  --color-muted: oklch(0.95 0.01 250);
  --color-accent: oklch(0.85 0.05 250);
  --radius-default: 0.5rem;
  --radius-lg: 0.75rem;
  --spacing-page: 1.5rem;
}
\`\`\`
shadcn/ui inherits these tokens automatically. NEVER hardcode colors.`,
    },
  ],

  antiDuplicationEntries: [
    { need: 'Display a data table', solution: 'Shared DataTable', canonicalPath: 'src/components/DataTable.tsx' },
    { need: 'Server-side pagination', solution: 'Shared Pagination', canonicalPath: 'src/components/Pagination.tsx' },
    { need: 'Confirm destructive action', solution: 'Shared ConfirmDialog', canonicalPath: 'src/components/ConfirmDialog.tsx' },
    { need: 'Format currency', solution: 'formatCurrency', canonicalPath: 'src/shared/formatting/formatCurrency.ts' },
    { need: 'Format date', solution: 'formatDate', canonicalPath: 'src/shared/formatting/formatDate.ts' },
    { need: 'Validate form', solution: 'Zod schema from the feature', canonicalPath: 'src/features/{feature}/schemas/' },
    { need: 'Color, spacing, radius', solution: 'Tailwind v4 @theme tokens', canonicalPath: 'src/app/globals.css' },
  ],

  antiPatterns: [
    { pattern: 'Inline CSS or classes with hardcoded colors', reason: 'Bypasses the token system, causes visual inconsistency', alternative: 'Tailwind classes referencing @theme tokens' },
    { pattern: 'Table component per feature', reason: 'Multiplies identical markup', alternative: 'Generic DataTable + column definitions per feature' },
    { pattern: 'Inline validation in components', reason: 'Duplicates rules that should be consistent', alternative: 'Reusable Zod schema in feature schemas/' },
    { pattern: 'Single formatters.ts file with multiple exports', reason: 'The AI cannot discover individual functions inside multi-purpose files', alternative: 'One file per function in src/shared/formatting/' },
  ],
});
