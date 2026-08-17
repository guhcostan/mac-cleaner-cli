import chalk from 'chalk';
import type { CategoryId, CleanSummary, CleanableItem, SafetyLevel } from '../types.js';
import { getScanner } from '../scanners/index.js';
import { sumItemSizes, type ProgressBar } from '../utils/index.js';

export const SAFETY_ICONS: Record<SafetyLevel, string> = {
  safe: chalk.green('●'),
  moderate: chalk.yellow('●'),
  risky: chalk.red('●'),
};

export interface CleanSelection {
  categoryId: CategoryId;
  items: CleanableItem[];
}

export function countSelectedItems(selections: readonly CleanSelection[]): number {
  return selections.reduce((sum, selection) => sum + selection.items.length, 0);
}

export function sumSelectedSize(selections: readonly CleanSelection[]): number {
  return selections.reduce((sum, selection) => sum + sumItemSizes(selection.items), 0);
}

/**
 * Cleans every selection in order, aggregating the per-category results and
 * reporting progress by category.
 */
export async function runCleanSelections(
  selections: readonly CleanSelection[],
  options: { dryRun?: boolean; progress?: ProgressBar | null } = {}
): Promise<CleanSummary> {
  const summary: CleanSummary = {
    results: [],
    totalFreedSpace: 0,
    totalCleanedItems: 0,
    totalErrors: 0,
  };

  let cleaned = 0;
  for (const { categoryId, items } of selections) {
    const scanner = getScanner(categoryId);
    options.progress?.update(cleaned, `Cleaning ${scanner.category.name}...`);

    const result = await scanner.clean(items, options.dryRun);
    summary.results.push(result);
    summary.totalFreedSpace += result.freedSpace;
    summary.totalCleanedItems += result.cleanedItems;
    summary.totalErrors += result.errors.length;
    cleaned++;
  }

  return summary;
}
