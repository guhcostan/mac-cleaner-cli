import { describe, it, expect } from "vitest";
import { groupFilesByDirectory } from "./grouping.js";
import type { CleanableItem } from "../types.js";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();

describe("groupFilesByDirectory", () => {
  it("should group files by directory", () => {
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", "file1.zip"),
        name: "file1.zip",
        size: 1000,
        isDirectory: false,
      },
      {
        path: join(HOME, "Downloads", "file2.zip"),
        name: "file2.zip",
        size: 2000,
        isDirectory: false,
      },
      {
        path: join(HOME, "Documents", "doc.pdf"),
        name: "doc.pdf",
        size: 500,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    expect(result.length).toBe(5);
    expect(result[0].type).toBe("directory-header");
    expect(result[1].type).toBe("file");
    expect(result[2].type).toBe("file");
    expect(result[3].type).toBe("directory-header");
    expect(result[4].type).toBe("file");
  });

  /**
   * Directory ordering logic: directories are sorted by their largest file's size.
   * Dirs with bigger files appear first.
   */
  it("should sort directories by largest file size descending", () => {
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", "small.zip"),
        name: "small.zip",
        size: 100,
        isDirectory: false,
      },
      {
        path: join(HOME, "Documents", "huge.pdf"),
        name: "huge.pdf",
        size: 10000,
        isDirectory: false,
      },
      {
        path: join(HOME, "Movies", "medium.mp4"),
        name: "medium.mp4",
        size: 5000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    expect(result[0].type).toBe("directory-header");
    expect(result[0].directoryPath).toBe(join(HOME, "Documents"));
    expect(result[2].type).toBe("directory-header");
    expect(result[2].directoryPath).toBe(join(HOME, "Movies"));
    expect(result[4].type).toBe("directory-header");
    expect(result[4].directoryPath).toBe(join(HOME, "Downloads"));
  });

  it("should sort files within directory by size descending", () => {
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", "small.zip"),
        name: "small.zip",
        size: 100,
        isDirectory: false,
      },
      {
        path: join(HOME, "Downloads", "huge.zip"),
        name: "huge.zip",
        size: 10000,
        isDirectory: false,
      },
      {
        path: join(HOME, "Downloads", "medium.zip"),
        name: "medium.zip",
        size: 5000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    expect(result[0].type).toBe("directory-header");
    expect(result[1].size).toBe(10000);
    expect(result[2].size).toBe(5000);
    expect(result[3].size).toBe(100);
  });

  it("should use ~ notation when absolutePaths is false", () => {
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", "file.zip"),
        name: "file.zip",
        size: 1000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    expect(result[0].displayName).toContain("~");
    expect(result[0].displayName).not.toContain(HOME);
  });

  it("should use absolute paths when absolutePaths is true", () => {
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", "file.zip"),
        name: "file.zip",
        size: 1000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, true, new Map());

    expect(result[0].displayName).toContain(HOME);
    expect(result[0].displayName).not.toContain("~");
  });

  it("should preserve full file names (truncation happens in rendering)", () => {
    const longFileName = `${"a".repeat(100)}.zip`;
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", longFileName),
        name: longFileName,
        size: 1000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    expect(result[1]?.displayName).toBe(longFileName);
  });

  it("should mark directory headers as non-selectable and files as selectable", () => {
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", "file.zip"),
        name: "file.zip",
        size: 1000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    expect(result[0]?.selectable).toBe(false); // Directory header
    expect(result[1]?.selectable).toBe(true); // File
  });

  it("should set directoryKey for grouping", () => {
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", "file1.zip"),
        name: "file1.zip",
        size: 1000,
        isDirectory: false,
      },
      {
        path: join(HOME, "Downloads", "file2.zip"),
        name: "file2.zip",
        size: 2000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    const dirKey = result[0].directoryKey;
    expect(result[1].directoryKey).toBe(dirKey);
    expect(result[2].directoryKey).toBe(dirKey);
  });

  it("should handle empty array", () => {
    const result = groupFilesByDirectory([], false, new Map());
    expect(result).toEqual([]);
  });

  it("should handle single file", () => {
    const items: CleanableItem[] = [
      {
        path: join(HOME, "Downloads", "file.zip"),
        name: "file.zip",
        size: 1000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    expect(result.length).toBe(2);
    expect(result[0].type).toBe("directory-header");
    expect(result[1].type).toBe("file");
  });

  /**
   * Deeply nested directory paths are truncated in directory headers.
   */
  it("should handle deep nested paths", () => {
    const deepPath = join(
      HOME,
      "very-long-folder-name-here",
      "another-long-name",
      "third-level",
      "fourth-level",
      "fifth-level",
      "sixth-level",
    );
    const items: CleanableItem[] = [
      {
        path: join(deepPath, "file.zip"),
        name: "file.zip",
        size: 1000,
        isDirectory: false,
      },
    ];

    const result = groupFilesByDirectory(items, false, new Map());

    expect(result[0]?.displayName).toContain("~");
    expect(result[0]?.displayName).toContain("...");
    // Max display name: 50 chars (truncateDirectoryPath maxLength)
    expect(result[0]?.displayName?.length).toBeLessThanOrEqual(50);
  });
});
