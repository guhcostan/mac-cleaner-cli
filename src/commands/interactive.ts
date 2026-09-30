import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import type { CategoryId, CleanSummary, CleanableItem, ScanResult, SafetyLevel } from '../types.js';
import { runAllScans, getScanner, getAllScanners } from '../scanners/index.js';
import { formatSize, createScanProgress, createCleanProgress, hasFullDiskAccess, FULL_DISK_ACCESS_HINT, loadConfig, ensureBackupDir, getBackupDir } from '../utils/index.js';
import filePickerPrompt from '../pickers/file-picker.js';
import { printScanErrors } from './scan.js';

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
  dryRun?: boolean;
}

export async function interactiveCommand(options: InteractiveOptions = {}): Promise<CleanSummary | null> {
  console.log();
  console.log(chalk.bold.cyan('🧹 Mac Cleaner CLI'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log();

  // One-time hint instead of dozens of EPERM errors later (see issue #61)
  if (await hasFullDiskAccess() === false) {
    console.log(chalk.yellow(FULL_DISK_ACCESS_HINT));
    console.log();
  }

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

  printScanErrors(summary.results);

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

  // Step 5: Summary, warnings, confirmation
  const categoriesById = new Map(resultsWithItems.map((r) => [r.category.id, r.category]));

  // `backupEnabled` comes from ~/.maccleanerrc. Until now `loadConfig()` was
  // only ever called by `config --show` — the file `config --init` wrote had no
  // effect whatsoever on cleaning.
  const config = await loadConfig();
  const backupEnabled = config.backupEnabled === true;

  const categoriesWithoutBackup = backupEnabled
    ? selectedItems
        .map(({ categoryId }) => getScanner(categoryId))
        .filter((scanner) => scanner?.supportsBackup === false)
        .map((scanner) => scanner.category.name)
    : [];

  console.log();
  console.log(chalk.bold('Summary:'));
  for (const { categoryId, items } of selectedItems) {
    const category = categoriesById.get(categoryId);
    if (!category) continue;
    const size = items.reduce((sum, i) => sum + i.size, 0);
    console.log(
      `  ${SAFETY_ICONS[category.safetyLevel]} ${category.name.padEnd(28)} ${chalk.dim(`${items.length} items`.padEnd(12))} ${chalk.yellow(formatSize(size).padStart(10))}`
    );
  }
  console.log();
  console.log(`  Items to delete: ${chalk.yellow(totalItems.toString())}`);
  console.log(`  Space to free: ${chalk.green(formatSize(totalToClean))}`);

  // safetyNote is the only place that explains WHAT can break. It has lived in
  // types.ts all along and was never printed in this flow, so the user decided
  // blind. It now shows immediately before the confirmation, for each risky
  // category actually selected.
  const riskySelected = selectedItems
    .map(({ categoryId }) => categoriesById.get(categoryId))
    .filter((c): c is NonNullable<typeof c> => !!c && c.safetyLevel === 'risky');

  if (riskySelected.length > 0) {
    console.log();
    for (const category of riskySelected) {
      console.log(chalk.red(`  ⚠ WARNING: ${category.name}`));
      if (category.safetyNote) {
        console.log(chalk.red.italic(`      ${category.safetyNote}`));
      }
    }
  }

  console.log();
  console.log(
    chalk.dim(
      options.dryRun
        ? '  Deletion is permanent (rm -rf, no Trash) — this is a dry run, nothing will be removed.'
        : '  Deletion is permanent: files do NOT go to the Trash and cannot be recovered.'
    )
  );

  if (backupEnabled) {
    console.log();
    console.log(chalk.cyan(`  Backup is ON — items will be MOVED to ${getBackupDir()}`));
    // The awkward part, said plainly: moving does not free space. Without this,
    // the final report ("0 B freed") would look like a bug.
    console.log(
      chalk.yellow(
        `  ⚠ Moving does NOT free disk space. Run "mac-cleaner-cli backup --clean" to reclaim it.`
      )
    );
    if (categoriesWithoutBackup.length > 0) {
      console.log(
        chalk.red(
          `  ⚠ No backup possible for: ${categoriesWithoutBackup.join(', ')} (external tool does the cleanup) — these WILL be deleted.`
        )
      );
    }
  }
  console.log();

  // Deletion here is permanent (rm -rf, no Trash). A prompt's default is the
  // answer a distracted user gives by hitting Enter — and that answer must
  // never be "delete".
  const proceed = await confirm({
    message: options.dryRun ? 'Simulate cleaning?' : 'Proceed with cleaning?',
    default: false,
  });

  if (!proceed) {
    console.log(chalk.yellow('\nCleaning cancelled.\n'));
    return null;
  }

  // Step 6: Clean
  // The backup directory is created ONCE per run, and only if some scanner in
  // this run can actually back up — otherwise we would leave empty timestamped
  // folders behind.
  const backupDir =
    backupEnabled && selectedItems.some(({ categoryId }) => getScanner(categoryId)?.supportsBackup !== false)
      ? await ensureBackupDir()
      : undefined;

  const cleanProgress = showProgress ? createCleanProgress(selectedItems.length) : null;

  const cleanResults: CleanSummary = {
    results: [],
    totalFreedSpace: 0,
    totalBackedUpSize: 0,
    backupDir,
    totalCleanedItems: 0,
    totalErrors: 0,
  };

  let cleanedCount = 0;
  for (const { categoryId, items } of selectedItems) {
    const scanner = getScanner(categoryId);
    cleanProgress?.update(
      cleanedCount,
      `${options.dryRun ? 'Simulating' : 'Cleaning'} ${scanner.category.name}...`
    );

    // dryRun is passed down to the scanner rather than simulated here on
    // purpose: Docker and Homebrew override `clean()` with external commands and
    // have their own dry-run early return. Simulating from the outside would
    // produce a report that does not match what the real command would do.
    const scannerBackupDir = scanner.supportsBackup === false ? undefined : backupDir;
    const result = await scanner.clean(items, options.dryRun, scannerBackupDir);
    cleanResults.results.push(result);
    cleanResults.totalFreedSpace += result.freedSpace;
    cleanResults.totalBackedUpSize = (cleanResults.totalBackedUpSize ?? 0) + (result.backedUpSize ?? 0);
    cleanResults.totalCleanedItems += result.cleanedItems;
    cleanResults.totalErrors += result.errors.length;
    cleanedCount++;
  }

  cleanProgress?.finish();

  // Step 7: Show results
  printCleanResults(cleanResults, options.dryRun);

  if (cleanResults.totalErrors > 0) {
    process.exitCode = 1;
  }

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

function printCleanResults(summary: CleanSummary, dryRun = false): void {
  console.log();
  console.log(
    dryRun
      ? chalk.bold.cyan('[DRY RUN] Nothing was deleted — this is what would happen:')
      : chalk.bold.green('✓ Cleaning Complete!')
  );
  console.log(chalk.dim('─'.repeat(50)));

  for (const result of summary.results) {
    if (result.cleanedItems > 0) {
      const backedUp = (result.backedUpSize ?? 0) > 0;
      console.log(
        backedUp
          ? `  ${result.category.name.padEnd(30)} ${chalk.cyan('↦')} ${formatSize(result.backedUpSize ?? 0)} ${dryRun ? 'would be moved' : 'moved'} to backup`
          : `  ${result.category.name.padEnd(30)} ${chalk.green('✓')} ${formatSize(result.freedSpace)} ${dryRun ? 'would be freed' : 'freed'}`
      );
    }
    for (const error of result.errors) {
      console.log(`  ${result.category.name.padEnd(30)} ${chalk.red('✗')} ${error}`);
    }
  }

  console.log();
  console.log(chalk.dim('─'.repeat(50)));
  console.log(
    dryRun
      ? chalk.bold.cyan(`[DRY RUN] Would free ${formatSize(summary.totalFreedSpace)} of disk space`)
      : chalk.bold(`🎉 Freed ${chalk.green(formatSize(summary.totalFreedSpace))} of disk space!`)
  );
  console.log(chalk.dim(`   ${dryRun ? 'Would clean' : 'Cleaned'} ${summary.totalCleanedItems} items`));

  if ((summary.totalBackedUpSize ?? 0) > 0) {
    console.log();
    console.log(
      chalk.cyan(`   ${formatSize(summary.totalBackedUpSize ?? 0)} moved to backup (still on disk):`)
    );
    console.log(chalk.dim(`     ${summary.backupDir}`));
    console.log(chalk.dim(`     restore: mac-cleaner-cli backup --restore "${summary.backupDir}"`));
    console.log(chalk.dim(`     reclaim: mac-cleaner-cli backup --clean`));
  }

  if (summary.totalErrors > 0) {
    console.log(chalk.red(`   Errors: ${summary.totalErrors}`));
  }

  console.log();
}
