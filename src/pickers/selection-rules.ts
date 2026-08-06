import type { ScanResult, CategoryId } from "../types.js";

/**
 * Pre-selection rules for the file picker.
 *
 * Deliberately a separate module from `file-picker.ts`: this is a domain rule
 * (what may come pre-checked without the user asking for it), not screen
 * drawing. Split out, it can be tested for real — the Inquirer prompt cannot.
 */

/**
 * Which files are already checked when the user checks the category.
 *
 * Checking a category auto-selects every file in it — convenient for caches,
 * dangerous for user data. On a `risky` category (iOS backups, mail
 * attachments, duplicates, .lproj folders inside /Applications) that would turn
 * a single spacebar press into "delete everything, unreviewed".
 *
 * So: a risky category opens EMPTY — every file has to be chosen deliberately.
 * Non-risky categories keep the existing select-all behaviour.
 */
export function autoSelectableFilePaths(
  results: ScanResult[],
  categoryId: CategoryId,
): string[] {
  const result = results.find((r) => r.category.id === categoryId);
  if (!result) return [];
  if (result.category.safetyLevel === "risky") return [];
  return result.items.map((item) => item.path);
}
