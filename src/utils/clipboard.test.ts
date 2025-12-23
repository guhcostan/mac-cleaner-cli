import { describe, it, expect, vi, beforeEach } from "vitest";
import { copyToClipboard } from "./clipboard.js";
import * as child_process from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("copyToClipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should copy text to clipboard using pbcopy", async () => {
    const testText = "/Users/test/some/directory";
    const execSyncMock = vi.mocked(child_process.execSync);
    execSyncMock.mockReturnValueOnce(Buffer.from(""));

    await copyToClipboard(testText);

    expect(execSyncMock).toHaveBeenCalledWith("pbcopy", {
      input: testText,
      encoding: "utf-8",
    });
  });

  it("should throw error if pbcopy fails", async () => {
    const execSyncMock = vi.mocked(child_process.execSync);
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("Command not found");
    });

    await expect(copyToClipboard("/test/path")).rejects.toThrow(
      "Failed to copy to clipboard: Command not found",
    );
  });

  it("should handle empty string", async () => {
    const execSyncMock = vi.mocked(child_process.execSync);
    execSyncMock.mockReturnValueOnce(Buffer.from(""));

    await copyToClipboard("");

    expect(execSyncMock).toHaveBeenCalledWith("pbcopy", {
      input: "",
      encoding: "utf-8",
    });
  });

  it("should handle text with special characters", async () => {
    const testText = "/path/with spaces/and-special_chars!@#$%";
    const execSyncMock = vi.mocked(child_process.execSync);
    execSyncMock.mockReturnValueOnce(Buffer.from(""));

    await copyToClipboard(testText);

    expect(execSyncMock).toHaveBeenCalledWith("pbcopy", {
      input: testText,
      encoding: "utf-8",
    });
  });

  it("should handle multiline text", async () => {
    const testText = "/path/line1\n/path/line2\n/path/line3";
    const execSyncMock = vi.mocked(child_process.execSync);
    execSyncMock.mockReturnValueOnce(Buffer.from(""));

    await copyToClipboard(testText);

    expect(execSyncMock).toHaveBeenCalledWith("pbcopy", {
      input: testText,
      encoding: "utf-8",
    });
  });

  it("should handle very long paths", async () => {
    const testText =
      "/Users/test/very/deep/nested/directory/structure/that/goes/on/and/on/for/a/very/long/time";
    const execSyncMock = vi.mocked(child_process.execSync);
    execSyncMock.mockReturnValueOnce(Buffer.from(""));

    await copyToClipboard(testText);

    expect(execSyncMock).toHaveBeenCalledWith("pbcopy", {
      input: testText,
      encoding: "utf-8",
    });
  });
});
