import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import type { CategoryId, CleanSummary, CleanableItem, ScanResult, SafetyLevel } from '../types.js';
import { runAllScans, getScanner, getAllScanners } from '../scanners/index.js';
import { formatSize, createScanProgress, createCleanProgress } from '../utils/index.js';
import filePickerPrompt from '../pickers/file-picker.js';

const SAFETY_ICONS: Record<SafetyLevel, string> = {
  safe: chalk.green('●'),
  moderate: chalk.yellow('●'),
  risky: chalk.red('●'),
};

interface InteractiveOptions {
  includeRisky?: boolean;
  noProgress?: boolean;
  absolutePaths?: boolean;
  filePicker?: boolean;
}

export async function interactiveCommand(options: InteractiveOptions = {}): Promise<CleanSummary | null> {
  console.log();
  console.log(chalk.bold.cyan('🧹 Mac Cleaner CLI'));
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
  const selectedItems = await selectItemsInteractively(resultsWithItems, options.absolutePaths, options.filePicker);

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
  absolutePaths = false,
  enableFilePickerForAll = false,
): Promise<{ categoryId: CategoryId; items: CleanableItem[] }[]> {
  // Set of categories that should show file picker UI
  // -f flag enables for all, otherwise only categories marked in types.ts or config
  const categoriesWithFileSelection = enableFilePickerForAll
    ? new Set<CategoryId>(results.map((r) => r.category.id))
    : new Set<CategoryId>(results.filter((r) => r.category.supportsFileSelection).map((r) => r.category.id));

  const filePickerResult = await filePickerPrompt({
    message: 'Select categories to clean (space to toggle, enter to confirm):',
    results,
    absolutePaths,
    categoriesWithFileSelection,
  });

  const selectedCategories = Array.from(filePickerResult.selectedCategories);
  const selectedFilesByCategory = filePickerResult.selectedFilesByCategory;

  const selectedResults = results.filter((r) => selectedCategories.includes(r.category.id));
  const selectedItems: { categoryId: CategoryId; items: CleanableItem[] }[] = [];

  for (const result of selectedResults) {
    const categoryId = result.category.id;
    const selectedFilesForCategory = selectedFilesByCategory.get(categoryId);

    if (categoriesWithFileSelection.has(categoryId)) {
      if (selectedFilesForCategory && selectedFilesForCategory.size > 0) {
        const selectedItemsList = result.items.filter((i) =>
          selectedFilesForCategory.has(i.path)
        );
        if (selectedItemsList.length > 0) {
          selectedItems.push({ categoryId, items: selectedItemsList });
        }
      }
      // If no files selected for a category with file selection, skip it
    } else {
      selectedItems.push({ categoryId, items: result.items });
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

