#!/usr/bin/env node

import { Command } from 'commander';
import { ExitPromptError } from '@inquirer/core';
import { interactiveCommand, listCategories, maintenanceCommand, uninstallCommand } from './commands/index.js';
import { initConfig, configExists, listBackups, cleanOldBackups, loadConfig, formatSize } from './utils/index.js';

function setupGracefulShutdown(): void {
  const handleExit = (signal: string) => {
    console.log(`\n${signal} received. Exiting...`);
    process.exit(0);
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
  process.on('SIGQUIT', () => handleExit('SIGQUIT'));
}

setupGracefulShutdown();

const program = new Command();

program
  .name('mac-cleaner')
  .description('Open source CLI tool to clean your Mac')
  .version('1.1.0')
  .option('-r, --risky', 'Include risky categories (downloads, iOS backups, etc)')
  .option('-f, --file-picker', 'Force file picker for ALL categories')
  .option('-A, --absolute-paths', 'Show absolute paths instead of truncated notations')
  .option('--no-progress', 'Disable progress bar')
  .action(async (options) => {
    try {
      await interactiveCommand({
        includeRisky: options.risky,
        filePicker: options.filePicker,
        absolutePaths: options.absolutePaths,
        noProgress: !options.progress,
      });
    } catch (error) {
      if (error instanceof ExitPromptError) return;
      throw error;
    }
  });

program
  .command('uninstall')
  .description('Uninstall applications and their related files')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('-d, --dry-run', 'Show what would be uninstalled without actually uninstalling')
  .option('--no-progress', 'Disable progress bar')
  .action(async (options) => {
    try {
      await uninstallCommand({
        yes: options.yes,
        dryRun: options.dryRun,
        noProgress: !options.progress,
      });
    } catch (error) {
      if (error instanceof ExitPromptError) return;
      throw error;
    }
  });

program
  .command('maintenance')
  .description('Run maintenance tasks (DNS flush, free purgeable space)')
  .option('--dns', 'Flush DNS cache')
  .option('--purgeable', 'Free purgeable space')
  .action(async (options) => {
    await maintenanceCommand({
      dns: options.dns,
      purgeable: options.purgeable,
    });
  });

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
        console.log('No configuration file found. Run "mac-cleaner-cli config --init" to create one.');
        return;
      }
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
