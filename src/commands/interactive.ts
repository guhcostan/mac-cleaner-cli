import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import checkbox from '@inquirer/checkbox';
import type { CategoryId, CleanSummary, CleanableItem, ScanResult, SafetyLevel } from '../types.js';
import { runAllScans, getScanner, getAllScanners } from '../scanners/index.js';
import { formatSize, createScanProgress, createCleanProgress } from '../utils/index.js';

const SAFETY_ICONS: Record<SafetyLevel, string> = {
  safe: chalk.green('●'),
  moderate: chalk.yellow('●'),
  risky: chalk.red('●'),
};

interface InteractiveOptions {
  includeRisky?: boolean;
  noProgress?: boolean;
}

export async function interactiveCommand(options: InteractiveOptions = {}): Promise<CleanSummary | null> {
  console.log();
  console.log(chalk.bold.cyan('🧹 Clean My Mac'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log();

  // Step 1: Scan
  const showProgress = !options.noProgress && process.stdout.isTTY;
  const scanners = getAllScanners();
  const scanProgress = showProgress ? createScanProgress(scanners.length) : null;

  console.log(chalk.cyan('Scanning your Mac for cleanable files...\n'));

  const summary = await runAllScans({
    parallel: true,
    concurrency: 4,
    onProgress: (completed, _total, scanner) => {
      scanProgress?.update(completed, `Scanning ${scanner.category.name}...`);
    },
  });

  scanProgress?.finish();

  if (summary.totalSize === 0) {
    console.log(chalk.green('✓ Your Mac is already clean! Nothing to remove.\n'));
    return null;
  }

  // Step 2: Show results and filter
  let resultsWithItems = summary.results.filter((r) => r.items.length > 0);

  const riskyResults = resultsWithItems.filter((r) => r.category.safetyLevel === 'risky');
  const safeResults = resultsWithItems.filter((r) => r.category.safetyLevel !== 'risky');

  if (!options.includeRisky && riskyResults.length > 0) {
    const riskySize = riskyResults.reduce((sum, r) => sum + r.totalSize, 0);
    console.log();
    console.log(chalk.yellow('⚠ Hiding risky categories:'));
    for (const result of riskyResults) {
      console.log(chalk.dim(`  ${SAFETY_ICONS.risky} ${result.category.name}: ${formatSize(result.totalSize)}`));
    }
    console.log(chalk.dim(`  Total hidden: ${formatSize(riskySize)}`));
    console.log(chalk.dim('  Run with --risky to include these categories'));
    resultsWithItems = safeResults;
  }

  if (resultsWithItems.length === 0) {
    console.log(chalk.green('\n✓ Nothing safe to clean!\n'));
    return null;
  }

  // Step 3: Show what was found
  console.log();
  console.log(chalk.bold(`Found ${chalk.green(formatSize(summary.totalSize))} that can be cleaned:`));
  console.log();

  // Step 4: Let user select categories
  const selectedItems = await selectItemsInteractively(resultsWithItems, options.includeRisky);

  if (selectedItems.length === 0) {
    console.log(chalk.yellow('\nNo items selected. Nothing to clean.\n'));
    return null;
  }

  const totalToClean = selectedItems.reduce((sum, s) => sum + s.items.reduce((is, i) => is + i.size, 0), 0);
  const totalItems = selectedItems.reduce((sum, s) => sum + s.items.length, 0);

  // Step 5: Confirm
  console.log();
  console.log(chalk.bold('Summary:'));
  console.log(`  Items to delete: ${chalk.yellow(totalItems.toString())}`);
  console.log(`  Space to free: ${chalk.green(formatSize(totalToClean))}`);
  console.log();

  const proceed = await confirm({
    message: `Proceed with cleaning?`,
    default: true,
  });

  if (!proceed) {
    console.log(chalk.yellow('\nCleaning cancelled.\n'));
    return null;
  }

  // Step 6: Clean
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

    const result = await scanner.clean(items);
    cleanResults.results.push(result);
    cleanResults.totalFreedSpace += result.freedSpace;
    cleanResults.totalCleanedItems += result.cleanedItems;
    cleanResults.totalErrors += result.errors.length;
    cleanedCount++;
  }

  cleanProgress?.finish();

  // Step 7: Show results
  printCleanResults(cleanResults);

  return cleanResults;
}

async function selectItemsInteractively(
  results: ScanResult[],
  _includeRisky = false
): Promise<{ categoryId: CategoryId; items: CleanableItem[] }[]> {
  const choices = results.map((r) => {
    const safetyIcon = SAFETY_ICONS[r.category.safetyLevel];
    const isRisky = r.category.safetyLevel === 'risky';

    return {
      name: `${safetyIcon} ${r.category.name.padEnd(28)} ${chalk.yellow(formatSize(r.totalSize).padStart(10))} ${chalk.dim(`(${r.items.length} items)`)}`,
      value: r.category.id,
      checked: !isRisky,
    };
  });

  const selectedCategories = await checkbox<CategoryId>({
    message: 'Select categories to clean (space to toggle, enter to confirm):',
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
    const needsItemSelection = isRisky || result.category.id === 'large-files' || result.category.id === 'ios-backups';

    if (needsItemSelection) {
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

function printCleanResults(summary: CleanSummary): void {
  console.log();
  console.log(chalk.bold.green('✓ Cleaning Complete!'));
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
  console.log(chalk.bold(`🎉 Freed ${chalk.green(formatSize(summary.totalFreedSpace))} of disk space!`));
  console.log(chalk.dim(`   Cleaned ${summary.totalCleanedItems} items`));

  if (summary.totalErrors > 0) {
    console.log(chalk.red(`   Errors: ${summary.totalErrors}`));
  }

  console.log();
}

