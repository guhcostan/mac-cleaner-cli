import { describe, it, expect, vi, afterEach } from "vitest";
import { ALL_SCANNERS, getScanner, getAllScanners, runScans } from "./index.js";
import type { CategoryId } from "../types.js";

describe("scanners index", () => {
  it("should export all scanners", () => {
    const expectedIds: CategoryId[] = [
      "system-cache",
      "system-logs",
      "temp-files",
      "trash",
      "downloads",
      "browser-cache",
      "dev-cache",
      "homebrew",
      "docker",
      "ios-backups",
      "mail-attachments",
      "language-files",
      "large-files",
      "node-modules",
      "git-worktrees",
      "duplicates",
      "launch-agents",
    ];

    expect(Object.keys(ALL_SCANNERS).sort()).toEqual(expectedIds.sort());
  });

  it("should get scanner by category id", () => {
    const scanner = getScanner("trash");

    expect(scanner).toBeDefined();
    expect(scanner.category.id).toBe("trash");
  });

  it("should get all scanners", () => {
    const scanners = getAllScanners();

    expect(scanners).toHaveLength(17);
    for (const scanner of scanners) {
      expect(scanner.category).toBeDefined();
      expect(scanner.scan).toBeDefined();
      expect(scanner.clean).toBeDefined();
    }
  });

  it("should have scan method for all scanners", () => {
    const scanners = getAllScanners();

    for (const scanner of scanners) {
      expect(scanner.scan).toBeDefined();
      expect(typeof scanner.scan).toBe("function");
    }
  });

  it("should have clean method for all scanners", () => {
    const scanners = getAllScanners();

    for (const scanner of scanners) {
      expect(scanner.clean).toBeDefined();
      expect(typeof scanner.clean).toBe("function");
    }
  });

  it("should have matching category ids", () => {
    for (const [id, scanner] of Object.entries(ALL_SCANNERS)) {
      expect(scanner.category.id).toBe(id);
    }
  });

  it("should throw for unknown scanner category id", () => {
    expect(() => getScanner("unknown-category" as CategoryId)).toThrowError(
      "Unknown scanner category: unknown-category",
    );
  });

  /**
   * Edge case: Validates that concurrency=0 doesn't cause hangs or errors.
   * Should fall back to sequential execution when concurrency limit is 0.
   */
  it("runScans should support concurrency 0 without hanging", async () => {
    const categories: CategoryId[] = ["trash"];

    const summary = await runScans(categories, {
      parallel: true,
      concurrency: 0,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.totalItems).toBeGreaterThanOrEqual(0);
    expect(summary.totalSize).toBeGreaterThanOrEqual(0);
  });

  /**
   * Tests that both inner (options.onProgress) and outer (callback parameter) progress handlers
   * are called correctly during serial execution, tracking completed vs total scanners.
   */
  it("runScans should call progress callbacks correctly in serial mode", async () => {
    const categories: CategoryId[] = ["trash", "temp-files"];

    const outerProgressScanners: string[] = [];
    const innerProgress: Array<{
      completed: number;
      total: number;
      id: string;
    }> = [];

    const summary = await runScans(
      categories,
      {
        parallel: false,
        onProgress: (completed, total, scanner, _result) => {
          innerProgress.push({ completed, total, id: scanner.category.id });
        },
      },
      (scanner, _result) => {
        outerProgressScanners.push(scanner.category.id);
      },
    );

    expect(summary.results).toHaveLength(categories.length);

    expect(innerProgress).toHaveLength(categories.length);
    expect(innerProgress[0].completed).toBe(1);
    expect(innerProgress[0].total).toBe(categories.length);
    expect(innerProgress[1].completed).toBe(2);
    expect(innerProgress[1].total).toBe(categories.length);

    expect(outerProgressScanners).toEqual(categories);
  });

  describe("scanner failures", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should keep a throwing scanner in the results with an error", async () => {
      vi.spyOn(getScanner("trash"), "scan").mockRejectedValue(
        Object.assign(new Error("operation not permitted"), { code: "EPERM" }),
      );

      const summary = await runScans(["trash"], { parallel: true });

      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].category.id).toBe("trash");
      expect(summary.results[0].error).toContain("EPERM: operation not permitted");
      expect(summary.results[0].items).toEqual([]);
      expect(summary.totalSize).toBe(0);
    });

    it("should report the failure to progress callbacks in serial mode", async () => {
      vi.spyOn(getScanner("trash"), "scan").mockRejectedValue(new Error("boom"));

      const seen: Array<string | undefined> = [];
      const summary = await runScans(["trash"], {
        parallel: false,
        onProgress: (_completed, _total, _scanner, result) => {
          seen.push(result.error);
        },
      });

      expect(seen).toEqual([summary.results[0].error]);
      expect(summary.results[0].error).toContain("boom");
    });
  });
});
