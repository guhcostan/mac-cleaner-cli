import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryId, ScanResult } from "../types.js";

vi.mock("../utils/clipboard.js", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

/**
 * These tests model the selection state transitions used inside the
 * file picker prompt for specific keys.
 *
 * Rather than re-testing the full Inquirer integration, we focus on
 * the pure state changes so behaviour stays same with the
 * impl logic.
 */

type SelectionState = {
  selectedCategories: Set<CategoryId>;
  selectedFilesByCategory: Map<CategoryId, Set<string>>;
};

function createMockScanResult(
  categoryId: CategoryId,
  categoryName: string,
  files: Array<{ path: string; size: number; name: string }>,
): ScanResult {
  return {
    category: {
      id: categoryId,
      name: categoryName,
      group: "Storage",
      description: "Test category",
      safetyLevel: "safe",
      supportsFileSelection: true,
    },
    items: files.map((f) => ({
      path: f.path,
      size: f.size,
      name: f.name,
      isDirectory: false,
    })),
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
  };
}

/**
 * Logic for pressing "a" in the files pane.
 *
 * Based on file-picker.ts:421-454
 */
function selectAllFilesInCategory(
  state: SelectionState,
  categoryResult: ScanResult,
): SelectionState {
  const categoryId = categoryResult.category.id;
  const currentFiles =
    state.selectedFilesByCategory.get(categoryId) || new Set<string>();

  const allFiles = categoryResult.items.map((item) => item.path);
  const allSelected = allFiles.every((p) => currentFiles.has(p));

  const newSelected = new Set(currentFiles);
  const newCategories = new Set(state.selectedCategories);

  if (allSelected) {
    // Deselect all files from this category
    for (const p of allFiles) {
      newSelected.delete(p);
    }
    // If no files remain selected for this category, remove the category
    if (newSelected.size === 0) {
      newCategories.delete(categoryId);
    }
  } else {
    // Select all files for this category
    for (const p of allFiles) {
      newSelected.add(p);
    }
    newCategories.add(categoryId);
  }

  const newMap = new Map(state.selectedFilesByCategory);
  newMap.set(categoryId, newSelected);

  return {
    ...state,
    selectedCategories: newCategories,
    selectedFilesByCategory: newMap,
  };
}

/**
 * Mirrors the logic for pressing "i" in the files pane.
 *
 * Based on file-picker.ts:493-521
 */
function invertFilesInCategory(
  state: SelectionState,
  categoryResult: ScanResult,
): SelectionState {
  const categoryId = categoryResult.category.id;
  const currentSelected =
    state.selectedFilesByCategory.get(categoryId) || new Set<string>();

  const allFiles = categoryResult.items.map((item) => item.path);

  const newSelected = new Set(currentSelected);
  const newCategories = new Set(state.selectedCategories);
  let hasAnySelected = false;

  for (const p of allFiles) {
    if (newSelected.has(p)) {
      newSelected.delete(p);
    } else {
      newSelected.add(p);
      hasAnySelected = true;
    }
  }

  if (hasAnySelected) {
    // At least one file became selected -> ensure category is selected
    newCategories.add(categoryId);
  } else if (newSelected.size === 0) {
    // No files remain selected for this category -> remove the category
    newCategories.delete(categoryId);
  }

  const newMap = new Map(state.selectedFilesByCategory);
  newMap.set(categoryId, newSelected);

  return {
    ...state,
    selectedCategories: newCategories,
    selectedFilesByCategory: newMap,
  };
}

/**
 * Mirrors the logic for toggling a single file with space in the files pane.
 *
 * Based on file-picker.ts:398-417
 */
function toggleSingleFile(
  state: SelectionState,
  categoryId: CategoryId,
  filePath: string,
): SelectionState {
  const currentFiles =
    state.selectedFilesByCategory.get(categoryId) || new Set<string>();

  const newSelected = new Set(currentFiles);
  const newCategories = new Set(state.selectedCategories);

  if (newSelected.has(filePath)) {
    newSelected.delete(filePath);
    if (newSelected.size === 0) {
      // If no files remain selected, remove the category
      newCategories.delete(categoryId);
    }
  } else {
    newSelected.add(filePath);
    // Auto-select parent category when selecting a file
    newCategories.add(categoryId);
  }

  const newMap = new Map(state.selectedFilesByCategory);
  newMap.set(categoryId, newSelected);

  return {
    ...state,
    selectedCategories: newCategories,
    selectedFilesByCategory: newMap,
  };
}

/**
 * Mirrors the logic for deselecting a category from the categories pane
 * (space on a selected category).
 *
 * Based on file-picker.ts:230-242
 */
function deselectCategory(
  state: SelectionState,
  categoryId: CategoryId,
): SelectionState {
  const newCategories = new Set(state.selectedCategories);
  newCategories.delete(categoryId);

  // Clear file selections for this category
  const newMap = new Map(state.selectedFilesByCategory);
  newMap.set(categoryId, new Set());

  return {
    ...state,
    selectedCategories: newCategories,
    selectedFilesByCategory: newMap,
  };
}

/**
 * Approximates the logic for pressing "d" in the files pane.
 *
 * In the real implementation, directory membership is derived from
 * grouped display items (groupFilesByDirectory + expand limits).
 * Here we model the per-directory toggle behaviour using the
 * underlying ScanResult items.
 *
 * NOTE: The impl does NOT modify selectedCategories
 * when toggling a directory; we mirror that here.
 *
 * Based on file-picker.ts:455-492
 */
function toggleDirectoryFiles(
  state: SelectionState,
  categoryResult: ScanResult,
  currentFilePath: string,
): SelectionState {
  const categoryId = categoryResult.category.id;
  const currentSelected =
    state.selectedFilesByCategory.get(categoryId) || new Set<string>();

  const directoryKey = currentFilePath.split("/").slice(0, -1).join("/");

  const filesInDirectory = categoryResult.items
    .filter((item) => {
      const itemDir = item.path.split("/").slice(0, -1).join("/");
      return itemDir === directoryKey;
    })
    .map((item) => item.path);

  const allDirSelected = filesInDirectory.every((p) => currentSelected.has(p));

  const newSelected = new Set(currentSelected);

  if (allDirSelected) {
    for (const p of filesInDirectory) {
      newSelected.delete(p);
    }
  } else {
    for (const p of filesInDirectory) {
      newSelected.add(p);
    }
  }

  const newMap = new Map(state.selectedFilesByCategory);
  newMap.set(categoryId, newSelected);

  return {
    ...state,
    // Directory toggling does not change selectedCategories in implementation
    selectedCategories: new Set(state.selectedCategories),
    selectedFilesByCategory: newMap,
  };
}

/**
 * Tests
 */

describe("filePicker selection logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("'a' key in files pane (select all)", () => {
    it("selects all files in category and marks category selected", () => {
      const files = Array.from({ length: 20 }, (_, i) => ({
        path: `/test/dir/file${i}.txt`,
        size: 1000,
        name: `file${i}.txt`,
      }));

      const categoryResult = createMockScanResult(
        "large-files",
        "Large Files",
        files,
      );

      const initial: SelectionState = {
        selectedCategories: new Set(),
        selectedFilesByCategory: new Map(),
      };

      const state = selectAllFilesInCategory(initial, categoryResult);

      const selected = state.selectedFilesByCategory.get("large-files");
      expect(selected?.size).toBe(20);
      expect(state.selectedCategories.has("large-files")).toBe(true);

      for (const file of files) {
        expect(selected?.has(file.path)).toBe(true);
      }
    });

    it("deselects all files and unmarks category when pressed again", () => {
      const files = Array.from({ length: 15 }, (_, i) => ({
        path: `/test/file${i}.txt`,
        size: 500,
        name: `file${i}.txt`,
      }));

      const categoryResult = createMockScanResult(
        "large-files",
        "Large Files",
        files,
      );

      const initial: SelectionState = {
        selectedCategories: new Set(["large-files"]),
        selectedFilesByCategory: new Map([
          ["large-files", new Set(files.map((f) => f.path))],
        ]),
      };

      const state = selectAllFilesInCategory(initial, categoryResult);

      const selected = state.selectedFilesByCategory.get("large-files");
      expect(selected?.size).toBe(0);
      expect(state.selectedCategories.has("large-files")).toBe(false);
    });
  });

  describe("'i' key in files pane (invert)", () => {
    it("inverts selection across all files in category", () => {
      const files = Array.from({ length: 12 }, (_, i) => ({
        path: `/test/file${i}.txt`,
        size: 800,
        name: `file${i}.txt`,
      }));

      const categoryResult = createMockScanResult(
        "large-files",
        "Large Files",
        files,
      );

      const initiallySelectedPaths = files.slice(0, 5).map((f) => f.path);

      const initial: SelectionState = {
        selectedCategories: new Set(["large-files"]),
        selectedFilesByCategory: new Map([
          ["large-files", new Set(initiallySelectedPaths)],
        ]),
      };

      const state = invertFilesInCategory(initial, categoryResult);

      const selected = state.selectedFilesByCategory.get("large-files");
      expect(selected?.size).toBe(7);
      expect(state.selectedCategories.has("large-files")).toBe(true);

      for (const file of files.slice(5)) {
        expect(selected?.has(file.path)).toBe(true);
      }
      for (const file of files.slice(0, 5)) {
        expect(selected?.has(file.path)).toBe(false);
      }
    });

    it("auto-selects category when inversion results in selected files", () => {
      const files = [
        { path: "/test/file1.txt", size: 100, name: "file1.txt" },
        { path: "/test/file2.txt", size: 200, name: "file2.txt" },
      ];

      const categoryResult = createMockScanResult(
        "large-files",
        "Large Files",
        files,
      );

      const initial: SelectionState = {
        selectedCategories: new Set(),
        selectedFilesByCategory: new Map(),
      };

      const state = invertFilesInCategory(initial, categoryResult);

      expect(state.selectedCategories.has("large-files")).toBe(true);
      expect(state.selectedFilesByCategory.get("large-files")?.size).toBe(2);
    });

    it("deselects category when inversion leaves no files selected", () => {
      const files = [
        { path: "/test/file1.txt", size: 100, name: "file1.txt" },
        { path: "/test/file2.txt", size: 200, name: "file2.txt" },
      ];

      const categoryResult = createMockScanResult(
        "large-files",
        "Large Files",
        files,
      );

      const initial: SelectionState = {
        selectedCategories: new Set(["large-files"]),
        selectedFilesByCategory: new Map([
          ["large-files", new Set(files.map((f) => f.path))],
        ]),
      };

      const state = invertFilesInCategory(initial, categoryResult);

      expect(state.selectedCategories.has("large-files")).toBe(false);
      expect(state.selectedFilesByCategory.get("large-files")?.size).toBe(0);
    });
  });

  describe("single-file toggle in files pane", () => {
    it("auto-selects parent category when selecting a file", () => {
      const categoryId: CategoryId = "large-files";

      const initial: SelectionState = {
        selectedCategories: new Set(),
        selectedFilesByCategory: new Map(),
      };

      const state = toggleSingleFile(initial, categoryId, "/test/file1.txt");

      expect(state.selectedCategories.has("large-files")).toBe(true);
      expect(
        state.selectedFilesByCategory
          .get("large-files")
          ?.has("/test/file1.txt"),
      ).toBe(true);
    });

    it("keeps category selected when other files remain selected", () => {
      const files = [
        { path: "/test/file1.txt", size: 100, name: "file1.txt" },
        { path: "/test/file2.txt", size: 200, name: "file2.txt" },
      ];

      const initial: SelectionState = {
        selectedCategories: new Set(["large-files"]),
        selectedFilesByCategory: new Map([
          ["large-files", new Set(files.map((f) => f.path))],
        ]),
      };

      const state = toggleSingleFile(initial, "large-files", files[0].path);

      expect(state.selectedCategories.has("large-files")).toBe(true);
      expect(state.selectedFilesByCategory.get("large-files")?.size).toBe(1);
      expect(
        state.selectedFilesByCategory.get("large-files")?.has(files[1].path),
      ).toBe(true);
    });

    it("deselects parent category when last file is deselected", () => {
      const files = [{ path: "/test/file1.txt", size: 100, name: "file1.txt" }];

      const initial: SelectionState = {
        selectedCategories: new Set(["large-files"]),
        selectedFilesByCategory: new Map([
          ["large-files", new Set([files[0].path])],
        ]),
      };

      const state = toggleSingleFile(initial, "large-files", files[0].path);

      expect(state.selectedCategories.has("large-files")).toBe(false);
      expect(state.selectedFilesByCategory.get("large-files")?.size).toBe(0);
    });
  });

  describe("category deselection clears file selections", () => {
    it("clears file selections when deselecting a category", () => {
      const files = [
        { path: "/test/file1.txt", size: 100, name: "file1.txt" },
        { path: "/test/file2.txt", size: 200, name: "file2.txt" },
      ];

      const initial: SelectionState = {
        selectedCategories: new Set(["large-files"]),
        selectedFilesByCategory: new Map([
          ["large-files", new Set(files.map((f) => f.path))],
        ]),
      };

      const state = deselectCategory(initial, "large-files");

      expect(state.selectedCategories.has("large-files")).toBe(false);
      expect(state.selectedFilesByCategory.get("large-files")?.size).toBe(0);
    });

    it("preserves file selections for other categories when deselecting one", () => {
      const initial: SelectionState = {
        selectedCategories: new Set(["large-files", "downloads"]),
        selectedFilesByCategory: new Map([
          ["large-files", new Set(["/test1/file1.txt"])],
          ["downloads", new Set(["/test2/file2.txt"])],
        ]),
      };

      const state = deselectCategory(initial, "large-files");

      expect(state.selectedCategories.has("large-files")).toBe(false);
      expect(state.selectedCategories.has("downloads")).toBe(true);
      expect(state.selectedFilesByCategory.get("large-files")?.size).toBe(0);
      expect(state.selectedFilesByCategory.get("downloads")?.size).toBe(1);
      expect(
        state.selectedFilesByCategory.get("downloads")?.has("/test2/file2.txt"),
      ).toBe(true);
    });
  });

  describe("'d' key for directory selection", () => {
    it("selects all files in the current directory only", () => {
      const files = [
        { path: "/test/dir1/file1.txt", size: 100, name: "file1.txt" },
        { path: "/test/dir1/file2.txt", size: 200, name: "file2.txt" },
        { path: "/test/dir2/file3.txt", size: 300, name: "file3.txt" },
      ];

      const categoryResult = createMockScanResult(
        "large-files",
        "Large Files",
        files,
      );

      const initial: SelectionState = {
        selectedCategories: new Set(),
        selectedFilesByCategory: new Map(),
      };

      const state = toggleDirectoryFiles(
        initial,
        categoryResult,
        files[0].path,
      );

      const selected = state.selectedFilesByCategory.get("large-files");
      expect(selected?.size).toBe(2);
      expect(selected?.has("/test/dir1/file1.txt")).toBe(true);
      expect(selected?.has("/test/dir1/file2.txt")).toBe(true);
      expect(selected?.has("/test/dir2/file3.txt")).toBe(false);

      // Category membership is unaffected by directory toggle
      expect(state.selectedCategories.size).toBe(0);
    });

    it("deselects all files in directory when toggled twice, keeping category membership", () => {
      const files = [
        { path: "/test/dir1/file1.txt", size: 100, name: "file1.txt" },
        { path: "/test/dir1/file2.txt", size: 200, name: "file2.txt" },
      ];

      const categoryResult = createMockScanResult(
        "large-files",
        "Large Files",
        files,
      );

      const initial: SelectionState = {
        selectedCategories: new Set(["large-files"]),
        selectedFilesByCategory: new Map([
          [
            "large-files",
            new Set(["/test/dir1/file1.txt", "/test/dir1/file2.txt"]),
          ],
        ]),
      };

      const state = toggleDirectoryFiles(
        initial,
        categoryResult,
        files[0].path,
      );

      const selected = state.selectedFilesByCategory.get("large-files");
      expect(selected?.size).toBe(0);
      // Category membership is unchanged by directory toggling
      expect(state.selectedCategories.has("large-files")).toBe(true);
    });

    it("only affects current directory, not others", () => {
      const files = [
        { path: "/test/dir1/file1.txt", size: 100, name: "file1.txt" },
        { path: "/test/dir1/file2.txt", size: 200, name: "file2.txt" },
        { path: "/test/dir2/file3.txt", size: 300, name: "file3.txt" },
        { path: "/test/dir2/file4.txt", size: 400, name: "file4.txt" },
      ];

      const categoryResult = createMockScanResult(
        "large-files",
        "Large Files",
        files,
      );

      const initial: SelectionState = {
        selectedCategories: new Set(["large-files"]),
        selectedFilesByCategory: new Map([
          [
            "large-files",
            new Set(["/test/dir2/file3.txt", "/test/dir2/file4.txt"]),
          ],
        ]),
      };

      const state = toggleDirectoryFiles(
        initial,
        categoryResult,
        files[0].path,
      );

      const selected = state.selectedFilesByCategory.get("large-files");
      expect(selected?.size).toBe(4);
      expect(selected?.has("/test/dir1/file1.txt")).toBe(true);
      expect(selected?.has("/test/dir1/file2.txt")).toBe(true);
      expect(selected?.has("/test/dir2/file3.txt")).toBe(true);
      expect(selected?.has("/test/dir2/file4.txt")).toBe(true);
      expect(state.selectedCategories.has("large-files")).toBe(true);
    });
  });

  describe("cross-category isolation", () => {
    it("does not affect other categories when selecting all files in one", () => {
      const filesCategory1 = [
        { path: "/test1/file1.txt", size: 100, name: "file1.txt" },
      ];

      const categoryResult1 = createMockScanResult(
        "large-files",
        "Large Files",
        filesCategory1,
      );

      const initial: SelectionState = {
        selectedCategories: new Set(["downloads"]),
        selectedFilesByCategory: new Map([
          ["downloads", new Set(["/test2/file2.txt"])],
        ]),
      };

      const state = selectAllFilesInCategory(initial, categoryResult1);

      expect(state.selectedFilesByCategory.get("downloads")?.size).toBe(1);
      expect(
        state.selectedFilesByCategory.get("downloads")?.has("/test2/file2.txt"),
      ).toBe(true);
      expect(state.selectedCategories.has("downloads")).toBe(true);

      expect(state.selectedFilesByCategory.get("large-files")?.size).toBe(1);
      expect(state.selectedCategories.has("large-files")).toBe(true);
    });

    it("does not affect other categories when deselecting one category", () => {
      const initial: SelectionState = {
        selectedCategories: new Set(["large-files", "downloads", "trash"]),
        selectedFilesByCategory: new Map([
          ["large-files", new Set(["/test1/file1.txt"])],
          ["downloads", new Set(["/test2/file2.txt"])],
          ["trash", new Set(["/test3/file3.txt"])],
        ]),
      };

      const state = deselectCategory(initial, "downloads");

      expect(state.selectedCategories.has("downloads")).toBe(false);
      expect(state.selectedFilesByCategory.get("downloads")?.size).toBe(0);

      expect(state.selectedCategories.has("large-files")).toBe(true);
      expect(state.selectedCategories.has("trash")).toBe(true);
      expect(state.selectedFilesByCategory.get("large-files")?.size).toBe(1);
      expect(state.selectedFilesByCategory.get("trash")?.size).toBe(1);
    });
  });
});
