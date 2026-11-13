import type { Scanner, Category, ScanResult, CleanResult, CleanableItem, ScannerOptions, CleanContext, PreparedCleanup } from '../types.js';
import { preflightItem, removeItemWithError } from '../utils/fs.js';
import { backupItem, backupPathFor } from '../utils/backup.js';
import { isRepoCategory, classify } from '../repo-artifacts/rules.js';
import { checkIdentity, checkMarkerIdentity, EligibilityError, reasonOf, validateSelected } from '../repo-artifacts/eligibility.js';

export function emptyCleanResult(category: Category): CleanResult {
  return { category, cleanedItems: 0, freedSpace: 0, errors: [], outcomes: [], wouldCleanItems: 0, wouldFreeSpace: 0, wouldBackUpSize: 0 };
}
export function mergeCleanResult(total: CleanResult, part: CleanResult): void {
  total.cleanedItems += part.cleanedItems;
  total.freedSpace += part.freedSpace;
  if (part.backedUpSize !== undefined) total.backedUpSize = (total.backedUpSize ?? 0) + part.backedUpSize;
  total.wouldCleanItems = (total.wouldCleanItems ?? 0) + (part.wouldCleanItems ?? 0);
  total.wouldFreeSpace = (total.wouldFreeSpace ?? 0) + (part.wouldFreeSpace ?? 0);
  total.wouldBackUpSize = (total.wouldBackUpSize ?? 0) + (part.wouldBackUpSize ?? 0);
  total.errors.push(...part.errors);
  total.outcomes = [...(total.outcomes ?? []), ...(part.outcomes ?? [])];
}

export abstract class BaseScanner implements Scanner {
  abstract category: Category;
  readonly supportsBackup: boolean = true;
  abstract scan(options?: ScannerOptions): Promise<ScanResult>;

  /** A request-local plan of closures; no singleton authorization state. */
  async prepareClean(items: CleanableItem[], backupDir?: string, context?: CleanContext): Promise<PreparedCleanup[]> {
    const checked = isRepoCategory(this.category.id) ? await validateSelected(items, this.category.id, context) : { valid: items, rejected: [] };
    const valid = new Map(checked.valid.map((item) => [item.path, item]));
    const rejected = new Map(checked.rejected.map((item) => [item.path, item.reason]));
    return Promise.all(items.map(async (selected) => {
      const item = valid.get(selected.path) ?? selected;
      const reason = rejected.get(item.path) ?? await preflightItem(item) ?? (backupDir && !backupPathFor(item.path, backupDir) ? 'BACKUP_UNSUPPORTED_PATH' : undefined);
      const recheck = async () => {
        if (isRepoCategory(this.category.id)) {
          await checkIdentity(item.path, context!.repoPolicy, context!.evidence[item.path]);
          if (!await classify(item.path, [this.category.id])) throw new EligibilityError('MARKER_MISSING');
          await checkMarkerIdentity(item.path, context!.evidence[item.path]);
        }
      };
      const execute = async (dryRun: boolean): Promise<CleanResult> => {
        const result = emptyCleanResult(this.category);
        if (backupDir) { result.backupDir = backupDir; result.backedUpSize = 0; }
        let failure = reason;
        if (!failure) {
          try {
            await recheck();
            failure = await preflightItem(item) ?? undefined;
            if (!failure && !dryRun) failure = backupDir ? (await backupItem(item, backupDir, recheck) ? undefined : 'BACKUP_FAILED') : await removeItemWithError(item.path, false, recheck) ?? undefined;
          } catch (error) { failure = reasonOf(error); }
        }
        if (failure) {
          result.errors.push(`${item.path}: ${failure}${backupDir ? ' (nothing was deleted for this item)' : ''}`);
          result.outcomes!.push({ category: this.category.id, path: item.path, scope: 'item', status: 'rejected', reason: failure, size: 0 });
        } else {
          result.outcomes!.push({ category: this.category.id, path: item.path, scope: 'item', status: dryRun ? (backupDir ? 'would-back-up' : 'would-delete') : (backupDir ? 'backed-up' : 'deleted'), size: item.size });
          if (dryRun) { result.wouldCleanItems = 1; if (backupDir) result.wouldBackUpSize = item.size; else result.wouldFreeSpace = item.size; }
          else { result.cleanedItems = 1; if (backupDir) result.backedUpSize = item.size; else result.freedSpace = item.size; }
        }
        return result;
      };
      return { item, reason, execute };
    }));
  }

  async clean(items: CleanableItem[], dryRun = false, backupDir?: string, context?: CleanContext): Promise<CleanResult> {
    const result = emptyCleanResult(this.category);
    if (backupDir) { result.backupDir = backupDir; result.backedUpSize = 0; }
    for (const action of await this.prepareClean(items, backupDir, context)) mergeCleanResult(result, await action.execute(dryRun));
    return result;
  }

  protected createResult(items: CleanableItem[], error?: string): ScanResult {
    return { category: this.category, items, totalSize: items.reduce((sum, item) => sum + item.size, 0), error };
  }
}
