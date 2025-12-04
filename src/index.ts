#!/usr/bin/env node

import { Command } from 'commander';
import { scanCommand, listCategories, cleanCommand, maintenanceCommand, uninstallCommand } from './commands/index.js';
import type { CategoryId } from './types.js';
import { CATEGORIES } from './types.js';
import { initConfig, configExists, listBackups, cleanOldBackups } from './utils/index.js';

const program = new Command();

program
  .name('clean-my-mac')
  .description('Open source CLI tool to clean your Mac')
  .version('1.1.0');

program
  .command('scan')
  .description('Scan your Mac for cleanable files')
  .option('-c, --category <category>', 'Scan specific category')
  .option('-v, --verbose', 'Show detailed output')
  .option('-l, --list', 'List available categories')
  .option('--no-progress', 'Disable progress bar')
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
      noProgress: !options.progress,
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
  .option('--no-progress', 'Disable progress bar')
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
      noProgress: !options.progress,
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

program
  .command('uninstall')
  .description('Uninstall applications and their related files')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('-d, --dry-run', 'Show what would be uninstalled without actually uninstalling')
  .option('--no-progress', 'Disable progress bar')
  .action(async (options) => {
    await uninstallCommand({
      yes: options.yes,
      dryRun: options.dryRun,
      noProgress: !options.progress,
    });
  });

program
  .command('config')
  .description('Manage configuration')
  .option('--init', 'Create default configuration file')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    if (options.init) {
      const exists = await configExists();
      if (exists) {
        console.log('Configuration file already exists.');
        return;
      }
      const path = await initConfig();
      console.log(`Created configuration file at: ${path}`);
      return;
    }

    if (options.show) {
      const exists = await configExists();
      if (!exists) {
        console.log('No configuration file found. Run "clean-my-mac config --init" to create one.');
        return;
      }
      const { loadConfig } = await import('./utils/index.js');
      const config = await loadConfig();
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log('Use --init to create config or --show to display current config.');
  });

program
  .command('backup')
  .description('Manage backups')
  .option('--list', 'List all backups')
  .option('--clean', 'Clean old backups (older than 7 days)')
  .action(async (options) => {
    if (options.list) {
      const backups = await listBackups();
      if (backups.length === 0) {
        console.log('No backups found.');
        return;
      }
      console.log('\nBackups:');
      for (const backup of backups) {
        const { formatSize } = await import('./utils/index.js');
        console.log(`  ${backup.date.toLocaleDateString()} - ${formatSize(backup.size)}`);
        console.log(`    ${backup.path}`);
      }
      return;
    }

    if (options.clean) {
      const cleaned = await cleanOldBackups();
      console.log(`Cleaned ${cleaned} old backups.`);
      return;
    }

    console.log('Use --list to show backups or --clean to remove old ones.');
  });

program.parse();
