import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import checkbox from '@inquirer/checkbox';
import { exec } from 'child_process';
import type { CategoryId, CleanSummary, CleanableItem, ScanResult, SafetyLevel } from '../types.js';
import { runAllScans, getScanner, getAllScanners } from '../scanners/index.js';
import { formatSize, createScanProgress, createCleanProgress } from '../utils/index.js';

const DONATION_URL = 'https://ko-fi.com/guhcostan';

interface CleanCommandOptions {
  all?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  category?: CategoryId;
  unsafe?: boolean;
  noProgress?: boolean;
}

const SAFETY_ICONS: Record<SafetyLevel, string> = {
  safe: chalk.green('●'),
  moderate: chalk.yellow('●'),
  risky: chalk.red('●'),
};

interface CategoryChoice {
  name: string;
  value: string;
  checked: boolean;
  size: number;
  items: CleanableItem[];
}

export async function cleanCommand(options: CleanCommandOptions): Promise<CleanSummary | null> {
  const showProgress = !options.noProgress && process.stdout.isTTY;
  const scanners = getAllScanners();
  const scanProgress = showProgress ? createScanProgress(scanners.length) : null;

  const summary = await runAllScans({
    parallel: true,
    concurrency: 4,
    onProgress: (completed, _total, scanner) => {
      scanProgress?.update(completed, `Scanning ${scanner.category.name}...`);
    },
  });

  scanProgress?.finish();

  if (summary.totalSize === 0) {
    console.log(chalk.green('\n✓ Your Mac is already clean!\n'));
    return null;
  }

  let resultsWithItems = summary.results.filter((r) => r.items.length > 0);

  const riskyResults = resultsWithItems.filter((r) => r.category.safetyLevel === 'risky');
  const safeResults = resultsWithItems.filter((r) => r.category.safetyLevel !== 'risky');

  if (!options.unsafe && riskyResults.length > 0) {
    const riskySize = riskyResults.reduce((sum, r) => sum + r.totalSize, 0);
    console.log();
    console.log(chalk.yellow('⚠ Skipping risky categories (use --unsafe to include):'));
    for (const result of riskyResults) {
      console.log(chalk.dim(`  ${SAFETY_ICONS.risky} ${result.category.name}: ${formatSize(result.totalSize)}`));
      if (result.category.safetyNote) {
        console.log(chalk.dim.italic(`     ${result.category.safetyNote}`));
      }
    }
    console.log(chalk.dim(`  Total skipped: ${formatSize(riskySize)}`));
    resultsWithItems = safeResults;
  }

  if (resultsWithItems.length === 0) {
    console.log(chalk.green('\n✓ Nothing safe to clean!\n'));
    return null;
  }

  let selectedItems: { categoryId: CategoryId; items: CleanableItem[] }[] = [];

  if (options.all) {
    selectedItems = resultsWithItems.map((r) => ({
      categoryId: r.category.id,
      items: r.items,
    }));
  } else {
    selectedItems = await selectItemsInteractively(resultsWithItems);
  }

  if (selectedItems.length === 0) {
    console.log(chalk.yellow('\nNo items selected for cleaning.\n'));
    return null;
  }

  const totalToClean = selectedItems.reduce((sum, s) => sum + s.items.reduce((is, i) => is + i.size, 0), 0);
  const totalItems = selectedItems.reduce((sum, s) => sum + s.items.length, 0);

  if (!options.yes && !options.dryRun) {
    const proceed = await confirm({
      message: `Delete ${totalItems} items (${formatSize(totalToClean)})?`,
      default: false,
    });

    if (!proceed) {
      console.log(chalk.yellow('\nCleaning cancelled.\n'));
      return null;
    }
  }

  if (options.dryRun) {
    console.log(chalk.cyan('\n[DRY RUN] Would clean the following:'));
    for (const { categoryId, items } of selectedItems) {
      const scanner = getScanner(categoryId);
      const size = items.reduce((sum, i) => sum + i.size, 0);
      console.log(`  ${scanner.category.name}: ${items.length} items (${formatSize(size)})`);
    }
    console.log(chalk.cyan(`\n[DRY RUN] Would free ${formatSize(totalToClean)}\n`));
    return null;
  }

  const cleanProgress = showProgress ? createCleanProgress(selectedItems.length) : null;

  const cleanResults: CleanSummary = {
    results: [],
    totalFreedSpace: 0,
    totalCleanedItems: 0,
    totalErrors: 0,
  };

  let cleanedCount = 0;
  for (const { categoryId, items } of selectedItems) {
    const scanner = getScanner(categoryId);
    cleanProgress?.update(cleanedCount, `Cleaning ${scanner.category.name}...`);

    const result = await scanner.clean(items, options.dryRun);
    cleanResults.results.push(result);
    cleanResults.totalFreedSpace += result.freedSpace;
    cleanResults.totalCleanedItems += result.cleanedItems;
    cleanResults.totalErrors += result.errors.length;
    cleanedCount++;
  }

  cleanProgress?.finish();

  await printCleanResults(cleanResults);

  return cleanResults;
}

async function selectItemsInteractively(
  results: ScanResult[]
): Promise<{ categoryId: CategoryId; items: CleanableItem[] }[]> {
  console.log();
  console.log(chalk.bold('Select categories to clean:'));
  console.log();

  const choices: CategoryChoice[] = results.map((r) => {
    const safetyIcon = SAFETY_ICONS[r.category.safetyLevel];
    
    return {
      name: `${safetyIcon} ${r.category.name.padEnd(28)} ${chalk.yellow(formatSize(r.totalSize).padStart(10))} ${chalk.dim(`(${r.items.length} items)`)}`,
      value: r.category.id,
      checked: false,
      size: r.totalSize,
      items: r.items,
    };
  });

  const selectedCategories = await checkbox<CategoryId>({
    message: 'Categories',
    choices: choices.map((c) => ({
      name: c.name,
      value: c.value as CategoryId,
      checked: c.checked,
    })),
    pageSize: 15,
  });
  const selectedResults = results.filter((r) => selectedCategories.includes(r.category.id));

  const selectedItems: { categoryId: CategoryId; items: CleanableItem[] }[] = [];

  for (const result of selectedResults) {
    const isRisky = result.category.safetyLevel === 'risky';
    
    if (isRisky || result.category.supportsFileSelection) {
      if (isRisky && result.category.safetyNote) {
        console.log();
        console.log(chalk.red(`⚠ WARNING: ${result.category.safetyNote}`));
      }
      
      const itemChoices = result.items.map((item) => ({
        name: `${item.name.substring(0, 40).padEnd(40)} ${chalk.yellow(formatSize(item.size).padStart(10))}`,
        value: item.path,
        checked: false,
      }));

      const selectedPaths = await checkbox<string>({
        message: `Select items from ${result.category.name}:`,
        choices: itemChoices,
        pageSize: 10,
      });
      const selectedItemsList = result.items.filter((i) => selectedPaths.includes(i.path));

      if (selectedItemsList.length > 0) {
        selectedItems.push({
          categoryId: result.category.id,
          items: selectedItemsList,
        });
      }
    } else {
      selectedItems.push({
        categoryId: result.category.id,
        items: result.items,
      });
    }
  }

  return selectedItems;
}

async function printCleanResults(summary: CleanSummary): Promise<void> {
  console.log();
  console.log(chalk.bold.green('✓ Cleaning Complete'));
  console.log(chalk.dim('─'.repeat(50)));

  for (const result of summary.results) {
    if (result.cleanedItems > 0) {
      console.log(
        `  ${result.category.name.padEnd(30)} ${chalk.green('✓')} ${formatSize(result.freedSpace)} freed`
      );
    }
    for (const error of result.errors) {
      console.log(`  ${result.category.name.padEnd(30)} ${chalk.red('✗')} ${error}`);
    }
  }

  console.log();
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.bold(`Freed: ${chalk.green(formatSize(summary.totalFreedSpace))}`));
  console.log(chalk.dim(`Cleaned ${summary.totalCleanedItems} items`));

  if (summary.totalErrors > 0) {
    console.log(chalk.red(`Errors: ${summary.totalErrors}`));
  }

  console.log();

  if (summary.totalCleanedItems > 0 && summary.totalFreedSpace > 0) {
    await showDonationMessage();
  }
}

async function showDonationMessage(): Promise<void> {
  console.log(chalk.dim('─'.repeat(50)));
  console.log();
  console.log(chalk.bold('💚 Enjoying Mac Cleaner CLI?'));
  console.log();
  console.log(chalk.dim('  If this tool saved you time or disk space,'));
  console.log(chalk.dim('  consider supporting the project:'));
  console.log();
  console.log(`  ${chalk.cyan.underline(DONATION_URL)}`);
  console.log();

  const shouldOpen = await confirm({
    message: 'Open donation page in browser?',
    default: false,
  });

  if (shouldOpen) {
    exec(`open "${DONATION_URL}"`);
    console.log(chalk.green('\n✓ Opened in your browser. Thank you for your support! 🙏\n'));
  } else {
    console.log(chalk.dim('\nThank you for using Mac Cleaner CLI! 🙏\n'));
  }
}
