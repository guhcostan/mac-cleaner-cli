import { execSync } from "node:child_process";

/** Absolute path so a hijacked $PATH cannot substitute the binary. */
const PBCOPY = "/usr/bin/pbcopy";

/**
 * Utility function - Copies text to the system clipboard using `pbcopy`.
 *
 * @remarks
 * This function only works on macOS, as it relies on the `pbcopy` command.
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    execSync(PBCOPY, {
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
        `Failed to copy: \`pbcopy\` was not found at ${PBCOPY}.`,
        { cause: error },
      );
    }
    if (error instanceof Error) {
      throw new Error(`Failed to copy to clipboard: ${error.message}`, { cause: error });
    }
    throw new Error("Failed to copy to clipboard", { cause: error });
  }
}
