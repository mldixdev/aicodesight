import { select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { StackSelection } from '../types';

export async function promptForStack(): Promise<StackSelection> {
  console.log(chalk.cyan('\n  New project detected — let\'s configure the stack:\n'));

  // 1. Project type
  const projectType = await select<StackSelection['projectType']>({
    message: 'What type of project are you creating?',
    choices: [
      { value: 'fullstack', name: 'Full-stack (Frontend + Backend + DB)' },
      { value: 'frontend', name: 'Frontend only' },
      { value: 'backend', name: 'Backend / API only' },
      { value: 'library', name: 'Library / CLI tool' },
    ],
  });

  let frontend: StackSelection['frontend'] | undefined;
  let backend: StackSelection['backend'] | undefined;
  let database: StackSelection['database'] | undefined;
  let monorepo = false;

  // 2. Frontend framework
  const hasFrontend = projectType === 'fullstack' || projectType === 'frontend';
  if (hasFrontend) {
    const framework = await select<string>({
      message: 'Frontend framework?',
      choices: [
        { value: 'React', name: 'React' },
        { value: 'Next.js', name: 'Next.js' },
        { value: 'Vue', name: 'Vue' },
        { value: 'Angular', name: 'Angular' },
        { value: 'Svelte', name: 'Svelte' },
      ],
    });

    // 3. Frontend libraries (conditional on React/Next.js ecosystem)
    let libraries: string[] = [];
    const isReactEco = framework === 'React' || framework === 'Next.js';

    if (isReactEco) {
      libraries = await checkbox<string>({
        message: 'Additional frontend libraries? (space to select)',
        choices: [
          { value: 'tanstack-query', name: 'TanStack Query (data fetching)' },
          { value: 'tanstack-table', name: 'TanStack Table (tables)' },
          { value: 'tanstack-router', name: 'TanStack Router (routing)' },
          { value: 'tailwind', name: 'Tailwind CSS (styling)' },
          { value: 'shadcn', name: 'shadcn/ui (components)' },
          { value: 'zustand', name: 'Zustand (state management)' },
          { value: 'react-hook-form', name: 'React Hook Form (forms)' },
          { value: 'zod', name: 'Zod (validation)' },
        ],
      });
    }

    frontend = { framework, libraries };
  }

  // 4. Backend framework
  const hasBackend = projectType === 'fullstack' || projectType === 'backend';
  if (hasBackend) {
    const framework = await select<string>({
      message: 'Backend framework?',
      choices: [
        { value: 'Express', name: 'Express' },
        { value: 'Fastify', name: 'Fastify' },
        { value: 'NestJS', name: 'NestJS' },
        { value: '.NET', name: '.NET (ASP.NET Core Minimal API)' },
      ],
    });

    let libraries: string[] = [];

    // 5. .NET additional components
    if (framework === '.NET') {
      libraries = await checkbox<string>({
        message: 'Additional .NET components? (space to select)',
        choices: [
          { value: 'efcore', name: 'EF Core (ORM)' },
          { value: 'mediatr', name: 'MediatR (CQRS)' },
          { value: 'fluentvalidation', name: 'FluentValidation' },
          { value: 'automapper', name: 'AutoMapper' },
          { value: 'signalr', name: 'SignalR (real-time)' },
        ],
      });
    }

    backend = { framework, libraries };

    // 6. ORM (for non-.NET backends)
    let selectedOrm: string | null = null;
    if (framework !== '.NET') {
      const ormChoice = await select<string>({
        message: 'ORM / Database?',
        choices: [
          { value: 'Prisma', name: 'Prisma' },
          { value: 'TypeORM', name: 'TypeORM' },
          { value: 'Drizzle', name: 'Drizzle' },
          { value: 'none', name: 'None for now' },
        ],
      });

      if (ormChoice !== 'none') {
        selectedOrm = ormChoice;
        backend.libraries.push(ormChoice.toLowerCase());
      }
    }

    // 7. Database engine (only if ORM was selected or .NET with EF Core)
    const needsDbQuestion = framework === '.NET'
      ? libraries.includes('efcore')
      : selectedOrm !== null;

    if (needsDbQuestion) {
      const engine = await select<string>({
        message: 'Database engine?',
        choices: [
          { value: 'PostgreSQL', name: 'PostgreSQL' },
          { value: 'MySQL', name: 'MySQL' },
          { value: 'SQL Server', name: 'SQL Server' },
          { value: 'MongoDB', name: 'MongoDB' },
          { value: 'SQLite', name: 'SQLite' },
          { value: 'none', name: 'None for now' },
        ],
      });

      if (engine !== 'none') {
        const orm = framework === '.NET' && libraries.includes('efcore')
          ? 'EF Core'
          : selectedOrm ?? undefined;
        database = { engine, orm };
      }
    }
  }

  // 8. Monorepo structure (if full-stack)
  if (projectType === 'fullstack') {
    monorepo = await confirm({
      message: 'Monorepo structure? (packages/frontend, packages/backend, packages/common)',
      default: true,
    });
  }

  console.log(chalk.green('\n  \u2713 Stack configured\n'));

  return { projectType, frontend, backend, database, monorepo };
}
