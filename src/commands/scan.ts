import chalk from 'chalk';
import type { CategoryId, CategoryGroup, ScanSummary, ScanResult, SafetyLevel } from '../types.js';
import { CATEGORIES } from '../types.js';
import { runAllScans, runScans, getAllScanners } from '../scanners/index.js';
import { formatSize, createScanProgress } from '../utils/index.js';

const SAFETY_ICONS: Record<SafetyLevel, string> = {
  safe: chalk.green('●'),
  moderate: chalk.yellow('●'),
  risky: chalk.red('●'),
};

interface ScanCommandOptions {
  category?: CategoryId;
  verbose?: boolean;
  noProgress?: boolean;
}

export async function scanCommand(options: ScanCommandOptions): Promise<ScanSummary> {
  const scanners = options.category ? [options.category] : getAllScanners().map((s) => s.category.id);
  const total = scanners.length;
  const showProgress = !options.noProgress && process.stdout.isTTY;

  const progress = showProgress ? createScanProgress(total) : null;

  let summary: ScanSummary;

  const scanOptions = {
    verbose: options.verbose,
    parallel: true,
    concurrency: 4,
    onProgress: (completed: number, _total: number, scanner: { category: { name: string } }) => {
      progress?.update(completed, `Scanning ${scanner.category.name}...`);
    },
  };

  if (options.category) {
    summary = await runScans([options.category], scanOptions);
  } else {
    summary = await runAllScans(scanOptions);
  }

  progress?.finish();

  printScanResults(summary, options.verbose);

  return summary;
}

function printScanResults(summary: ScanSummary, verbose = false): void {
  console.log();
  console.log(chalk.bold('Scan Results'));
  console.log(chalk.dim('─'.repeat(60)));

  const groupedResults = groupResultsByCategory(summary.results);

  for (const [group, results] of Object.entries(groupedResults)) {
    const groupTotal = results.reduce((sum, r) => sum + r.totalSize, 0);

    if (groupTotal === 0) continue;

    console.log();
    console.log(chalk.bold.cyan(group));

    for (const result of results) {
      if (result.totalSize === 0) continue;

      const sizeStr = formatSize(result.totalSize);
      const itemCount = result.items.length;
      const safetyIcon = SAFETY_ICONS[result.category.safetyLevel];

      console.log(
        `  ${safetyIcon} ${result.category.name.padEnd(28)} ${chalk.yellow(sizeStr.padStart(10))} ${chalk.dim(`(${itemCount} items)`)}`
      );

      if (verbose && result.items.length > 0) {
        const topItems = result.items.sort((a, b) => b.size - a.size).slice(0, 5);
        for (const item of topItems) {
          console.log(chalk.dim(`      └─ ${item.name.padEnd(24)} ${formatSize(item.size).padStart(10)}`));
        }
        if (result.items.length > 5) {
          console.log(chalk.dim(`      └─ ... and ${result.items.length - 5} more`));
        }
      }
    }
  }

  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log(
    chalk.bold(`Total: ${chalk.green(formatSize(summary.totalSize))} can be cleaned (${summary.totalItems} items)`)
  );
  console.log();
  console.log(chalk.dim('Safety: ') + `${SAFETY_ICONS.safe} safe  ${SAFETY_ICONS.moderate} moderate  ${SAFETY_ICONS.risky} risky (use --unsafe)`);
  console.log();
}

function groupResultsByCategory(results: ScanResult[]): Record<CategoryGroup, ScanResult[]> {
  const groups: Record<CategoryGroup, ScanResult[]> = {
    'System Junk': [],
    'Development': [],
    'Storage': [],
    'Browsers': [],
    'Large Files': [],
  };

  for (const result of results) {
    const group = result.category.group;
    groups[group].push(result);
  }

  return groups;
}

export function listCategories(): void {
  console.log();
  console.log(chalk.bold('Available Categories'));
  console.log(chalk.dim('─'.repeat(70)));

  const groupedCategories: Record<CategoryGroup, typeof CATEGORIES[CategoryId][]> = {
    'System Junk': [],
    'Development': [],
    'Storage': [],
    'Browsers': [],
    'Large Files': [],
  };

  for (const category of Object.values(CATEGORIES)) {
    groupedCategories[category.group].push(category);
  }

  for (const [group, categories] of Object.entries(groupedCategories)) {
    console.log();
    console.log(chalk.bold.cyan(group));
    for (const category of categories) {
      const safetyIcon = SAFETY_ICONS[category.safetyLevel];
      console.log(`  ${safetyIcon} ${chalk.yellow(category.id.padEnd(18))} ${chalk.dim(category.description)}`);
      if (category.safetyNote) {
        console.log(`       ${chalk.dim.italic(`⚠ ${category.safetyNote}`)}`);
      }
    }
  }

  console.log();
  console.log(chalk.dim('Safety: ') + `${SAFETY_ICONS.safe} safe  ${SAFETY_ICONS.moderate} moderate  ${SAFETY_ICONS.risky} risky (requires --unsafe)`);
  console.log();
}
