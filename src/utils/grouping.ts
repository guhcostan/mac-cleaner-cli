import path from "node:path";
import type { CleanableItem } from "../types.js";
import type { GroupedFileDisplay } from "./checkbox.js";
import { truncateDirectoryPath } from "./paths.js";

/**
 * Represents a group of files within the same directory.
 * Used as an intermediate DS before formatting.
 */
export interface DirectoryGroup {
  path: string;
  files: CleanableItem[];
  largestFileSize: number;
}

/**
 * Represents a directory group with visibility limits applied.
 * Tracks how many files are shown vs hidden for expand/collapse behavior.
 */
export interface LimitedGroup {
  group: DirectoryGroup;
  visibleCount: number;
  hasMore: boolean;
}

/**
 * Groups files by their parent directory with sorting.
 *
 * Data transformation flow:
 * 1. Groups files by dirname into `Map<dirPath, files[]>`
 * 2. Sorts files within each directory by size (largest first)
 * 3. Sorts directories by their largest file size (hotspots at top)
 *
 * @example
 * groupByDirectory([
 *   { path: '/home/Downloads/large.zip', size: 10000 },
 *   { path: '/home/Downloads/small.zip', size: 100 },
 *   { path: '/home/Documents/doc.pdf', size: 5000 }
 * ])
 * // Returns:
 * // [
 * //   { path: '/home/Downloads', files: [large.zip, small.zip], largestFileSize: 10000 },
 * //   { path: '/home/Documents', files: [doc.pdf], largestFileSize: 5000 }
 * // ]
 */
export function groupByDirectory(files: CleanableItem[]): DirectoryGroup[] {
  const groups = new Map<string, CleanableItem[]>();

  for (const file of files) {
    const dir = path.dirname(file.path);
    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    const dirFiles = groups.get(dir);
    if (dirFiles) {
      dirFiles.push(file);
    }
  }
  return Array.from(groups.entries())
    .map(([dirPath, files]) => {
      const sortedFiles = files.sort((a, b) => b.size - a.size);
      return {
        path: dirPath,
        files: sortedFiles,
        largestFileSize: sortedFiles[0]?.size ?? 0,
      };
    })
    .sort((a, b) => b.largestFileSize - a.largestFileSize);
}

/**
 * Applies expand/collapse limits to directory groups for pagination.
 *
 * Logic - determines how many files to show per directory.
 * Supports per dir custom limits via the limits Map (user/config can expand specific dirs).
 *
 * @param groups - Directory groups from groupByDirectory()
 * @param limits - Map of dir paths to their custom limits (e.g., user expanded a dir)
 * @param defaultLimit - Default number of files to show (typically 5 or 6 7)
 *
 * @example
 * applyExpandLimits(
 *   [{ path: '/Downloads', files: [10 files], largestFileSize: 5000 }],
 *   new Map([['/Downloads', 15]]),  // User expanded this dir
 *   5  // Default for other dirs
 * )
 * // Returns: { group: {...}, visibleCount: 10, hasMore: false }
 * // (shows all 10 files since limit is 15)
 */
export function applyExpandLimits(
  groups: DirectoryGroup[],
  limits: Map<string, number>,
  defaultLimit: number,
): LimitedGroup[] {
  return groups.map((group) => {
    const limit = limits.get(group.path) ?? defaultLimit;
    const visibleCount = Math.min(limit, group.files.length);
    return {
      group,
      visibleCount,
      hasMore: group.files.length > limit,
    };
  });
}

/**
 * Formats limited directory groups into display items.
 *
 * Formatting layer - Creates the flat list structure consumed by the TUI.
 * Builds a hierarchical display with three item types:
 * - directory header: Shows dir path + total file count
 * - file: Individual selectable file entries
 * - expand hint: "Show +N more files" rows for collapsed dirs
 *
 * @param limitedGroups - Groups with visibility limits applied
 * @param absolutePaths - If true, show full paths; otherwise, use truncated
 *
 * [
 *   { type: "directory-header", displayName: "~/Downloads", ... },
 *   { type: "file", name: "large.zip", selectable: true, ... },
 *   { type: "file", name: "small.zip", selectable: true, ... },
 *   { type: "expand-hint", hiddenCount: 5, ... },  // If more files hidden
 *   { type: "directory-header", displayName: "~/Documents", ... },
 *   ...
 * ]
 */
export function formatAsDisplayItems(
  limitedGroups: LimitedGroup[],
  absolutePaths: boolean,
): GroupedFileDisplay[] {
  const result: GroupedFileDisplay[] = [];

  for (const { group, visibleCount, hasMore } of limitedGroups) {
    const truncatedDirPath = truncateDirectoryPath(group.path, absolutePaths);
    const directoryKey = group.path;

    // Add directory header
    result.push({
      type: "directory-header",
      directoryPath: group.path,
      displayName: truncatedDirPath,
      directoryKey,
      selectable: false,
      totalFilesInDir: group.files.length,
    });

    // Add visible files
    for (let i = 0; i < visibleCount; i++) {
      const file = group.files[i];
      const fileName = path.basename(file.path);
      result.push({
        type: "file",
        path: file.path,
        size: file.size,
        name: fileName,
        displayName: fileName,
        directoryKey,
        item: file,
        selectable: true,
        totalFilesInDir: group.files.length,
      });
    }

    // Add expand hint if there are more hidden files
    if (hasMore) {
      const hiddenCount = group.files.length - visibleCount;
      result.push({
        type: "expand-hint",
        directoryKey,
        hiddenCount,
        selectable: false,
        totalFilesInDir: group.files.length,
      });
    }
  }
  return result;
}

/**
 * Main entry point: Groups files by dir with full formatting.
 *
 * Wrapper that chains three conversions:
 * 1. groupByDirectory() - Data grouping & sorting
 * 2. applyExpandLimits() - Pagination logic
 * 3. formatAsDisplayItems() - TUI structure creation
 *
 * @param files - Array of cleanable items to group and display
 * @param absolutePaths - Show abs paths vs relative notation
 * @param dirExpandLimits - Map of dir paths to custom limits (for expanded dirs)
 * @param defaultLimit - Default files shown per dir before "show more" hint (default: 5)
 *
 * @returns Flat array of display items
 */
export function groupFilesByDirectory(
  files: CleanableItem[],
  absolutePaths: boolean,
  dirExpandLimits: Map<string, number>,
  defaultLimit = 5,
): GroupedFileDisplay[] {
  return formatAsDisplayItems(
    applyExpandLimits(groupByDirectory(files), dirExpandLimits, defaultLimit),
    absolutePaths,
  );
}
