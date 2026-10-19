import chalk from 'chalk';
import { cleanSelectedResults } from '../utils/cleanup.js';
import confirm from '@inquirer/confirm';
import checkbox from '@inquirer/checkbox';
import { spawn } from 'child_process';
import type { CategoryId, CleanSummary, CleanableItem, ScanResult, SafetyLevel, RepoRequestOptions } from '../types.js';
import { runAllScans, runScans, getScanner, getAllScanners } from '../scanners/index.js';
import { formatSize, createScanProgress, createCleanProgress, sanitizeDisplayName, loadConfig, ensureBackupDir, getBackupDir } from '../utils/index.js';
import { printScanErrors } from './scan.js';

const DONATION_URL = 'https://ko-fi.com/guhcostan';

/**
 * Opens a URL in the default browser using spawn (safer than exec).
 * Uses the macOS 'open' command with the URL as a separate argument
 * to prevent command injection.
 */
function openUrl(url: string): void {
  // Don't open browser in test environment or CI
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true' || !process.stdout.isTTY) {
    return;
  }

  // Validate URL format to prevent injection
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      console.error('Invalid URL protocol');
      return;
    }
  } catch {
    console.error('Invalid URL format');
    return;
  }
  
  // Use spawn with separate arguments to prevent command injection
  spawn('/usr/bin/open', [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

interface CleanCommandOptions extends RepoRequestOptions {
  json?: boolean;
  live?: boolean;
  all?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  categories?: CategoryId[];
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
  if (options.json) return cleanJsonCommand(options);
  if (options.live) throw new Error('Use root --live for interactive cleanup review');
  const showProgress = !options.noProgress && process.stdout.isTTY;
  const categoryIds = options.categories?.length
    ? options.categories
    : getAllScanners().map((s) => s.category.id);
  const scanProgress = showProgress ? createScanProgress(categoryIds.length) : null;

  const scanOptions = {
    roots: options.roots,
    includeEcosystems: options.includeEcosystems,
    excludePaths: options.excludePaths,
    onProgress: (completed: number, _total: number, scanner: { category: { name: string } }) => {
      scanProgress?.update(completed, `Scanning ${scanner.category.name}...`);
    },
  };

  const summary = options.categories?.length
    ? await runScans(categoryIds, scanOptions)
    : await runAllScans(scanOptions);

  scanProgress?.finish();

  printScanErrors(summary.results);

  if (summary.results.some((r) => r.error)) process.exitCode = 1;
  if (summary.totalItems === 0) {
    if (summary.results.some((r) => r.error)) return null;
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

  // Explicit --categories behaves like --all scoped to those categories:
  // no interactive selection, so the command stays usable in scripts and cron
  const selectedItems = options.all || options.categories?.length
    ? resultsWithItems.map((r) => ({ categoryId: r.category.id, items: r.items }))
    : await selectItemsInteractively(resultsWithItems);

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

  // The `clean` subcommand honours `backupEnabled` exactly like the interactive
  // flow does. Backing up in one entry point and deleting permanently in the
  // other would be worse than not backing up at all: the user's expectation
  // would depend on which command they happened to type.
  const config = await loadConfig();
  const backupEnabled = config.backupEnabled === true;

  if (backupEnabled) {
    const withoutBackup = selectedItems
      .map(({ categoryId }) => getScanner(categoryId))
      .filter((scanner) => scanner?.supportsBackup === false)
      .map((scanner) => scanner.category.name);

    console.log();
    console.log(chalk.cyan(`Backup is ON — items will be MOVED to ${getBackupDir()}`));
    console.log(
      chalk.yellow('⚠ Moving does NOT free disk space. Run "mac-cleaner-cli backup --clean" to reclaim it.')
    );
    if (withoutBackup.length > 0) {
      console.log(
        chalk.red(
          `⚠ No backup possible for: ${withoutBackup.join(', ')} (external tool does the cleanup) — these WILL be deleted.`
        )
      );
    }
  }

  const backupDir =
    backupEnabled && selectedItems.some(({ categoryId }) => getScanner(categoryId)?.supportsBackup !== false)
      ? (options.dryRun ? `${getBackupDir()}/dry-run` : await ensureBackupDir())
      : undefined;

  const cleanProgress = showProgress ? createCleanProgress(selectedItems.length) : null;

  const cleanResults = await cleanSelectedResults(selectedItems.map(({ categoryId, items }) => ({
    ...summary.results.find((r) => r.category.id === categoryId)!, items,
  })), getScanner, {
    dryRun: options.dryRun, backupDir,
    onProgress: (completed, result) => cleanProgress?.update(completed, `Cleaning ${result.category.name}...`),
  });

  cleanProgress?.finish();

  if (options.dryRun) console.log(`[DRY RUN] Would free ${formatSize(cleanResults.wouldFreeSpace ?? 0)}; would back up ${formatSize(cleanResults.wouldBackUpSize ?? 0)}`);
  else await printCleanResults(cleanResults);

  // Failures during deletion must be visible to callers (CI, cron, scripts)
  if (cleanResults.totalErrors > 0) {
    process.exitCode = 1;
  }

  return cleanResults;
}

/** One stdout document, even for an empty, invalid or partially failed run. */
async function cleanJsonCommand(options: CleanCommandOptions): Promise<CleanSummary> {
  let result: CleanSummary = { results: [], totalFreedSpace: 0, totalBackedUpSize: 0, totalCleanedItems: 0, totalErrors: 0, wouldFreeSpace: 0, wouldBackUpSize: 0, wouldCleanItems: 0 };
  const errors: { category?: CategoryId; error: string }[] = [];
  const skippedCategories: { category: CategoryId; reason: string }[] = [];
  let warnings: { category: CategoryId; path: string; reason: string }[] = [];
  try {
    if (options.live) throw new Error('--live and --json cannot be combined');
    if (!options.all && !options.categories?.length) throw new Error('JSON_SELECTION_REQUIRED: use --all or --categories');
    if (!options.dryRun && !options.yes) throw new Error('JSON_CONFIRMATION_REQUIRED: actual JSON cleanup requires --yes');
    const request = { roots: options.roots, includeEcosystems: options.includeEcosystems, excludePaths: options.excludePaths };
    const scanned = options.categories?.length ? await runScans(options.categories, request) : await runAllScans(request);
    warnings = scanned.results.flatMap((r) => (r.warnings ?? []).map((w) => ({ category: r.category.id, ...w })));
    const selected = scanned.results.filter((r) => {
      if (r.error) errors.push({ category: r.category.id, error: r.error });
      const reason = r.skipped ?? (!options.unsafe && r.category.safetyLevel === 'risky' ? 'RISK_NOT_ENABLED' : undefined);
      if (reason) skippedCategories.push({ category: r.category.id, reason });
      return !reason && r.items.length > 0;
    });
    const config = await loadConfig();
    if (config.repoPolicyError) throw new Error(config.repoPolicyError);
    const backup = config.backupEnabled && selected.some((r) => getScanner(r.category.id).supportsBackup !== false);
    const backupDir = backup ? (options.dryRun ? `${getBackupDir()}/dry-run` : await ensureBackupDir()) : undefined;
    result = await cleanSelectedResults(selected, getScanner, { dryRun: options.dryRun, backupDir });
  } catch (error) { errors.push({ error: error instanceof Error ? error.message : String(error) }); }
  result.totalErrors += errors.length;
  console.log(JSON.stringify({ version: 1, dryRun: !!options.dryRun, sizeBasis: 'estimated-logical-bytes', ...result, errors, warnings, skippedCategories }, null, 2));
  if (result.totalErrors > 0) process.exitCode = 1;
  return result;
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
        name: `${sanitizeDisplayName(item.name).substring(0, 40).padEnd(40)} ${chalk.yellow(formatSize(item.size).padStart(10))}`,
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
    openUrl(DONATION_URL);
    console.log(chalk.green('\n✓ Opened in your browser. Thank you for your support!\n'));
  } else {
    console.log(chalk.dim('\nThank you for using Mac Cleaner CLI!\n'));
  }
}
