import chalk from 'chalk';
import type { CategoryId, CleanSummary, ScanResult } from '../types.js';
import { runAllScans, getScanner, getAllScanners } from '../scanners/index.js';
import { formatSize, createScanProgress, createCleanProgress } from '../utils/index.js';

const AUTO_CLEAN_CATEGORIES: CategoryId[] = [
  'dev-cache',
  'system-cache',
  'temp-files',
  'browser-cache',
  'homebrew',
];

interface AutoCleanOptions {
  dev?: boolean;
  system?: boolean;
  browsers?: boolean;
  homebrew?: boolean;
  all?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  unsafe?: boolean;
  noProgress?: boolean;
}

function determineCategories(options: AutoCleanOptions): CategoryId[] {
  if (options.all) {
    return AUTO_CLEAN_CATEGORIES;
  }

  const categories: CategoryId[] = [];

  if (options.dev) categories.push('dev-cache');
  if (options.system) {
    categories.push('system-cache', 'temp-files');
  }
  if (options.browsers) categories.push('browser-cache');
  if (options.homebrew) categories.push('homebrew');

  if (categories.length === 0) {
    return AUTO_CLEAN_CATEGORIES;
  }

  return categories;
}

function filterSafeResults(results: ScanResult[], unsafe: boolean): ScanResult[] {
  if (unsafe) return results;

  return results.filter((r) => r.category.safetyLevel !== 'risky');
}

export async function autoCleanCommand(options: AutoCleanOptions): Promise<CleanSummary | null> {
  const showProgress = !options.noProgress && process.stdout.isTTY;
  const targetCategories = determineCategories(options);
  
  console.log(chalk.bold('\n🔍 Auto Clean'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`Target categories: ${chalk.cyan(targetCategories.join(', '))}`);
  if (options.dryRun) {
    console.log(chalk.cyan('Mode: DRY RUN (no files will be deleted)\n'));
  }

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
  resultsWithItems = resultsWithItems.filter((r) => targetCategories.includes(r.category.id));
  resultsWithItems = filterSafeResults(resultsWithItems, options.unsafe ?? false);

  if (resultsWithItems.length === 0) {
    console.log(chalk.green('\n✓ No cleanable items found in target categories!\n'));
    return null;
  }

  const totalToClean = resultsWithItems.reduce((sum, r) => sum + r.totalSize, 0);
  const totalItems = resultsWithItems.reduce((sum, r) => sum + r.items.length, 0);

  console.log(chalk.dim(`Found ${totalItems} items (${formatSize(totalToClean)})`));
  console.log();

  for (const result of resultsWithItems) {
    const size = formatSize(result.totalSize);
    const icon = result.category.safetyLevel === 'safe' ? '✓' : '~';
    const color = result.category.safetyLevel === 'safe' ? chalk.green : chalk.yellow;
    console.log(`  ${color(icon)} ${result.category.name.padEnd(28)} ${chalk.yellow(size.padStart(10))}`);
  }
  console.log();

  if (!options.yes && !options.dryRun) {
    console.log(chalk.yellow('Use --yes to skip confirmation or --dry-run to preview'));
    console.log(chalk.yellow('Cleaning cancelled.\n'));
    return null;
  }

  if (options.dryRun) {
    console.log(chalk.cyan('[DRY RUN] Would clean the following:'));
    for (const result of resultsWithItems) {
      const size = result.items.reduce((sum, i) => sum + i.size, 0);
      console.log(`  ${result.category.name}: ${result.items.length} items (${formatSize(size)})`);
    }
    console.log(chalk.cyan(`\n[DRY RUN] Would free ${formatSize(totalToClean)}\n`));
    return null;
  }

  const cleanProgress = showProgress ? createCleanProgress(resultsWithItems.length) : null;

  const cleanResults: CleanSummary = {
    results: [],
    totalFreedSpace: 0,
    totalCleanedItems: 0,
    totalErrors: 0,
  };

  let cleanedCount = 0;
  for (const result of resultsWithItems) {
    const scanner = getScanner(result.category.id);
    cleanProgress?.update(cleanedCount, `Cleaning ${scanner.category.name}...`);

    const cleanResult = await scanner.clean(result.items);
    cleanResults.results.push(cleanResult);
    cleanResults.totalFreedSpace += cleanResult.freedSpace;
    cleanResults.totalCleanedItems += cleanResult.cleanedItems;
    cleanResults.totalErrors += cleanResult.errors.length;
    cleanedCount++;
  }

  cleanProgress?.finish();

  console.log();
  console.log(chalk.bold.green('✓ Auto Clean Complete'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.bold(`Freed: ${chalk.green(formatSize(cleanResults.totalFreedSpace))}`));
  console.log(chalk.dim(`Cleaned ${cleanResults.totalCleanedItems} items`));

  if (cleanResults.totalErrors > 0) {
    console.log(chalk.red(`Errors: ${cleanResults.totalErrors}`));
  }

  console.log();

  return cleanResults;
}
