import { Command } from 'commander';
import { runInit } from './commands/init';
import { runAudit } from './commands/audit';
import { runUpdate } from './commands/update';

const program = new Command();

program
  .name('aicodesight')
  .description('CLI for AI-friendly architecture: diagnoses projects and generates CLAUDE.md')
  .version('0.1.0');

program
  .command('init')
  .description('Diagnose the project and generate CLAUDE.md, inventory, and configuration')
  .argument('[directory]', 'Project directory to analyze', '.')
  .option('--type <type>', 'Project type: auto, new, legacy', 'auto')
  .option('--hooks <mode>', 'Configure hooks: yes (block), warn (advise), no', 'warn')
  .option('--dry-run', 'Show what would be generated without writing files', false)
  .option('--no-blueprint', 'Skip architectural blueprint generation')
  .option('--no-interactive', 'Skip interactive prompts (use auto-detection)')
  .option('--embeddings', 'Enable semantic duplication guard (requires @xenova/transformers)', false)
  .action(async (directory: string, options: { type: string; hooks: string; dryRun: boolean; blueprint: boolean; interactive: boolean; embeddings: boolean }) => {
    try {
      await runInit({
        directory: directory,
        type: options.type as 'auto' | 'new' | 'legacy',
        hooks: options.hooks as 'yes' | 'no' | 'warn',
        dryRun: options.dryRun,
        blueprint: options.blueprint !== false,
        interactive: options.interactive !== false,
        embeddings: options.embeddings,
      });
    } catch (error: any) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Deep analysis: duplication, size, conventions, and progress')
  .argument('[directory]', 'Project directory to analyze', '.')
  .option('--focus <focus>', 'What to analyze: duplication, size, naming, all', 'all')
  .option('--format <format>', 'Output format: console, md, json', 'console')
  .option('--output <file>', 'Save result to file')
  .action(async (directory: string, options: { focus: string; format: string; output?: string }) => {
    try {
      await runAudit({
        directory: directory,
        focus: options.focus as 'duplication' | 'size' | 'naming' | 'all',
        format: options.format as 'console' | 'md' | 'json',
        output: options.output,
      });
    } catch (error: any) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Regenerate CLAUDE.md, inventory, and hooks from the current code state')
  .argument('[directory]', 'Project directory to analyze', '.')
  .option('--only <target>', 'What to update: claude-md, inventory, duplicates, hooks, registry, memory, all', 'all')
  .option('--dry-run', 'Show what would change without writing files', false)
  .option('--embeddings', 'Enable semantic duplication guard (requires @xenova/transformers)', false)
  .action(async (directory: string, options: { only: string; dryRun: boolean; embeddings: boolean }) => {
    try {
      await runUpdate({
        directory: directory,
        only: options.only as 'claude-md' | 'inventory' | 'duplicates' | 'hooks' | 'all',
        dryRun: options.dryRun,
        embeddings: options.embeddings,
      });
    } catch (error: any) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
