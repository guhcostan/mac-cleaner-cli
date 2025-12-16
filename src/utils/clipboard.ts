import { execSync } from "node:child_process";

/**
 * Util func - Copies text to the system clipboard using `pbcopy`.
 *
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    execSync("pbcopy", {
      input: text,
      encoding: "utf-8",
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        "Failed to copy: `pbcopy` was not found. " +
          "Make sure you have `pbcopy` in your $PATH.",
      );
    }
    if (error instanceof Error) {
      throw new Error(`Failed to copy to clipboard: ${error.message}`);
    }
    throw new Error("Failed to copy to clipboard");
  }
}
