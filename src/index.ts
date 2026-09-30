#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';
import { ExitPromptError } from '@inquirer/core';
import { cleanCommand, interactiveCommand, listCategories, maintenanceCommand, scanCommand, uninstallCommand } from './commands/index.js';
import { initConfig, configExists, listBackups, cleanOldBackups, restoreBackup, loadConfig, formatSize } from './utils/index.js';
import { formatError, isDebugEnabled } from './utils/errors.js';
import { CATEGORIES, type CategoryId } from './types.js';
import pkg from '../package.json' with { type: 'json' };

function parseCategoryId(value: string): CategoryId {
  if (!(value in CATEGORIES)) {
    throw new InvalidArgumentError(
      `Unknown category "${value}". Run "mac-cleaner-cli categories" to list valid ids.`
    );
  }
  return value as CategoryId;
}

function parseCategoryIdList(value: string): CategoryId[] {
  return value.split(',').map((id) => parseCategoryId(id.trim()));
}

/**
 * Terminates the CLI on an unrecoverable error: a cancelled prompt is a normal
 * exit, anything else is reported with a non-zero status (full stack with
 * MAC_CLEANER_DEBUG=1) instead of surfacing as an unhandled rejection.
 */
function handleFatalError(error: unknown): never {
  if (error instanceof ExitPromptError) {
    console.log('\n');
    process.exit(0);
  }

  console.error(`\nError: ${formatError(error)}`);
  if (isDebugEnabled() && error instanceof Error && error.stack) {
    console.error(error.stack);
  } else {
    console.error('Run again with MAC_CLEANER_DEBUG=1 for the full stack trace.');
  }
  process.exit(1);
}

/**
 * Wraps a command action so every failure goes through a single error path.
 */
function action<TArgs extends unknown[]>(
  run: (...args: TArgs) => Promise<unknown>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await run(...args);
    } catch (error) {
      handleFatalError(error);
    }
  };
}

function setupErrorHandlers(): void {
  process.on('unhandledRejection', (reason) => handleFatalError(reason));
  process.on('uncaughtException', (error) => handleFatalError(error));
}

function setupGracefulShutdown(): void {
  const handleExit = (signal: string) => {
    console.log(`\n${signal} received. Exiting...`);
    process.exit(0);
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
  process.on('SIGQUIT', () => handleExit('SIGQUIT'));
}

setupErrorHandlers();
setupGracefulShutdown();

const program = new Command();

program
  .name('mac-cleaner-cli')
  .description('Open source CLI tool to clean your Mac')
  .version(pkg.version)
  .option('-r, --risky', 'Include risky categories (downloads, iOS backups, etc)')
  .option('-f, --file-picker', 'Force file picker for ALL categories')
  .option('-A, --absolute-paths', 'Show absolute paths instead of truncated notations')
  .option('-d, --dry-run', 'Show what would be deleted without deleting anything')
  .option('--no-progress', 'Disable progress bar')
  .action(action(async (options) => {
    const config = await loadConfig();
    await interactiveCommand({
      includeRisky: options.risky,
      filePicker: options.filePicker ?? config.filePicker,
      absolutePaths: options.absolutePaths,
      dryRun: options.dryRun,
      noProgress: !options.progress,
    });
  }));

program
  .command('scan')
  .description('Scan for cleanable files without deleting anything')
  .option('-c, --category <id>', 'Scan a single category', parseCategoryId)
  .option('-v, --verbose', 'Show the largest items in each category')
  .option('--json', 'Output results as JSON (for scripts and integrations)')
  .option('--no-progress', 'Disable progress bar')
  .action(action(async (options) => {
    await scanCommand({
      category: options.category,
      verbose: options.verbose,
      json: options.json,
      noProgress: !options.progress,
    });
  }));

program
  .command('clean')
  .description('Clean cleanable files (non-interactive with --all or --categories)')
  .option('-a, --all', 'Clean all non-risky categories without selection')
  .option('-c, --categories <ids>', 'Comma-separated category ids to clean (e.g. trash,browser-cache)', parseCategoryIdList)
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('-d, --dry-run', 'Show what would be cleaned without deleting')
  .option('--unsafe', 'Include risky categories (downloads, iOS backups, etc)')
  .option('--no-progress', 'Disable progress bar')
  .action(action(async (options) => {
    await cleanCommand({
      all: options.all,
      categories: options.categories,
      yes: options.yes,
      dryRun: options.dryRun,
      unsafe: options.unsafe,
      noProgress: !options.progress,
    });
  }));

program
  .command('uninstall')
  .description('Uninstall applications and their related files')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('-d, --dry-run', 'Show what would be uninstalled without actually uninstalling')
  .option('--no-progress', 'Disable progress bar')
  .action(action(async (options) => {
    await uninstallCommand({
      yes: options.yes,
      dryRun: options.dryRun,
      noProgress: !options.progress,
    });
  }));

program
  .command('maintenance')
  .description('Run maintenance tasks (DNS flush, free purgeable space, Time Machine snapshots)')
  .option('--dns', 'Flush DNS cache')
  .option('--purgeable', 'Free purgeable space')
  .option('--timemachine', 'Delete Time Machine local snapshots')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('-d, --dry-run', 'Show what would be done without changing anything')
  .action(action(async (options) => {
    await maintenanceCommand({
      dns: options.dns,
      purgeable: options.purgeable,
      timemachine: options.timemachine,
      yes: options.yes,
      dryRun: options.dryRun,
    });
  }));

program
  .command('categories')
  .description('List all available categories')
  .action(() => {
    listCategories();
  });

program
  .command('config')
  .description('Manage configuration')
  .option('--init', 'Create default configuration file')
  .option('--show', 'Show current configuration')
  .action(action(async (options) => {
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
        console.log('No configuration file found. Run "mac-cleaner-cli config --init" to create one.');
        return;
      }
      const config = await loadConfig();
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log('Use --init to create config or --show to display current config.');
  }));

program
  .command('backup')
  .description('Manage backups')
  .option('--list', 'List all backups')
  .option('--restore <dir>', 'Restore a backup back to its original locations')
  .option('--clean', 'Delete old backups permanently (older than 7 days), reclaiming disk space')
  .action(action(async (options) => {
    if (options.list) {
      const backups = await listBackups();
      if (backups.length === 0) {
        console.log('No backups found. Backups only happen when "backupEnabled": true is set in ~/.maccleanerrc');
        return;
      }
      console.log('\nBackups:');
      for (const backup of backups) {
        console.log(`  ${backup.date.toLocaleDateString()} - ${formatSize(backup.size)}`);
        console.log(`    ${backup.path}`);
      }
      console.log('\nRestore with: mac-cleaner-cli backup --restore <path>');
      return;
    }

    if (options.restore) {
      const result = await restoreBackup(options.restore);
      console.log(`Restored ${result.success} items.`);
      if (result.failed > 0) {
        console.log(`Failed: ${result.failed}`);
        for (const error of result.errors) {
          console.log(`  ✗ ${error}`);
        }
        process.exitCode = 1;
      }
      return;
    }

    if (options.clean) {
      const cleaned = await cleanOldBackups();
      console.log(`Cleaned ${cleaned} old backups.`);
      return;
    }

    console.log('Use --list to show backups, --restore <dir> to bring one back, or --clean to remove old ones.');
  }));

program.parseAsync().catch(handleFatalError);
