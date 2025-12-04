#!/usr/bin/env node

import { Command } from 'commander';
import { scanCommand, listCategories, cleanCommand, maintenanceCommand } from './commands/index.js';
import type { CategoryId } from './types.js';
import { CATEGORIES } from './types.js';

const program = new Command();

program
  .name('clean-my-mac')
  .description('Open source CLI tool to clean your Mac')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan your Mac for cleanable files')
  .option('-c, --category <category>', 'Scan specific category')
  .option('-v, --verbose', 'Show detailed output')
  .option('-l, --list', 'List available categories')
  .action(async (options) => {
    if (options.list) {
      listCategories();
      return;
    }

    if (options.category && !CATEGORIES[options.category as CategoryId]) {
      console.error(`Invalid category: ${options.category}`);
      console.error('Use --list to see available categories');
      process.exit(1);
    }

    await scanCommand({
      category: options.category as CategoryId | undefined,
      verbose: options.verbose,
    });
  });

program
  .command('clean')
  .description('Clean selected files from your Mac')
  .option('-a, --all', 'Clean all categories (safe and moderate only by default)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('-d, --dry-run', 'Show what would be cleaned without actually cleaning')
  .option('-c, --category <category>', 'Clean specific category')
  .option('-u, --unsafe', 'Include risky categories (downloads, iOS backups, etc)')
  .action(async (options) => {
    if (options.category && !CATEGORIES[options.category as CategoryId]) {
      console.error(`Invalid category: ${options.category}`);
      console.error('Use "clean-my-mac scan --list" to see available categories');
      process.exit(1);
    }

    await cleanCommand({
      all: options.all,
      yes: options.yes,
      dryRun: options.dryRun,
      category: options.category as CategoryId | undefined,
      unsafe: options.unsafe,
    });
  });

program
  .command('maintenance')
  .description('Run maintenance tasks')
  .option('--dns', 'Flush DNS cache')
  .option('--purgeable', 'Free purgeable space')
  .action(async (options) => {
    await maintenanceCommand({
      dns: options.dns,
      purgeable: options.purgeable,
    });
  });

program.parse();

